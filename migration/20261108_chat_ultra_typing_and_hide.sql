-- Chat Ultra 3.0: authorized ephemeral typing and per-user message hiding.
-- Additive migration only: no chat records, files or historic messages are deleted.
CREATE TABLE IF NOT EXISTS public.chat_typing_state (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_typed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (conversation_id,user_id)
);
ALTER TABLE public.chat_typing_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_typing_state FROM PUBLIC,authenticated;
CREATE OR REPLACE FUNCTION public.v41_chat_typing_update(p_conversation_id uuid,p_typing boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid;
BEGIN
  actor:=public.looply_legacy_uid();
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id=p_conversation_id AND user_id=actor
  ) THEN RETURN false; END IF;
  IF p_typing IS TRUE THEN
    INSERT INTO public.chat_typing_state(conversation_id,user_id,last_typed_at)
    VALUES (p_conversation_id,actor,pg_catalog.now())
    ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_typed_at=EXCLUDED.last_typed_at;
  ELSE
    DELETE FROM public.chat_typing_state WHERE conversation_id=p_conversation_id AND user_id=actor;
  END IF;
  RETURN true;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.v41_chat_typing_visible(p_conversation_id uuid)
RETURNS TABLE(user_id uuid,last_typed_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $fn$
  WITH actor AS MATERIALIZED (SELECT public.looply_legacy_uid() AS id)
  SELECT state.user_id,state.last_typed_at
  FROM public.chat_typing_state state CROSS JOIN actor
  WHERE actor.id IS NOT NULL
    AND state.conversation_id=p_conversation_id
    AND state.user_id<>actor.id
    AND state.last_typed_at>pg_catalog.now()-interval '9 seconds'
    AND EXISTS(SELECT 1 FROM public.conversation_participants member
               WHERE member.conversation_id=p_conversation_id AND member.user_id=actor.id)
  ORDER BY state.last_typed_at DESC LIMIT 50;
$fn$;
REVOKE ALL ON FUNCTION public.v41_chat_typing_update(uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v41_chat_typing_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v41_chat_typing_update(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v41_chat_typing_visible(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.chat_message_hidden (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (user_id,message_id)
);
CREATE INDEX IF NOT EXISTS chat_message_hidden_conversation_idx ON public.chat_message_hidden (user_id,conversation_id);
ALTER TABLE public.chat_message_hidden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_message_hidden FROM PUBLIC,authenticated;
CREATE OR REPLACE FUNCTION public.v41_hide_chat_message(p_message_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid; room uuid;
BEGIN
  actor:=public.looply_legacy_uid();
  IF actor IS NULL THEN RETURN false; END IF;
  SELECT m.conversation_id INTO room FROM public.chat_messages m
  WHERE m.id=p_message_id AND EXISTS (
    SELECT 1 FROM public.conversation_participants p
    WHERE p.conversation_id=m.conversation_id AND p.user_id=actor
  );
  IF room IS NULL THEN RETURN false; END IF;
  INSERT INTO public.chat_message_hidden(user_id,message_id,conversation_id)
  VALUES(actor,p_message_id,room)
  ON CONFLICT(user_id,message_id) DO NOTHING;
  RETURN true;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.v41_hidden_chat_messages(p_conversation_id uuid)
RETURNS TABLE(message_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $fn$
  WITH actor AS MATERIALIZED (SELECT public.looply_legacy_uid() AS id)
  SELECT hidden.message_id FROM public.chat_message_hidden hidden CROSS JOIN actor
  WHERE actor.id IS NOT NULL AND hidden.user_id=actor.id
    AND hidden.conversation_id=p_conversation_id
    AND EXISTS(SELECT 1 FROM public.conversation_participants p
               WHERE p.user_id=actor.id AND p.conversation_id=p_conversation_id)
  ORDER BY hidden.hidden_at DESC LIMIT 5000;
$fn$;
REVOKE ALL ON FUNCTION public.v41_hide_chat_message(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v41_hidden_chat_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v41_hide_chat_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v41_hidden_chat_messages(uuid) TO authenticated;
