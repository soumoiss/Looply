-- Per-account saved/pinned Chat Ultra messages, limited to three pins per conversation.
-- Additive, JWT-scoped: no existing message or attachment is modified/deleted.
CREATE TABLE IF NOT EXISTS public.chat_message_flags (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  saved_at timestamptz,
  pinned_at timestamptz,
  PRIMARY KEY (user_id,message_id)
);
CREATE INDEX IF NOT EXISTS chat_message_flags_room_idx ON public.chat_message_flags(user_id,conversation_id);
ALTER TABLE public.chat_message_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_message_flags FROM PUBLIC,authenticated;

CREATE OR REPLACE FUNCTION public.v42_set_chat_message_flag(p_message_id uuid,p_flag text,p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid; room uuid;stamp timestamptz;
BEGIN
  actor:=public.looply_legacy_uid();
  IF actor IS NULL OR p_flag NOT IN ('saved','pinned') OR p_enabled IS NULL THEN RETURN false; END IF;
  SELECT m.conversation_id INTO room FROM public.chat_messages m
  WHERE m.id=p_message_id AND EXISTS(
    SELECT 1 FROM public.conversation_participants member
    WHERE member.user_id=actor AND member.conversation_id=m.conversation_id
  );
  IF room IS NULL THEN RETURN false; END IF;
  stamp:=CASE WHEN p_enabled THEN pg_catalog.now() ELSE NULL END;
  INSERT INTO public.chat_message_flags(user_id,conversation_id,message_id,saved_at,pinned_at)
  VALUES(actor,room,p_message_id,
    CASE WHEN p_flag='saved' THEN stamp ELSE NULL END,
    CASE WHEN p_flag='pinned' THEN stamp ELSE NULL END)
  ON CONFLICT(user_id,message_id) DO UPDATE SET
    saved_at=CASE WHEN p_flag='saved' THEN stamp ELSE chat_message_flags.saved_at END,
    pinned_at=CASE WHEN p_flag='pinned' THEN stamp ELSE chat_message_flags.pinned_at END;
  IF p_flag='pinned' AND p_enabled THEN
    UPDATE public.chat_message_flags flags SET pinned_at=NULL
    WHERE flags.user_id=actor AND flags.conversation_id=room
      AND flags.message_id IN (
        SELECT older.message_id FROM public.chat_message_flags older
        WHERE older.user_id=actor AND older.conversation_id=room
          AND older.pinned_at IS NOT NULL
        ORDER BY older.pinned_at DESC,older.message_id DESC OFFSET 3
      );
  END IF;
  RETURN true;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.v42_chat_message_flags(p_conversation_id uuid)
RETURNS TABLE(message_id uuid,saved boolean,pinned boolean)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $fn$
  WITH actor AS MATERIALIZED(SELECT public.looply_legacy_uid() AS id)
  SELECT flags.message_id,flags.saved_at IS NOT NULL,flags.pinned_at IS NOT NULL
  FROM public.chat_message_flags flags CROSS JOIN actor
  WHERE actor.id IS NOT NULL AND flags.user_id=actor.id AND flags.conversation_id=p_conversation_id
    AND EXISTS(SELECT 1 FROM public.conversation_participants member
               WHERE member.user_id=actor.id AND member.conversation_id=p_conversation_id)
    AND (flags.saved_at IS NOT NULL OR flags.pinned_at IS NOT NULL)
  ORDER BY GREATEST(flags.saved_at,flags.pinned_at) DESC NULLS LAST LIMIT 2000;
$fn$;
REVOKE ALL ON FUNCTION public.v42_set_chat_message_flag(uuid,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v42_chat_message_flags(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v42_set_chat_message_flag(uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v42_chat_message_flags(uuid) TO authenticated;