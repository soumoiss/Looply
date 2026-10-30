-- Stage 3: stop chat-sticker uploads from referencing a message in another
-- conversation or authored by somebody else. The previous policy compared
-- m.conversation_id with itself and m.sender_id with itself (always true).
-- This migration does not change, delete, or backfill any user content.
-- Existing rows have been checked against their parent message before rollout.
ALTER POLICY looply_v10_chat_sticker_insert
ON public.chat_sticker_messages
WITH CHECK (
  sender_id = public.looply_legacy_uid()
  AND public.v3_is_conversation_participant(conversation_id)
  AND EXISTS (
    SELECT 1 FROM public.chat_messages AS m
    WHERE m.id = chat_sticker_messages.message_id
      AND m.conversation_id = chat_sticker_messages.conversation_id
      AND m.sender_id = chat_sticker_messages.sender_id
  )
  AND EXISTS (
    SELECT 1 FROM public.sticker_catalog AS s
    WHERE s.id = chat_sticker_messages.sticker_id
      AND s.is_active
      AND (
        s.is_shared
        OR s.owner_id IS NULL
        OR s.owner_id = public.looply_legacy_uid()
      )
  )
);
