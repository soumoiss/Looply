-- Looply · premium chat emoji reactions (additive, keeps every existing message).
CREATE TABLE IF NOT EXISTS public.chat_message_reactions(
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK(emoji IN ('❤️','😂','😮','😢','🙏','👍')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_reactions_pkey PRIMARY KEY(message_id,user_id),
  CONSTRAINT chat_message_reactions_emoji_nonempty CHECK(length(emoji)>0)
);
CREATE INDEX IF NOT EXISTS chat_message_reactions_conversation_idx
  ON public.chat_message_reactions(conversation_id,message_id);
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_message_reactions FROM PUBLIC,anonymous;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.chat_message_reactions TO authenticated;

DO $policy$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='chat_message_reactions' AND policyname='looply_reaction_read') THEN
    CREATE POLICY looply_reaction_read ON public.chat_message_reactions
      FOR SELECT TO authenticated USING(
        public.v3_is_conversation_participant(conversation_id)
      );
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='chat_message_reactions' AND policyname='looply_reaction_insert') THEN
    CREATE POLICY looply_reaction_insert ON public.chat_message_reactions
      FOR INSERT TO authenticated WITH CHECK (
        user_id=(SELECT public.looply_legacy_uid())
        AND public.v3_is_conversation_participant(conversation_id)
        AND EXISTS(SELECT 1 FROM public.chat_messages m
          WHERE m.id=message_id AND m.conversation_id=conversation_id)
      );
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='chat_message_reactions' AND policyname='looply_reaction_update') THEN
    CREATE POLICY looply_reaction_update ON public.chat_message_reactions
      FOR UPDATE TO authenticated USING(
        user_id=(SELECT public.looply_legacy_uid())
        AND public.v3_is_conversation_participant(conversation_id)
      ) WITH CHECK(
        user_id=(SELECT public.looply_legacy_uid())
        AND public.v3_is_conversation_participant(conversation_id)
        AND EXISTS(SELECT 1 FROM public.chat_messages m
          WHERE m.id=message_id AND m.conversation_id=conversation_id)
      );
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='chat_message_reactions' AND policyname='looply_reaction_delete') THEN
    CREATE POLICY looply_reaction_delete ON public.chat_message_reactions
      FOR DELETE TO authenticated USING(
        user_id=(SELECT public.looply_legacy_uid())
        AND public.v3_is_conversation_participant(conversation_id)
      );
  END IF;
END $policy$;
NOTIFY pgrst,'reload schema';
