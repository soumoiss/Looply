-- Stage 3 — separate least-privilege role for FCM queue dispatch.
-- The pre-existing 'looply_push_dispatcher' inherited neon_superuser
-- privileges. Neon blocks revoking that membership through this connection.
-- DO NOT put the old role's credentials into a Cloudflare Worker.
-- A NEW role created with SQL does not inherit neon_superuser privileges.
-- NOLOGIN until a private password is provisioned securely out of band.
-- Run on a test branch first; this changes no content or user accounts.

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='looply_push_relay_limited') THEN
    CREATE ROLE looply_push_relay_limited NOLOGIN NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO looply_push_relay_limited;
GRANT SELECT ON public.notifications, public.chat_notifications,
  public.letter_event_notifications, public.android_fcm_story_events,
  public.android_fcm_tokens TO looply_push_relay_limited;
GRANT SELECT, INSERT, UPDATE ON public.android_fcm_deliveries
  TO looply_push_relay_limited;
-- The worker only needs to see whether a chat attachment contains audio;
-- do not grant access to storage paths or other chat_media columns.
GRANT SELECT(message_id,mime_type) ON public.chat_media TO looply_push_relay_limited;

DO $$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'notifications','chat_notifications','letter_event_notifications',
    'android_fcm_story_events','android_fcm_tokens',
    'android_fcm_deliveries','chat_media'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=item
        AND policyname='looply_push_relay_limited_read'
    ) THEN
      EXECUTE format(
        'CREATE POLICY looply_push_relay_limited_read ON public.%I
         FOR SELECT TO looply_push_relay_limited USING (true)',item
      );
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='android_fcm_deliveries'
      AND policyname='looply_push_relay_limited_insert'
  ) THEN
    CREATE POLICY looply_push_relay_limited_insert ON public.android_fcm_deliveries
      FOR INSERT TO looply_push_relay_limited WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='android_fcm_deliveries'
      AND policyname='looply_push_relay_limited_update'
  ) THEN
    CREATE POLICY looply_push_relay_limited_update ON public.android_fcm_deliveries
      FOR UPDATE TO looply_push_relay_limited USING (true) WITH CHECK (true);
  END IF;
END $$;

-- When a private password is provisioned via a secure channel,
-- change this role to LOGIN with ALTER ROLE on the server only.
-- Never store the password in a repository, APK, or Worker source.
