-- Looply 20261105 — additive, idempotent.
--
-- 1. Private-letter reads and unlocks stop being notifications. They are written
--    to a silent audit log that only the verified Peixinho administrator can read
--    in the ADM panel (no "Avisos" entry, no FCM push, no sender notice).
-- 2. Story viewers generate a normal in-app/push notification for the author.
-- 3. Private-letter password length limits are removed on the server side.
--
-- No letter body, password or ciphertext ever enters the log.

-- ───────────────────────── 1. Silent ADM letter log ─────────────────────────
CREATE TABLE IF NOT EXISTS public.looply_admin_letter_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_kind text NOT NULL CHECK (event_kind IN ('read','unlock')),
  letter_source text NOT NULL DEFAULT 'community' CHECK (letter_source IN ('community','archive')),
  letter_id uuid,
  letter_label text CHECK (letter_label IS NULL OR char_length(letter_label) <= 120),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS looply_admin_letter_access_log_recent_idx
  ON public.looply_admin_letter_access_log (created_at DESC);
CREATE INDEX IF NOT EXISTS looply_admin_letter_access_log_actor_idx
  ON public.looply_admin_letter_access_log (actor_id);
-- A first read is recorded once per reader and letter; every unlock is recorded.
CREATE UNIQUE INDEX IF NOT EXISTS looply_admin_letter_access_log_read_once_idx
  ON public.looply_admin_letter_access_log (actor_id, letter_id)
  WHERE event_kind = 'read' AND letter_id IS NOT NULL;

ALTER TABLE public.looply_admin_letter_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_admin_letter_access_log FROM PUBLIC, anonymous, authenticated;
GRANT SELECT ON public.looply_admin_letter_access_log TO authenticated;
DROP POLICY IF EXISTS looply_admin_letter_log_only_peixinho_read
  ON public.looply_admin_letter_access_log;
CREATE POLICY looply_admin_letter_log_only_peixinho_read
  ON public.looply_admin_letter_access_log FOR SELECT TO authenticated
  USING (public.v3_self_is_admin() AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = public.looply_legacy_uid() AND lower(p.username) = 'peixinho'));

-- Route letter events to the log. `admin_online` keeps its existing behaviour.
CREATE OR REPLACE FUNCTION public.v23_record_peixinho_event(
  p_actor uuid, p_kind text, p_resource uuid, p_label text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_admin uuid; v_source text;
BEGIN
  v_admin := public.v23_peixinho_admin_id();
  IF v_admin IS NULL OR p_actor IS NULL OR p_actor = v_admin OR p_kind NOT IN
     ('admin_online','admin_letter_read','admin_private_unlock') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_actor) THEN RETURN; END IF;

  IF p_kind IN ('admin_letter_read','admin_private_unlock') THEN
    IF p_resource IS NULL THEN RETURN; END IF;
    v_source := CASE WHEN COALESCE(p_label,'') LIKE 'Carta original%' THEN 'archive' ELSE 'community' END;
    IF p_kind = 'admin_private_unlock' AND EXISTS (
        SELECT 1 FROM public.looply_admin_letter_access_log l
        WHERE l.actor_id = p_actor AND l.event_kind = 'unlock' AND l.letter_id = p_resource
          AND l.created_at > clock_timestamp() - interval '30 seconds') THEN RETURN; END IF;
    INSERT INTO public.looply_admin_letter_access_log
      (actor_id, event_kind, letter_source, letter_id, letter_label)
    VALUES (p_actor,
            CASE p_kind WHEN 'admin_letter_read' THEN 'read' ELSE 'unlock' END,
            v_source, p_resource, LEFT(NULLIF(BTRIM(p_label), ''), 120))
    ON CONFLICT DO NOTHING;
    RETURN;
  END IF;

  -- admin_online (unchanged): navigation is not a new login.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_actor::text));
  IF EXISTS (SELECT 1 FROM public.looply_admin_activity_notifications n
      WHERE n.actor_id = p_actor AND n.kind = p_kind
        AND n.created_at > clock_timestamp() - interval '3 minutes') THEN RETURN; END IF;
  INSERT INTO public.looply_admin_activity_notifications(admin_id, actor_id, kind, resource_id, resource_label)
  VALUES (v_admin, p_actor, p_kind, p_resource, LEFT(NULLIF(BTRIM(p_label), ''), 120))
  ON CONFLICT DO NOTHING;
