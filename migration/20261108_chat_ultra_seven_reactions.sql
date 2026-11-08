-- Align the seven approved chat quick reactions with the server check.
-- Preserves all existing reactions and enforces a finite allowlist.

ALTER TABLE public.chat_message_reactions DROP CONSTRAINT IF EXISTS chat_message_reactions_emoji_check;
ALTER TABLE public.chat_message_reactions ADD CONSTRAINT chat_message_reactions_emoji_check CHECK (emoji = ANY (ARRAY['❤️','😂','😮','😢','🙏','👍','🔥']::text[]));
