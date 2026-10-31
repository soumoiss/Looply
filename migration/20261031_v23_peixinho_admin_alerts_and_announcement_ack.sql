-- Looply V23. Additive, sender-verified notices. No old content modified.
-- Private letters and passwords never become notification payloads.
CREATE TABLE IF NOT EXISTS public.looply_admin_activity_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('admin_online','admin_letter_read','admin_private_unlock')),
  resource_id uuid,
  resource_label text CHECK(resource_label IS NULL OR char_length(resource_label)<=120),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS looply_admin_activity_recent_idx
 ON public.looply_admin_activity_notifications(admin_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS looply_admin_letter_read_once_idx
 ON public.looply_admin_activity_notifications(admin_id,kind,actor_id,resource_id)
 WHERE kind='admin_letter_read';
ALTER TABLE public.looply_admin_activity_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_admin_activity_notifications FROM PUBLIC,anonymous,authenticated;
GRANT SELECT,UPDATE(read_at) ON public.looply_admin_activity_notifications TO authenticated;
DROP POLICY IF EXISTS looply_admin_activity_only_peixinho_read ON public.looply_admin_activity_notifications;
CREATE POLICY looply_admin_activity_only_peixinho_read
 ON public.looply_admin_activity_notifications FOR SELECT TO authenticated
 USING (admin_id=public.looply_legacy_uid() AND public.v3_self_is_admin()
   AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=admin_id AND lower(p.username)='peixinho'));
DROP POLICY IF EXISTS looply_admin_activity_only_peixinho_update ON public.looply_admin_activity_notifications;
CREATE POLICY looply_admin_activity_only_peixinho_update
 ON public.looply_admin_activity_notifications FOR UPDATE TO authenticated
 USING (admin_id=public.looply_legacy_uid() AND public.v3_self_is_admin()
   AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=admin_id AND lower(p.username)='peixinho'))
 WITH CHECK (admin_id=public.looply_legacy_uid() AND public.v3_self_is_admin()
   AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=admin_id AND lower(p.username)='peixinho'));

CREATE OR REPLACE FUNCTION public.v23_peixinho_admin_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT p.id FROM public.profiles p
 JOIN looply_migration.verified_identity_links links ON links.legacy_user_id=p.id
 JOIN neon_auth."user" au ON au.id=links.neon_user_id
 WHERE lower(p.username)='peixinho' AND au.role='admin' AND NOT COALESCE(au.banned,false)
 LIMIT 1
$fn$;
REVOKE ALL ON FUNCTION public.v23_peixinho_admin_id() FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.v23_record_peixinho_event(
 p_actor uuid,p_kind text,p_resource uuid,p_label text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_admin uuid;
BEGIN
 v_admin:=public.v23_peixinho_admin_id();
 IF v_admin IS NULL OR p_actor IS NULL OR p_actor=v_admin OR p_kind NOT IN
   ('admin_online','admin_letter_read','admin_private_unlock') THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor) THEN RETURN; END IF;
 IF p_kind='admin_online' THEN
   -- Navigation between Looply pages is not a new login. Limit duplicate pings.
   PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_actor::text));
   IF EXISTS(SELECT 1 FROM public.looply_admin_activity_notifications n
      WHERE n.actor_id=p_actor AND n.kind=p_kind
        AND n.created_at>clock_timestamp()-interval '3 minutes') THEN RETURN; END IF;
 ELSIF p_resource IS NULL THEN RETURN;
 ELSIF p_kind='admin_private_unlock' AND EXISTS(
    SELECT 1 FROM public.looply_admin_activity_notifications n
    WHERE n.actor_id=p_actor AND n.kind=p_kind AND n.resource_id=p_resource
      AND n.created_at>clock_timestamp()-interval '30 seconds') THEN RETURN;
 END IF;
 INSERT INTO public.looply_admin_activity_notifications(admin_id,actor_id,kind,resource_id,resource_label)
 VALUES(v_admin,p_actor,p_kind,p_resource,LEFT(NULLIF(BTRIM(p_label),''),120))
 ON CONFLICT DO NOTHING;
END
$fn$;
REVOKE ALL ON FUNCTION public.v23_record_peixinho_event(uuid,text,uuid,text)
 FROM PUBLIC,anonymous,authenticated;

