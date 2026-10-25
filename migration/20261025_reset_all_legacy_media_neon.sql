-- Looply ORIGINAL -> Neon: start all uploaded media from scratch.
-- Authorised media-only reset; DO NOT run against the Supabase source database.
-- Target: Neon database neondb, migration branch's main database.
-- Preserves accounts, profiles, text posts/comments, chat messages, letters,
-- friends, permissions, schema, and future upload capabilities.
-- This is ONCE ONLY: if applied, it will refuse a second run.
-- Existing object-storage buckets are empty at time of initial inspection.
BEGIN;

CREATE TABLE IF NOT EXISTS looply_migration.media_reset_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  policy text NOT NULL,
  before_counts jsonb NOT NULL
);
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM looply_migration.media_reset_events) THEN
    RAISE EXCEPTION 'Legacy media reset already applied; refusal to erase future uploads';
  END IF;
  IF (SELECT count(*) FROM public.profiles) < 1 THEN
    RAISE EXCEPTION 'Expected migrated profiles; refusing to run on unexpected database';
  END IF;
  IF (SELECT count(*) FROM public.chat_messages) < 1 THEN
    RAISE EXCEPTION 'Expected original chat messages; refusing to run on unexpected database';
  END IF;
END;
$guard$;

INSERT INTO looply_migration.media_reset_events(policy,before_counts)
SELECT 'zero ALL legacy uploaded media; preserve text and identities',
jsonb_build_object(
 'profiles', (SELECT count(*) FROM public.profiles),
 'chat_messages', (SELECT count(*) FROM public.chat_messages),
 'posts', (SELECT count(*) FROM public.posts),
 'community_letters', (SELECT count(*) FROM public.community_letters),
 'avatar_references', (SELECT count(*) FROM public.profiles WHERE avatar_path IS NOT NULL),
 'archive_media', (SELECT count(*) FROM public.archive_media),
 'community_gallery_media', (SELECT count(*) FROM public.community_gallery_media),
 'post_media', (SELECT count(*) FROM public.post_media),
 'comment_media', (SELECT count(*) FROM public.comment_media),
 'chat_media', (SELECT count(*) FROM public.chat_media),
 'story_media', (SELECT count(*) FROM public.story_media),
 'legacy_object_inventory', (SELECT count(*) FROM looply_migration.storage_object_inventory)
);

-- Polymorphic gallery/legacy-media references are not all protected by FKs.
-- Remove them explicitly so no stale item survives if its parent is deleted.
DELETE FROM public.gallery_album_items;
DELETE FROM public.gallery_media_adjustments;
DELETE FROM public.gallery_media_descriptions;
DELETE FROM public.gallery_media_people;
DELETE FROM public.gallery_private_items;
DELETE FROM public.gallery_albums;

-- Each parent cascades ONLY to its media-specific interaction rows.
DELETE FROM public.community_gallery_media;
DELETE FROM public.archive_media;

-- Remove attachments while preserving text content and message identities.
DELETE FROM public.post_media;
DELETE FROM public.comment_media;
DELETE FROM public.chat_media;
DELETE FROM public.story_media;

UPDATE public.profiles SET avatar_path = NULL WHERE avatar_path IS NOT NULL;
UPDATE public.community_letters SET attachments = '[]'::jsonb
  WHERE attachments IS DISTINCT FROM '[]'::jsonb;
UPDATE public.secret_messages SET media_url = NULL WHERE media_url IS NOT NULL;
UPDATE public.global_announcements SET media_url = NULL WHERE media_url IS NOT NULL;

-- Notifications which exclusively point to removed gallery items are obsolete.
DELETE FROM public.notifications WHERE kind IN ('gallery_tag', 'gallery_comment');

-- Destination audit/transfer inventories represent old object references;
-- no old binary is transferred. Future uploads start with empty inventories.
DELETE FROM looply_migration.verified_media_receipts;
DELETE FROM looply_migration.storage_object_inventory;

COMMIT;
