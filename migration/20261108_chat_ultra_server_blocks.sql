-- Server-enforced direct/letter chat blocking. Groups are unaffected.
-- Additive migration, no existing user/chat data is removed.
CREATE TABLE IF NOT EXISTS public.chat_user_blocks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY(user_id,blocked_user_id),
  CHECK(user_id<>blocked_user_id)
);
ALTER TABLE public.chat_user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_user_blocks FROM PUBLIC,authenticated;
CREATE OR REPLACE FUNCTION public.v43_set_chat_block(p_target_user_id uuid,p_block boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid;
BEGIN
  actor:=public.looply_legacy_uid();
  IF actor IS NULL OR p_target_user_id IS NULL OR p_target_user_id=actor
    OR p_block IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_target_user_id)
  THEN RETURN false; END IF;
  IF p_block THEN
    INSERT INTO public.chat_user_blocks(user_id,blocked_user_id)
    VALUES(actor,p_target_user_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.chat_user_blocks
    WHERE user_id=actor AND blocked_user_id=p_target_user_id;
  END IF;
  RETURN true;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.v43_chat_block_states(p_conversation_ids uuid[])
RETURNS TABLE(conversation_id uuid,blocked_by_me boolean,can_chat boolean)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $fn$
  WITH actor AS MATERIALIZED(SELECT public.looply_legacy_uid() AS id)
  SELECT c.id,
    EXISTS(SELECT 1 FROM public.conversation_participants other
      JOIN public.chat_user_blocks b
        ON b.user_id=actor.id AND b.blocked_user_id=other.user_id
      WHERE other.conversation_id=c.id AND other.user_id<>actor.id),
    NOT EXISTS(SELECT 1 FROM public.conversation_participants other
      JOIN public.chat_user_blocks b
        ON (b.user_id=actor.id AND b.blocked_user_id=other.user_id)
        OR (b.blocked_user_id=actor.id AND b.user_id=other.user_id)
      WHERE other.conversation_id=c.id AND other.user_id<>actor.id)
  FROM public.conversations c CROSS JOIN actor
  WHERE actor.id IS NOT NULL AND c.id=ANY(p_conversation_ids)
    AND c.kind IN ('direct','letter')
    AND EXISTS(SELECT 1 FROM public.conversation_participants myself
      WHERE myself.conversation_id=c.id AND myself.user_id=actor.id)
  LIMIT 120;
$fn$;
CREATE OR REPLACE FUNCTION public.v43_reject_blocked_chat_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
  IF EXISTS(SELECT 1 FROM public.conversations room WHERE room.id=NEW.conversation_id
            AND room.kind IN ('direct','letter')) AND
    EXISTS(SELECT 1 FROM public.conversation_participants other
      JOIN public.chat_user_blocks b
        ON (b.user_id=NEW.sender_id AND b.blocked_user_id=other.user_id)
        OR (b.blocked_user_id=NEW.sender_id AND b.user_id=other.user_id)
      WHERE other.conversation_id=NEW.conversation_id AND other.user_id<>NEW.sender_id)
  THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='chat_blocked';
  END IF;
  RETURN NEW;
END;
$fn$;
DO $fn$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname='chat_ultra_enforce_block_before_insert'
      AND tgrelid='public.chat_messages'::pg_catalog.regclass)
  THEN
    CREATE TRIGGER chat_ultra_enforce_block_before_insert
      BEFORE INSERT ON public.chat_messages
      FOR EACH ROW EXECUTE FUNCTION public.v43_reject_blocked_chat_insert();
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.v43_set_chat_block(uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v43_chat_block_states(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v43_set_chat_block(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v43_chat_block_states(uuid[]) TO authenticated;