-- Authenticated user acknowledges only a currently active announcement.
-- This avoids direct-client upsert/RLS mismatch on Android WebView.
CREATE OR REPLACE FUNCTION public.v23_mark_global_announcement_read(p_announcement_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_reader uuid;
BEGIN
 v_reader:=public.looply_legacy_uid();
 IF v_reader IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.global_announcements a
   WHERE a.id=p_announcement_id AND a.is_active=true
     AND a.starts_at<=now() AND (a.expires_at IS NULL OR a.expires_at>now())) THEN
    RAISE EXCEPTION 'announcement_not_available' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.global_announcement_reads(announcement_id,user_id,read_at)
 VALUES(p_announcement_id,v_reader,clock_timestamp()) ON CONFLICT DO NOTHING;
 RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.v23_mark_global_announcement_read(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v23_mark_global_announcement_read(uuid) TO authenticated;

-- Only the authenticated, actual recipient may acknowledge first reading.
CREATE TABLE IF NOT EXISTS public.looply_community_letter_reads (
 letter_id uuid NOT NULL REFERENCES public.community_letters(id) ON DELETE CASCADE,
 reader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(letter_id,reader_id)
);
ALTER TABLE public.looply_community_letter_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_community_letter_reads FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.v23_mark_community_letter_read(p_letter_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_reader uuid; v_sender uuid;
BEGIN
 v_reader:=public.looply_legacy_uid();
 IF v_reader IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 SELECT l.sender_id INTO v_sender FROM public.community_letters l
 WHERE l.id=p_letter_id AND l.recipient_id=v_reader;
 IF NOT FOUND THEN RAISE EXCEPTION 'letter_not_authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO public.looply_community_letter_reads(letter_id,reader_id)
 VALUES(p_letter_id,v_reader) ON CONFLICT DO NOTHING;
 RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.v23_mark_community_letter_read(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v23_mark_community_letter_read(uuid) TO authenticated;

-- Presence indicates that a verified user opened/resumed Looply, not
-- continuous location tracking or a permanent background process.
CREATE OR REPLACE FUNCTION public.v23_register_app_open()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_actor uuid;
BEGIN
 v_actor:=public.looply_legacy_uid();
 IF v_actor IS NULL THEN RETURN false; END IF;
 PERFORM public.v23_record_peixinho_event(v_actor,'admin_online',NULL,'Acessou o aplicativo');
 RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.v23_register_app_open() FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v23_register_app_open() TO authenticated;

CREATE OR REPLACE FUNCTION public.v23_community_letter_read_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_sender uuid; v_subject text;
BEGIN
 SELECT l.sender_id,l.subject INTO v_sender,v_subject
 FROM public.community_letters l WHERE l.id=NEW.letter_id;
 IF v_sender=public.v23_peixinho_admin_id() THEN
   BEGIN
     PERFORM public.v23_record_peixinho_event(NEW.reader_id,'admin_letter_read',NEW.letter_id,v_subject);
   EXCEPTION WHEN OTHERS THEN
     RAISE WARNING 'Looply admin letter-read notice unavailable';
   END;
 END IF;
 RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.v23_community_letter_read_notice() FROM PUBLIC,anonymous,authenticated;
DROP TRIGGER IF EXISTS looply_v23_community_letter_read_notice ON public.looply_community_letter_reads;
CREATE TRIGGER looply_v23_community_letter_read_notice
 AFTER INSERT ON public.looply_community_letter_reads
 FOR EACH ROW EXECUTE FUNCTION public.v23_community_letter_read_notice();

CREATE OR REPLACE FUNCTION public.v23_archived_card_read_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_number integer;
BEGIN
 SELECT c.card_number INTO v_number FROM public.archived_cards c WHERE c.id=NEW.card_id;
 IF FOUND THEN
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
REVOKE ALL ON FUNCTION public.v23_archived_card_read_notice() FROM PUBLIC,anonymous,authenticated;
DROP TRIGGER IF EXISTS looply_v23_archived_card_read_notice ON public.archived_card_reads;
CREATE TRIGGER looply_v23_archived_card_read_notice AFTER INSERT
 ON public.archived_card_reads FOR EACH ROW
 EXECUTE FUNCTION public.v23_archived_card_read_notice();

CREATE OR REPLACE FUNCTION public.v23_community_private_unlock_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_subject text;v_protected boolean;
BEGIN
 IF NEW.event_type='recipient_unlocked' AND NEW.letter_type='community_letter' THEN
   SELECT l.subject,l.is_protected INTO v_subject,v_protected
   FROM public.community_letters l
   WHERE l.id=NEW.letter_id AND l.recipient_id=NEW.recipient_id;
   IF COALESCE(v_protected,false) THEN
     BEGIN
       PERFORM public.v23_record_peixinho_event(
         NEW.recipient_id,'admin_private_unlock',NEW.letter_id,v_subject);
     EXCEPTION WHEN OTHERS THEN
       RAISE WARNING 'Looply admin community-letter unlock notice unavailable';
     END;
   END IF;
 END IF;
 RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.v23_community_private_unlock_notice() FROM PUBLIC,anonymous,authenticated;
DROP TRIGGER IF EXISTS looply_v23_community_private_unlock_notice ON public.letter_event_notifications;
CREATE TRIGGER looply_v23_community_private_unlock_notice AFTER INSERT
 ON public.letter_event_notifications FOR EACH ROW
 EXECUTE FUNCTION public.v23_community_private_unlock_notice();

-- Server-side decryption: emit an audit only AFTER successful password verification.
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
  IF p_card_id IS NULL OR p_password IS NULL OR length(p_password) < 1 OR length(p_password) > 256 THEN
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

-- The existing FCM SQL queue now includes only Peixinho-authorized
-- administrative events. Identity is resolved by the existing profile join.
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

-- Restore the missing production RPC used ONLY after successful client-side
-- decryption. The Neon server validates the real recipient; no client-supplied
-- sender, actor or recipient ID is trusted and no password is logged.
CREATE OR REPLACE FUNCTION public.looply_register_recipient_unlock(p_letter_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_reader uuid;v_sender uuid;
BEGIN
 v_reader:=public.looply_legacy_uid();
 IF v_reader IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 SELECT l.sender_id INTO v_sender
 FROM public.community_letters l
 WHERE l.id=p_letter_id AND l.is_protected=true AND l.recipient_id=v_reader
   AND l.sender_id<>v_reader;
 IF NOT FOUND THEN RAISE EXCEPTION 'protected_letter_unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.letter_event_notifications(
   recipient_id,sender_id,letter_type,letter_id,event_type)
 VALUES(v_reader,v_sender,'community_letter',p_letter_id,'recipient_unlocked')
 ON CONFLICT(recipient_id,letter_type,letter_id,event_type) DO NOTHING;
 RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.looply_register_recipient_unlock(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.looply_register_recipient_unlock(uuid) TO authenticated;
