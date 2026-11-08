-- v44 chat: server TTL, read reminders, per-user history cutoff and hide, explicit group ownership/leave.
-- Additive, no existing history is deleted. SECURITY DEFINER functions validate JWT membership.

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS chat_messages_expiry_idx ON public.chat_messages (conversation_id,expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_ultra_room_expiry (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  ttl_seconds integer NOT NULL DEFAULT 0 CHECK (ttl_seconds IN (0,30,86400,604800,7776000)),
  updated_by uuid REFERENCES public.profiles(id), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.chat_ultra_member_state (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cleared_before timestamptz,hidden_at timestamptz,
  unread_reminder boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,conversation_id));

ALTER TABLE public.chat_ultra_room_expiry ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_ultra_member_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_ultra_room_expiry,public.chat_ultra_member_state FROM PUBLIC,authenticated;

CREATE OR REPLACE FUNCTION public.v44_chat_room_state(p_conversation_ids uuid[])
RETURNS TABLE(conversation_id uuid,ttl_seconds integer,cleared_before timestamptz,hidden_at timestamptz,unread_reminder boolean)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $fn$
WITH actor AS MATERIALIZED(SELECT public.looply_legacy_uid() AS id)
SELECT membership.conversation_id,COALESCE(expiry.ttl_seconds,0),personal.cleared_before,
personal.hidden_at,COALESCE(personal.unread_reminder,false)
FROM public.conversation_participants membership CROSS JOIN actor
LEFT JOIN public.chat_ultra_room_expiry expiry ON expiry.conversation_id=membership.conversation_id
LEFT JOIN public.chat_ultra_member_state personal ON personal.conversation_id=membership.conversation_id AND personal.user_id=actor.id
WHERE actor.id IS NOT NULL AND membership.user_id=actor.id
  AND membership.conversation_id=ANY(p_conversation_ids)
ORDER BY membership.conversation_id LIMIT 200;
$fn$;

CREATE OR REPLACE FUNCTION public.v44_chat_set_expiry(p_conversation_id uuid,p_ttl_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid; room public.conversations%ROWTYPE;
BEGIN
  actor:=public.looply_legacy_uid();
  IF actor IS NULL OR p_ttl_seconds IS NULL OR p_ttl_seconds NOT IN (0,30,86400,604800,7776000) THEN RETURN false; END IF;
  SELECT * INTO room FROM public.conversations WHERE id=p_conversation_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=p_conversation_id AND user_id=actor) THEN RETURN false; END IF;
  IF room.kind='group' AND room.created_by IS DISTINCT FROM actor THEN RETURN false; END IF;
  INSERT INTO public.chat_ultra_room_expiry(conversation_id,ttl_seconds,updated_by,updated_at)
  VALUES (p_conversation_id,p_ttl_seconds,actor,pg_catalog.now())
  ON CONFLICT(conversation_id) DO UPDATE SET ttl_seconds=EXCLUDED.ttl_seconds,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.v44_chat_mark_unread(p_conversation_id uuid,p_marked boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid;
BEGIN
  actor:=public.looply_legacy_uid();
  IF actor IS NULL OR p_marked IS NULL OR NOT EXISTS(SELECT 1 FROM public.conversation_participants
      WHERE conversation_id=p_conversation_id AND user_id=actor) THEN RETURN false; END IF;
  INSERT INTO public.chat_ultra_member_state(user_id,conversation_id,unread_reminder,updated_at)
  VALUES(actor,p_conversation_id,p_marked,pg_catalog.now())
  ON CONFLICT(user_id,conversation_id) DO UPDATE SET unread_reminder=EXCLUDED.unread_reminder,updated_at=EXCLUDED.updated_at;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.v44_chat_clear_history(p_conversation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid; cutoff timestamptz;
BEGIN
  actor:=public.looply_legacy_uid();cutoff:=pg_catalog.now();
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.conversation_participants
    WHERE conversation_id=p_conversation_id AND user_id=actor) THEN RETURN false; END IF;
  INSERT INTO public.chat_ultra_member_state(user_id,conversation_id,cleared_before,unread_reminder,updated_at)
  VALUES(actor,p_conversation_id,cutoff,false,cutoff)
  ON CONFLICT(user_id,conversation_id) DO UPDATE SET
    cleared_before=EXCLUDED.cleared_before,unread_reminder=false,updated_at=EXCLUDED.updated_at;
  UPDATE public.conversation_participants SET last_read_at=cutoff
    WHERE conversation_id=p_conversation_id AND user_id=actor;
  UPDATE public.chat_notifications SET read_at=cutoff WHERE conversation_id=p_conversation_id
    AND user_id=actor AND read_at IS NULL;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.v44_chat_hide_room(p_conversation_id uuid,p_hide boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid;
BEGIN
  actor:=public.looply_legacy_uid();
  IF actor IS NULL OR p_hide IS NULL OR NOT EXISTS(SELECT 1 FROM public.conversation_participants
    WHERE conversation_id=p_conversation_id AND user_id=actor) THEN RETURN false; END IF;
  INSERT INTO public.chat_ultra_member_state(user_id,conversation_id,hidden_at,updated_at)
  VALUES(actor,p_conversation_id,CASE WHEN p_hide THEN pg_catalog.now() ELSE NULL END,pg_catalog.now())
  ON CONFLICT(user_id,conversation_id) DO UPDATE SET hidden_at=EXCLUDED.hidden_at,updated_at=EXCLUDED.updated_at;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.v44_chat_transfer_group_owner(p_conversation_id uuid,p_target_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid;
BEGIN
 actor:=public.looply_legacy_uid();
 IF actor IS NULL OR actor=p_target_user_id THEN RETURN false; END IF;
 UPDATE public.conversations room SET created_by=p_target_user_id,updated_at=pg_catalog.now()
 WHERE room.id=p_conversation_id AND room.kind='group' AND room.created_by=actor
 AND EXISTS(SELECT 1 FROM public.conversation_participants other WHERE other.conversation_id=p_conversation_id AND other.user_id=p_target_user_id);
 RETURN FOUND;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.v44_chat_leave_group(p_conversation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid; owner uuid;
BEGIN
 actor:=public.looply_legacy_uid();
 IF actor IS NULL THEN RETURN false; END IF;
 SELECT created_by INTO owner FROM public.conversations
  WHERE id=p_conversation_id AND kind='group' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF owner=actor AND EXISTS(SELECT 1 FROM public.conversation_participants
  WHERE conversation_id=p_conversation_id AND user_id<>actor) THEN RETURN false; END IF;
 DELETE FROM public.conversation_participants WHERE conversation_id=p_conversation_id AND user_id=actor;
 RETURN FOUND;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.v44_chat_expiry_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE seconds integer;
BEGIN
 SELECT ttl_seconds INTO seconds FROM public.chat_ultra_room_expiry
  WHERE conversation_id=NEW.conversation_id;
 IF COALESCE(seconds,0)>0 THEN
   NEW.expires_at:=pg_catalog.now()+pg_catalog.make_interval(secs=>seconds);
 ELSE NEW.expires_at:=NULL; END IF;
 RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.v44_chat_preserve_message_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
 NEW.id:=OLD.id;
 NEW.sender_id:=OLD.sender_id;
 NEW.conversation_id:=OLD.conversation_id;
 NEW.created_at:=OLD.created_at;
 NEW.expires_at:=OLD.expires_at;
 RETURN NEW;
END;
$fn$;

DO $block$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
 WHERE tgrelid='public.chat_messages'::pg_catalog.regclass AND tgname='chat_ultra_expiry_before_insert') THEN
 CREATE TRIGGER chat_ultra_expiry_before_insert BEFORE INSERT ON public.chat_messages
 FOR EACH ROW EXECUTE FUNCTION public.v44_chat_expiry_on_insert();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
 WHERE tgrelid='public.chat_messages'::pg_catalog.regclass AND tgname='chat_ultra_preserve_fields_before_update') THEN
 CREATE TRIGGER chat_ultra_preserve_fields_before_update BEFORE UPDATE ON public.chat_messages
 FOR EACH ROW EXECUTE FUNCTION public.v44_chat_preserve_message_fields();
 END IF;
END $block$;

CREATE OR REPLACE FUNCTION public.v44_chat_message_visible(p_conversation_id uuid,p_message_id uuid,p_created_at timestamptz)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $fn$
WITH actor AS MATERIALIZED(SELECT public.looply_legacy_uid() AS id)
SELECT actor.id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.conversation_participants
   WHERE conversation_id=p_conversation_id AND user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM public.chat_message_hidden hidden
   WHERE hidden.user_id=actor.id AND hidden.message_id=p_message_id)
 AND NOT EXISTS(SELECT 1 FROM public.chat_ultra_member_state personal
   WHERE personal.user_id=actor.id AND personal.conversation_id=p_conversation_id
   AND personal.cleared_before IS NOT NULL AND p_created_at<=personal.cleared_before)
FROM actor;
$fn$;

DO $block$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='chat_messages'
 AND policyname='chat_ultra_expiry_visibility') THEN
 CREATE POLICY chat_ultra_expiry_visibility ON public.chat_messages AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((expires_at IS NULL OR expires_at>pg_catalog.now())
  AND public.v44_chat_message_visible(conversation_id,id,created_at));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='chat_messages'
 AND policyname='chat_ultra_owner_update') THEN
 CREATE POLICY chat_ultra_owner_update ON public.chat_messages AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(sender_id=public.looply_legacy_uid()) WITH CHECK(sender_id=public.looply_legacy_uid());
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='chat_media'
 AND policyname='chat_ultra_media_visibility') THEN
 CREATE POLICY chat_ultra_media_visibility ON public.chat_media AS RESTRICTIVE FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.chat_messages message
  WHERE message.id=chat_media.message_id AND message.conversation_id=chat_media.conversation_id
   AND (message.expires_at IS NULL OR message.expires_at>pg_catalog.now())
   AND public.v44_chat_message_visible(message.conversation_id,message.id,message.created_at)));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='chat_media'
 AND policyname='chat_ultra_media_valid_insert') THEN
 CREATE POLICY chat_ultra_media_valid_insert ON public.chat_media AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.chat_messages message
   WHERE message.id=chat_media.message_id AND message.conversation_id=chat_media.conversation_id
     AND message.sender_id=public.looply_legacy_uid()));
 END IF;
END $block$;

REVOKE ALL ON FUNCTION public.v44_chat_message_visible(uuid,uuid,timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v44_chat_message_visible(uuid,uuid,timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.v44_chat_room_state(uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v44_chat_room_state(uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.v44_chat_set_expiry(uuid,integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v44_chat_set_expiry(uuid,integer) TO authenticated;

REVOKE ALL ON FUNCTION public.v44_chat_mark_unread(uuid,boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v44_chat_mark_unread(uuid,boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.v44_chat_clear_history(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v44_chat_clear_history(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.v44_chat_hide_room(uuid,boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v44_chat_hide_room(uuid,boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.v44_chat_transfer_group_owner(uuid,uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v44_chat_transfer_group_owner(uuid,uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.v44_chat_leave_group(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v44_chat_leave_group(uuid) TO authenticated;