END
$fn$;
REVOKE ALL ON FUNCTION public.v23_record_peixinho_event(uuid, text, uuid, text)
  FROM PUBLIC, anonymous, authenticated;

-- Private community letters: log every protected letter read, plus any letter
-- sent by Peixinho (previous behaviour).
CREATE OR REPLACE FUNCTION public.v23_community_letter_read_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_sender uuid; v_subject text; v_protected boolean;
BEGIN
  SELECT l.sender_id, l.subject, l.is_protected INTO v_sender, v_subject, v_protected
  FROM public.community_letters l WHERE l.id = NEW.letter_id;
  IF COALESCE(v_protected, false) OR v_sender = public.v23_peixinho_admin_id() THEN
    BEGIN
      PERFORM public.v23_record_peixinho_event(NEW.reader_id, 'admin_letter_read', NEW.letter_id, v_subject);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Looply admin letter log unavailable';
    END;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.v23_community_letter_read_notice() FROM PUBLIC, anonymous, authenticated;

-- Recipient unlock: log it silently and never notify the sender.
CREATE OR REPLACE FUNCTION public.looply_register_recipient_unlock(p_letter_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_reader uuid; v_subject text;
BEGIN
  v_reader := public.looply_legacy_uid();
  IF v_reader IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT l.subject INTO v_subject
  FROM public.community_letters l
  WHERE l.id = p_letter_id AND l.is_protected = true AND l.recipient_id = v_reader
    AND l.sender_id <> v_reader;
  IF NOT FOUND THEN RAISE EXCEPTION 'protected_letter_unavailable' USING ERRCODE = '42501'; END IF;
  BEGIN
    PERFORM public.v23_record_peixinho_event(v_reader, 'admin_private_unlock', p_letter_id, v_subject);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Looply admin letter log unavailable';
  END;
  RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.looply_register_recipient_unlock(uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.looply_register_recipient_unlock(uuid) TO authenticated;

-- Move history out of the notification tables, then silence leftovers.
INSERT INTO public.looply_admin_letter_access_log
  (actor_id, event_kind, letter_source, letter_id, letter_label, created_at)
SELECT n.actor_id,
       CASE n.kind WHEN 'admin_letter_read' THEN 'read' ELSE 'unlock' END,
       CASE WHEN COALESCE(n.resource_label,'') LIKE 'Carta original%' THEN 'archive' ELSE 'community' END,
       n.resource_id, n.resource_label, n.created_at
FROM public.looply_admin_activity_notifications n
WHERE n.kind IN ('admin_letter_read','admin_private_unlock')
ON CONFLICT DO NOTHING;
DELETE FROM public.looply_admin_activity_notifications
 WHERE kind IN ('admin_letter_read','admin_private_unlock');
UPDATE public.letter_event_notifications
   SET read_at = COALESCE(read_at, clock_timestamp()),
       notified_at = COALESCE(notified_at, clock_timestamp())
 WHERE event_type = 'recipient_unlocked' AND (read_at IS NULL OR notified_at IS NULL);

-- ───────────────────────── 2. Story view notification ─────────────────────────
DO $do$
DECLARE v_kinds text;
BEGIN
  SELECT string_agg(quote_literal(k), ',') INTO v_kinds FROM (
    SELECT unnest(ARRAY['post','comment','reply','music_dedication','post_like','story_like',
                        'gallery_comment','gallery_tag','story_mention','story_view']) AS k
    UNION
    SELECT DISTINCT kind FROM public.notifications
  ) q;
  EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check';
  EXECUTE 'ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('
          || v_kinds || '))';
END
$do$;

CREATE OR REPLACE FUNCTION public.record_story_view(p_story_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  actor uuid := public.looply_legacy_uid();
  author uuid;
  inserted integer := 0;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT s.author_id INTO author FROM public.stories s
   WHERE s.id = p_story_id AND s.expires_at > pg_catalog.now();
  IF author IS NULL OR actor = author OR NOT public.v3_can_view_story(p_story_id) THEN
    RETURN false;
  END IF;
  INSERT INTO public.story_views(story_id, viewer_id)
  VALUES (p_story_id, actor)
  ON CONFLICT (story_id, viewer_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted > 0 THEN
    BEGIN
      INSERT INTO public.notifications (recipient_id, actor_id, kind, resource_id, event_id, preview)
      VALUES (author, actor, 'story_view', p_story_id,
              md5('sv:' || p_story_id::text || ':' || actor::text)::uuid,
              'visualizou seu Story.')
      ON CONFLICT (recipient_id, kind, event_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- A notification failure must never block the viewer.
      RAISE WARNING 'Looply story-view notification unavailable';
    END;
  END IF;
  RETURN inserted > 0;
END
$fn$;
REVOKE ALL ON FUNCTION public.record_story_view(uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.record_story_view(uuid) TO authenticated;

-- ───────────────────────── 3. Private-letter passwords: no length limits ─────────────────────────
-- Only emptiness is rejected. Bodies are still verified by the same decryption.
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
  -- Only a successful decryption is logged, silently, for the ADM panel.
  BEGIN
    PERFORM public.v23_record_peixinho_event(
      public.looply_legacy_uid(),'admin_private_unlock',p_card_id,
      (SELECT 'Carta original '||COALESCE(c.card_number::text,'')
       FROM public.archived_cards c WHERE c.id=p_card_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Looply archived private-letter log unavailable';
  END;
  RETURN jsonb_build_object('body',v_body);
END
$function$;
REVOKE ALL ON FUNCTION public.v13_unlock_archived_card(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v13_unlock_archived_card(uuid,text) TO authenticated;


-- Admin archive recovery / password change: remove the 7..256 and 1..256 bounds.
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
  IF p_use_password AND length(coalesce(p_new_password,'')) < 1 THEN
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

REVOKE ALL ON FUNCTION public.v14_admin_recover_archived_card(uuid,text,boolean,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v14_admin_recover_archived_card(uuid,text,boolean,text,boolean) TO authenticated;

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
  IF p_card_id IS NULL OR length(coalesce(p_new_password,'')) < 1 THEN
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

REVOKE ALL ON FUNCTION public.v13_admin_change_archived_card_password(uuid,text,text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.v13_admin_change_archived_card_password(uuid,text,text) TO authenticated;


-- Push: only the online presence event reaches Peixinho's devices. Letter
-- reads/unlocks are silent and visible solely in the ADM panel log.
CREATE OR REPLACE FUNCTION public.v22_android_fcm_named_candidates()
 RETURNS TABLE(source text, event_id uuid, kind text, resource_id uuid, conversation_id uuid, token_id uuid, fcm_token text, created_at timestamp with time zone, actor_name text, call_mode text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT e.source,e.event_id,e.kind,e.resource_id,e.conversation_id,
        e.token_id,e.fcm_token,e.created_at,
        LEFT(COALESCE(NULLIF(BTRIM(p.display_name),''),NULLIF(BTRIM(p.username),''),'Alguém'),64) AS actor_name,
        CASE WHEN e.source='incoming-call' AND c.payload->>'mode' IN ('video','audio')
             THEN c.payload->>'mode' ELSE NULL END AS call_mode
 FROM (
    SELECT v.source,v.event_id,v.kind,v.resource_id,v.conversation_id,
           v.token_id,v.fcm_token,v.created_at
    FROM public.v20_android_fcm_activity_candidates() v
    UNION ALL
    SELECT 'admin_event',n.id,n.kind,n.resource_id,NULL::uuid,t.id,t.fcm_token,n.created_at
    FROM public.looply_admin_activity_notifications n
    JOIN public.android_fcm_tokens t ON t.user_id=n.admin_id
    WHERE n.kind='admin_online'
    UNION ALL
    SELECT 'activity',n.id,n.kind,n.resource_id,NULL::uuid,t.id,t.fcm_token,n.created_at
    FROM public.notifications n
    JOIN public.android_fcm_tokens t ON t.user_id=n.recipient_id
    UNION ALL
    SELECT 'chat',n.id,
       CASE WHEN EXISTS(SELECT 1 FROM public.chat_media cm
              WHERE cm.message_id=n.message_id AND cm.mime_type LIKE 'audio/%')
            THEN 'voice' ELSE n.kind END,
       n.message_id,n.conversation_id,t.id,t.fcm_token,n.created_at
    FROM public.chat_notifications n
    JOIN public.android_fcm_tokens t ON t.user_id=n.user_id
    UNION ALL
    SELECT 'letter',n.id,'letter',n.letter_id,NULL::uuid,t.id,t.fcm_token,n.created_at
    FROM public.letter_event_notifications n
    JOIN public.android_fcm_tokens t ON t.user_id=n.recipient_id
    WHERE n.event_type='new_received'
    UNION ALL
    SELECT 'story',n.id,'story',n.story_id,NULL::uuid,t.id,t.fcm_token,n.created_at
    FROM public.android_fcm_story_events n
    JOIN public.android_fcm_tokens t ON t.user_id=n.recipient_id
 ) e
 LEFT JOIN LATERAL (
   SELECT CASE e.source
      WHEN 'activity' THEN (SELECT n.actor_id FROM public.notifications n WHERE n.id=e.event_id)
      WHEN 'admin_event' THEN (SELECT n.actor_id FROM public.looply_admin_activity_notifications n WHERE n.id=e.event_id)
      WHEN 'chat' THEN (SELECT m.sender_id FROM public.chat_messages m WHERE m.id=e.resource_id)
      WHEN 'letter' THEN (SELECT l.sender_id FROM public.letter_event_notifications l WHERE l.id=e.event_id)
      WHEN 'story' THEN (SELECT s.author_id FROM public.stories s WHERE s.id=e.resource_id)
      WHEN 'feed' THEN (SELECT p.author_id FROM public.posts p WHERE p.id=e.resource_id)
      WHEN 'post-mention' THEN (SELECT p.author_id FROM public.posts p WHERE p.id=e.resource_id)
      WHEN 'feed-comment' THEN (SELECT cm.author_id FROM public.comments cm WHERE cm.id=e.event_id)
      WHEN 'gallery' THEN (SELECT gm.owner_id FROM public.community_gallery_media gm WHERE gm.id=e.resource_id)
      WHEN 'gallery-comment' THEN (SELECT gc.author_id FROM public.community_gallery_comments gc WHERE gc.id=e.event_id)
      WHEN 'gallery-mention' THEN (SELECT gc.author_id FROM public.gallery_comment_mentions gm JOIN public.community_gallery_comments gc ON gc.id=gm.comment_id WHERE gm.source='community' AND md5('gcm:'||gm.source||':'||gm.comment_id::text||':'||gm.person_id::text)::uuid=e.event_id LIMIT 1)
      WHEN 'gallery-tag' THEN (SELECT gp.created_by FROM public.gallery_media_people gp WHERE gp.source='community' AND md5('gmt:'||gp.source||':'||gp.media_id::text||':'||gp.person_id::text)::uuid=e.event_id LIMIT 1)
      WHEN 'story-mention' THEN (SELECT sm.mentioned_by FROM public.story_mentions sm WHERE sm.id=e.event_id)
      WHEN 'community-letter' THEN (SELECT cl.sender_id FROM public.community_letters cl WHERE cl.id=e.event_id)
      WHEN 'music-dedication' THEN (SELECT d.sender_id FROM public.music_dedications d WHERE d.id=e.event_id)
      WHEN 'music-comment' THEN (SELECT mc.author_id FROM public.music_comments mc WHERE mc.id=e.event_id)
      WHEN 'music-page-comment' THEN (SELECT mc.author_id FROM public.music_page_comments mc WHERE mc.id=e.event_id)
      WHEN 'music-admin-comment' THEN (SELECT mc.author_id FROM public.admin_music_track_comments mc WHERE mc.id=e.event_id)
      WHEN 'archive-gallery-comment' THEN (SELECT ac.author_id FROM public.archive_media_comments ac WHERE ac.id=e.event_id)
      WHEN 'incoming-call' THEN (SELECT cs.sender_id FROM looply_migration.call_signal_events cs WHERE md5('cs:'||cs.id::text)::uuid=e.event_id LIMIT 1)
      WHEN 'post-like' THEN (SELECT l.user_id FROM public.post_likes l WHERE md5('pl:'||l.post_id::text||':'||l.user_id::text)::uuid=e.event_id LIMIT 1)
      WHEN 'story-like' THEN (SELECT l.user_id FROM public.story_likes l WHERE md5('sl:'||l.story_id::text||':'||l.user_id::text)::uuid=e.event_id LIMIT 1)
      WHEN 'gallery-like' THEN (SELECT l.user_id FROM public.community_gallery_media_likes l WHERE md5('gl:'||l.media_id::text||':'||l.user_id::text)::uuid=e.event_id LIMIT 1)
      ELSE NULL::uuid
   END AS actor_id
 ) a ON true
 LEFT JOIN public.profiles p ON p.id=a.actor_id
 LEFT JOIN looply_migration.call_signal_events c
   ON e.source='incoming-call' AND md5('cs:'||c.id::text)::uuid=e.event_id
$function$;

NOTIFY pgrst, 'reload schema';
