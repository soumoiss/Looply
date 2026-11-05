-- Apply to the production Neon database before publishing the matching frontend and push worker.
-- No old letters, reads, or audit rows are deleted. Events remain accessible only in ADM.
BEGIN;

-- Legacy sender-facing unlock events are no longer readable or acknowledged.
DROP POLICY IF EXISTS letter_event_notifications_read_own ON public.letter_event_notifications;
CREATE POLICY letter_event_notifications_read_own ON public.letter_event_notifications
 FOR SELECT TO authenticated USING (
   event_type='new_received' AND recipient_id=public.looply_legacy_uid());
DROP POLICY IF EXISTS letter_event_notifications_update_own ON public.letter_event_notifications;
CREATE POLICY letter_event_notifications_update_own ON public.letter_event_notifications
 FOR UPDATE TO authenticated USING (
   event_type='new_received' AND recipient_id=public.looply_legacy_uid())
 WITH CHECK (event_type='new_received' AND recipient_id=public.looply_legacy_uid());

-- The existing server-owned activity table records exact timestamps, actor and card.
-- It is never included in Avisos or the push queue after the matching worker update.
CREATE OR REPLACE FUNCTION public.v23_community_letter_read_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_sender uuid; v_subject text; v_protected boolean;
BEGIN
 SELECT l.sender_id,l.subject,l.is_protected INTO v_sender,v_subject,v_protected
 FROM public.community_letters l WHERE l.id=NEW.letter_id;
 IF COALESCE(v_protected,false) THEN
   BEGIN
     PERFORM public.v23_record_peixinho_event(NEW.reader_id,'admin_letter_read',NEW.letter_id,v_subject);
   EXCEPTION WHEN OTHERS THEN
     RAISE WARNING 'Looply admin letter-read notice unavailable';
   END;
 END IF;
 RETURN NEW;
END
$fn$;
CREATE OR REPLACE FUNCTION public.v23_archived_card_read_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_number integer; v_protected boolean;
BEGIN
 SELECT c.card_number,c.is_protected INTO v_number,v_protected FROM public.archived_cards c WHERE c.id=NEW.card_id;
 IF FOUND AND COALESCE(v_protected,false) THEN
   BEGIN
     PERFORM public.v23_record_peixinho_event(NEW.user_id,'admin_letter_read',NEW.card_id,
       'Carta original '||COALESCE(v_number::text,''));
   EXCEPTION WHEN OTHERS THEN
     RAISE WARNING 'Looply admin archived-letter read notice unavailable';
   END;
 END IF;
 RETURN NEW;
END
$fn$;

