-- Looply etapa 3 — PostgreSQL role for Firebase dispatch MUST be scoped.
-- The existing looply_push_dispatcher was created with neon_superuser membership.
-- Never give its connection string to a public website or distribute it with APK.
-- This change revokes administrative capabilities without deleting any data.
-- Run and verify on a Neon test branch before applying to production.

REVOKE neon_superuser FROM looply_push_dispatcher;

ALTER ROLE looply_push_dispatcher
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- The scheduled dispatcher only inspects media type to distinguish voice
-- from normal text messages; it must not read content, files or storage keys.
GRANT USAGE ON SCHEMA public TO looply_push_dispatcher;
GRANT SELECT (message_id, mime_type) ON public.chat_media TO looply_push_dispatcher;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='chat_media'
      AND policyname='looply_push_dispatcher_chat_media_mime'
  ) THEN
    EXECUTE 'CREATE POLICY looply_push_dispatcher_chat_media_mime
      ON public.chat_media FOR SELECT TO looply_push_dispatcher
      USING (true)';
  END IF;
END $$;
