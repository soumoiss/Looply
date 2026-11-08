-- Chat Ultra letter editor supports 10,000 characters, including safe JSON envelope overhead.
-- No rows are deleted; existing history remains valid.
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_body_length;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_body_length CHECK (char_length(pg_catalog.btrim(body)) BETWEEN 1 AND 14000);
