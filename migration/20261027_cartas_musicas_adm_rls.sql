-- 2026-10-27: additive policies for the fully rebuilt Cartas UI and Music track moderation.
-- Uses the existing verified Neon Auth -> legacy profile UUID mapping.
-- No historical letter, archive, music or user rows are modified.
BEGIN;

DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='archived_cards' AND policyname='looply_v6_admin_archived_update') THEN
    CREATE POLICY looply_v6_admin_archived_update ON public.archived_cards FOR UPDATE TO authenticated
      USING ((SELECT public.v3_self_is_admin())) WITH CHECK ((SELECT public.v3_self_is_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='archived_cards' AND policyname='looply_v6_admin_archived_delete') THEN
    CREATE POLICY looply_v6_admin_archived_delete ON public.archived_cards FOR DELETE TO authenticated
      USING ((SELECT public.v3_self_is_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='archived_card_reads' AND policyname='looply_v6_admin_archived_read_receipts') THEN
    CREATE POLICY looply_v6_admin_archived_read_receipts ON public.archived_card_reads FOR SELECT TO authenticated
      USING ((SELECT public.v3_self_is_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_letters' AND policyname='looply_v6_admin_letters_select') THEN
    CREATE POLICY looply_v6_admin_letters_select ON public.community_letters FOR SELECT TO authenticated
      USING ((SELECT public.v3_self_is_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_letters' AND policyname='looply_v6_admin_letters_update') THEN
    CREATE POLICY looply_v6_admin_letters_update ON public.community_letters FOR UPDATE TO authenticated
      USING ((SELECT public.v3_self_is_admin())) WITH CHECK ((SELECT public.v3_self_is_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_letters' AND policyname='looply_v6_admin_letters_delete') THEN
    CREATE POLICY looply_v6_admin_letters_delete ON public.community_letters FOR DELETE TO authenticated
      USING ((SELECT public.v3_self_is_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_letters' AND policyname='looply_v6_sender_letters_delete') THEN
    CREATE POLICY looply_v6_sender_letters_delete ON public.community_letters FOR DELETE TO authenticated
      USING (sender_id=(SELECT public.looply_legacy_uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='music_track_comments' AND policyname='looply_v6_member_track_comments_select') THEN
    CREATE POLICY looply_v6_member_track_comments_select ON public.music_track_comments FOR SELECT TO authenticated
      USING ((SELECT public.looply_legacy_uid()) IS NOT NULL);
  END IF;
END $policy$;

-- Private moderator notes belong to a different table, never to public comments.
CREATE TABLE IF NOT EXISTS public.admin_music_track_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  playlist_id text NOT NULL CHECK (length(playlist_id) BETWEEN 5 AND 120 AND playlist_id ~ '^[A-Za-z0-9_-]+$'),
  video_id text NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  track_title text NOT NULL CHECK (length(btrim(track_title)) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_music_track_recipient_idx ON public.admin_music_track_comments(recipient_id, playlist_id, video_id, created_at);
ALTER TABLE public.admin_music_track_comments ENABLE ROW LEVEL SECURITY;
DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_music_track_comments' AND policyname='looply_v6_private_mod_select') THEN
    CREATE POLICY looply_v6_private_mod_select ON public.admin_music_track_comments FOR SELECT TO authenticated
      USING (recipient_id=(SELECT public.looply_legacy_uid()) OR (SELECT public.v3_self_is_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_music_track_comments' AND policyname='looply_v6_private_mod_insert') THEN
    CREATE POLICY looply_v6_private_mod_insert ON public.admin_music_track_comments FOR INSERT TO authenticated
      WITH CHECK (author_id=(SELECT public.looply_legacy_uid()) AND (SELECT public.v3_self_is_admin()));
  END IF;
END $policy$;
GRANT SELECT, INSERT ON public.admin_music_track_comments TO authenticated;

COMMIT;