-- All nonempty passwords are accepted. Ciphertext and audit remain server-side.
CREATE OR REPLACE FUNCTION public.v13_unlock_archived_card(p_card_id uuid, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_encrypted bytea;
  v_body text;
  v_attempts integer;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF p_card_id IS NULL OR p_password IS NULL OR length(p_password) < 1 THEN
    RAISE EXCEPTION 'invalid_card_unlock' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.archived_cards card
    WHERE card.id=p_card_id AND card.is_protected
      AND (
        EXISTS (
          SELECT 1 FROM looply_migration.verified_identity_links identity_link
          WHERE identity_link.legacy_user_id=card.recipient_id
            AND identity_link.neon_user_id=v_actor
        )
        OR public.v3_self_is_admin()
      )
  ) THEN
    RAISE EXCEPTION 'card_unavailable' USING ERRCODE='42501';
  END IF;
  SELECT secret.encrypted_body INTO v_encrypted
  FROM looply_private.archived_card_secrets secret WHERE secret.card_id=p_card_id;
  IF v_encrypted IS NULL THEN RETURN jsonb_build_object('error','protected_archive_not_restored'); END IF;
  INSERT INTO looply_private.archived_card_unlock_attempts(card_id,user_id,window_started_at,attempts)
  VALUES(p_card_id,v_actor,clock_timestamp(),1)
  ON CONFLICT(card_id,user_id) DO UPDATE SET
    attempts=CASE WHEN excluded.window_started_at-looply_private.archived_card_unlock_attempts.window_started_at >= interval '15 minutes'
                  THEN 1 ELSE looply_private.archived_card_unlock_attempts.attempts+1 END,
    window_started_at=CASE WHEN excluded.window_started_at-looply_private.archived_card_unlock_attempts.window_started_at >= interval '15 minutes'
                           THEN excluded.window_started_at ELSE looply_private.archived_card_unlock_attempts.window_started_at END
  RETURNING attempts INTO v_attempts;
  IF v_attempts > 8 THEN RETURN jsonb_build_object('error','too_many_unlock_attempts'); END IF;
  BEGIN
    v_body:=public.pgp_sym_decrypt(v_encrypted,p_password);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error','incorrect_password');
  END;
  DELETE FROM looply_private.archived_card_unlock_attempts
  WHERE card_id=p_card_id AND user_id=v_actor;
  -- Only successful server-side decryption creates a private-letter audit.
  -- Notification failures must never prevent the authorized user reading.
  BEGIN
    PERFORM public.v23_record_peixinho_event(
      public.looply_legacy_uid(),'admin_private_unlock',p_card_id,
      (SELECT 'Carta original '||COALESCE(c.card_number::text,'')
       FROM public.archived_cards c WHERE c.id=p_card_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Looply archived private-letter audit unavailable';
  END;
  RETURN jsonb_build_object('body',v_body);
END
$function$;

CREATE OR REPLACE FUNCTION public.v13_admin_change_archived_card_password(
  p_card_id uuid,
  p_new_password text,
  p_new_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_card_id IS NULL OR coalesce(p_new_password,'') = '' THEN
    RAISE EXCEPTION 'invalid_password_change_request' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_new_body,'')) NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'explicit_archive_body_required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.archived_cards WHERE id=p_card_id AND is_protected=true) THEN
    RETURN jsonb_build_object('error','card_unavailable');
  END IF;
  PERFORM 1 FROM looply_private.archived_card_secrets WHERE card_id=p_card_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','protected_archive_not_restored'); END IF;
  UPDATE looply_private.archived_card_secrets
  SET encrypted_body=public.pgp_sym_encrypt(p_new_body,p_new_password,'cipher-algo=aes256, compress-algo=1'),
      source_sha256=encode(public.digest(convert_to(p_new_body,'UTF8'),'sha256'),'hex'),
      restored_at=clock_timestamp()
  WHERE card_id=p_card_id;
  DELETE FROM looply_private.archived_card_unlock_attempts WHERE card_id=p_card_id;
  RETURN jsonb_build_object('updated',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.v14_admin_recover_archived_card(
  p_card_id uuid, p_new_body text, p_use_password boolean,
  p_new_password text, p_confirm_replace boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog
AS $func$
DECLARE
  v_actor uuid;
  v_old_cipher bytea;
  v_old_sha text;
  v_old_at timestamptz;
  v_plain text;
  v_old_protected boolean;
  v_new_cipher bytea;
  v_sha text;
  v_verified text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  -- Recovery is deliberately scoped to MiSol's one documented original card.
  IF p_card_id IS DISTINCT FROM '98df71c4-cf50-42fe-98d2-357d12633356'::uuid THEN
    RETURN jsonb_build_object('error','recovery_scope_restricted');
  END IF;
  IF p_confirm_replace IS DISTINCT FROM true OR p_use_password IS NULL
     OR p_new_body IS NULL OR length(p_new_body) NOT BETWEEN 1 AND 100000
     OR btrim(p_new_body) = '' THEN
    RETURN jsonb_build_object('error','invalid_recovery_input');
  END IF;
  IF p_use_password AND coalesce(p_new_password,'') = '' THEN
    RETURN jsonb_build_object('error','invalid_recovery_password');
  END IF;
  IF NOT p_use_password AND length(coalesce(p_new_password,'')) <> 0 THEN
    RETURN jsonb_build_object('error','unexpected_password');
  END IF;
  SELECT body, is_protected INTO v_plain, v_old_protected
  FROM public.archived_cards
  WHERE id=p_card_id AND original_file='Misolcartaprivada1.txt'
    AND is_private=true FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','card_unavailable'); END IF;
  SELECT encrypted_body, source_sha256, restored_at
    INTO v_old_cipher, v_old_sha, v_old_at
  FROM looply_private.archived_card_secrets WHERE card_id=p_card_id FOR UPDATE;
  IF v_old_cipher IS NULL AND v_plain IS NULL THEN
    -- Never silently create a letter if the original has no recoverable record.
    RETURN jsonb_build_object('error','original_record_missing');
  END IF;
  v_sha := encode(public.digest(convert_to(p_new_body,'UTF8'),'sha256'),'hex');
  IF p_use_password THEN
    v_new_cipher := public.pgp_sym_encrypt(
      p_new_body, p_new_password, 'cipher-algo=aes256, compress-algo=1'
    );
    IF public.pgp_sym_decrypt(v_new_cipher,p_new_password) IS DISTINCT FROM p_new_body THEN
      RAISE EXCEPTION 'cipher_verification_failed';
    END IF;
  END IF;
  -- Preserve the previous ciphertext and public-body state BEFORE any replacement.
  INSERT INTO looply_private.archived_card_recovery_history (
    card_id, previous_encrypted_body, previous_public_body,
    previous_source_sha256, previous_restored_at, previous_is_protected,
    changed_by
  ) VALUES (
    p_card_id, v_old_cipher, v_plain, v_old_sha, v_old_at,
    v_old_protected, v_actor
  );
  UPDATE public.archived_cards
    SET is_protected=p_use_password,
        body=CASE WHEN p_use_password THEN NULL ELSE p_new_body END
    WHERE id=p_card_id;
  IF p_use_password THEN
    INSERT INTO looply_private.archived_card_secrets (
      card_id, encrypted_body, source_sha256, restored_at
    ) VALUES (p_card_id,v_new_cipher,v_sha,clock_timestamp())
    ON CONFLICT (card_id) DO UPDATE
      SET encrypted_body=EXCLUDED.encrypted_body,
          source_sha256=EXCLUDED.source_sha256,
          restored_at=EXCLUDED.restored_at;
    SELECT public.pgp_sym_decrypt(encrypted_body,p_new_password)
      INTO v_verified
    FROM looply_private.archived_card_secrets WHERE card_id=p_card_id;
  ELSE
    DELETE FROM looply_private.archived_card_secrets WHERE card_id=p_card_id;
    SELECT body INTO v_verified FROM public.archived_cards WHERE id=p_card_id;
  END IF;
  IF v_verified IS DISTINCT FROM p_new_body THEN
    RAISE EXCEPTION 'content_verification_failed';
  END IF;
  INSERT INTO looply_private.archived_card_recovery_integrity (
    card_id,source_sha256,is_protected,changed_by,changed_at
  ) VALUES (p_card_id,v_sha,p_use_password,v_actor,clock_timestamp())
  ON CONFLICT (card_id) DO UPDATE
    SET source_sha256=EXCLUDED.source_sha256,
        is_protected=EXCLUDED.is_protected,
        changed_by=EXCLUDED.changed_by,
        changed_at=EXCLUDED.changed_at;
  DELETE FROM looply_private.archived_card_unlock_attempts WHERE card_id=p_card_id;
  RETURN jsonb_build_object(
    'updated',true,'verified',true,'is_protected',p_use_password,
    'source_sha256',v_sha
  );
END
$func$;


-- An owner explicitly marks an active story as a Highlight. The view trigger
-- sends exactly one notice per viewer and story; it never trusts client actor IDs.
CREATE TABLE IF NOT EXISTS public.story_highlights (
  story_id uuid PRIMARY KEY REFERENCES public.stories(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.story_highlights FROM PUBLIC,anonymous,authenticated;
GRANT SELECT ON public.story_highlights TO authenticated;
DROP POLICY IF EXISTS story_highlights_visible ON public.story_highlights;
CREATE POLICY story_highlights_visible ON public.story_highlights FOR SELECT TO authenticated
 USING (public.v3_can_view_story(story_id));

CREATE OR REPLACE FUNCTION public.v37_keep_story_highlight(p_story_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $highlight$
DECLARE v_owner uuid := public.looply_legacy_uid();
BEGIN
 IF v_owner IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.stories s WHERE s.id=p_story_id
     AND s.author_id=v_owner AND s.expires_at>now()) THEN RETURN false; END IF;
 INSERT INTO public.story_highlights(story_id,owner_id)
 VALUES(p_story_id,v_owner) ON CONFLICT(story_id) DO NOTHING;
 RETURN true;
END $highlight$;
REVOKE ALL ON FUNCTION public.v37_keep_story_highlight(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v37_keep_story_highlight(uuid) TO authenticated;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
 CHECK (kind IN ('post','comment','reply','music_dedication','post_like',
   'story_like','gallery_comment','gallery_tag','story_mention','highlight_view'));

CREATE OR REPLACE FUNCTION public.record_story_view(p_story_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  actor uuid := public.looply_legacy_uid();
  author uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT s.author_id INTO author FROM public.stories s
    WHERE s.id=p_story_id AND (s.expires_at>pg_catalog.now()
      OR EXISTS (SELECT 1 FROM public.story_highlights h WHERE h.story_id=s.id));
  IF author IS NULL OR actor=author OR NOT public.v3_can_view_story(p_story_id) THEN
    RETURN false;
  END IF;
  INSERT INTO public.story_views(story_id,viewer_id)
    VALUES(p_story_id,actor)
    ON CONFLICT (story_id,viewer_id) DO UPDATE
      SET last_viewed_at=clock_timestamp(), view_count=public.story_views.view_count+1;
  RETURN FOUND;
END
$fn$;


-- Highlights remain viewable after the 24-hour Why Now period, with their
-- original audience; ordinary expired stories still disappear and are collected.
CREATE OR REPLACE FUNCTION public.v3_can_view_story(p_story_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $access$
 SELECT (SELECT public.looply_legacy_uid()) IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.stories s WHERE s.id=p_story_id
     AND (s.expires_at>pg_catalog.now() OR EXISTS(
       SELECT 1 FROM public.story_highlights h WHERE h.story_id=s.id))
     AND (s.author_id=(SELECT public.looply_legacy_uid()) OR s.visibility='public'
       OR (s.visibility='selected' AND EXISTS(
         SELECT 1 FROM public.story_recipients r WHERE r.story_id=s.id
           AND r.recipient_id=(SELECT public.looply_legacy_uid())))));
$access$;
REVOKE ALL ON FUNCTION public.v3_can_view_story(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v3_can_view_story(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION looply_private.gc_expired_stories(max_rows integer DEFAULT 30)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $gc$
DECLARE removed integer;
BEGIN
 WITH due AS (
   SELECT s.id FROM public.stories s WHERE s.expires_at<=clock_timestamp()
     AND NOT EXISTS(SELECT 1 FROM public.story_highlights h WHERE h.story_id=s.id)
   ORDER BY s.expires_at LIMIT LEAST(GREATEST(max_rows,1),30) FOR UPDATE SKIP LOCKED
 ), deleted AS (
   DELETE FROM public.stories s USING due WHERE s.id=due.id RETURNING s.id
 ) SELECT count(*) INTO removed FROM deleted;
 RETURN removed;
END $gc$;
REVOKE ALL ON FUNCTION looply_private.gc_expired_stories(integer) FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.v37_notify_highlight_view()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $highlight$
DECLARE v_owner uuid;
BEGIN
 SELECT h.owner_id INTO v_owner FROM public.story_highlights h
 WHERE h.story_id=NEW.story_id;
 IF v_owner IS NULL OR v_owner=NEW.viewer_id THEN RETURN NEW; END IF;
 INSERT INTO public.notifications(recipient_id,actor_id,kind,resource_id,event_id,preview)
 VALUES(v_owner,NEW.viewer_id,'highlight_view',NEW.story_id,
   md5('highlight-view:'||NEW.story_id::text||':'||NEW.viewer_id::text)::uuid,
   'Visualizou seu Highlight')
 ON CONFLICT(recipient_id,kind,event_id) DO NOTHING;
 RETURN NEW;
END $highlight$;
REVOKE ALL ON FUNCTION public.v37_notify_highlight_view() FROM PUBLIC,anonymous,authenticated;
DROP TRIGGER IF EXISTS looply_v37_highlight_view ON public.story_views;
CREATE TRIGGER looply_v37_highlight_view AFTER INSERT OR UPDATE ON public.story_views
 FOR EACH ROW EXECUTE FUNCTION public.v37_notify_highlight_view();

COMMIT;
