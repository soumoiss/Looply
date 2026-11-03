BEGIN;

-- Match the message to the conversation on the reaction row. Without
-- qualification, conversation_id inside the subquery resolves to m.
ALTER POLICY looply_reaction_insert ON public.chat_message_reactions
  WITH CHECK (
    user_id = (SELECT public.looply_legacy_uid())
    AND public.v3_is_conversation_participant(conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.chat_messages AS m
      WHERE m.id = chat_message_reactions.message_id
        AND m.conversation_id = chat_message_reactions.conversation_id
    )
  );

ALTER POLICY looply_reaction_update ON public.chat_message_reactions
  WITH CHECK (
    user_id = (SELECT public.looply_legacy_uid())
    AND public.v3_is_conversation_participant(conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.chat_messages AS m
      WHERE m.id = chat_message_reactions.message_id
        AND m.conversation_id = chat_message_reactions.conversation_id
    )
  );

COMMIT;
