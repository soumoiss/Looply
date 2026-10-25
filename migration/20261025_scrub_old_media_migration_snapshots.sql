-- Applies ONLY to migrated Neon metadata, not to original Supabase source.
-- Remove obsolete media snapshots so later replays cannot resurrect old attachments.
-- Preserves archived *text cards*, chat message bodies, letters, posts and users.
BEGIN;

DELETE FROM looply_migration.source_rows
WHERE source_table IN (
  'archive_media','archive_media_comment_recipients','archive_media_commenters',
  'archive_media_comments','archive_media_likes','archive_media_recipients',
  'chat_media','comment_media','post_media','story_media',
  'community_gallery_media','community_gallery_comments',
  'community_gallery_comment_recipients','community_gallery_media_commenters',
  'community_gallery_media_likes','community_gallery_media_recipients',
  'gallery_album_items','gallery_albums','gallery_media_adjustments',
  'gallery_media_descriptions','gallery_media_people','gallery_private_items'
);
DELETE FROM looply_migration.source_rows
WHERE source_table='notifications' AND row_payload->>'kind' IN ('gallery_tag','gallery_comment');

UPDATE looply_migration.source_rows
SET row_payload = row_payload || '{"avatar_path": null}'::jsonb
WHERE source_table='profiles' AND row_payload->>'avatar_path' IS NOT NULL;

UPDATE looply_migration.source_rows
SET row_payload = row_payload || '{"attachments":[]}'::jsonb
WHERE source_table='community_letters' AND row_payload->'attachments' IS DISTINCT FROM '[]'::jsonb;

UPDATE looply_migration.source_rows
SET row_payload = row_payload || '{"media_url":null}'::jsonb
WHERE source_table IN ('secret_messages','global_announcements') AND row_payload->>'media_url' IS NOT NULL;

DELETE FROM looply_migration.source_table_inventory
WHERE table_name IN (
  'archive_media','archive_media_comment_recipients','archive_media_commenters',
  'archive_media_comments','archive_media_likes','archive_media_recipients',
  'chat_media','comment_media','post_media','story_media',
  'community_gallery_media','community_gallery_comments',
  'community_gallery_comment_recipients','community_gallery_media_commenters',
  'community_gallery_media_likes','community_gallery_media_recipients',
  'gallery_album_items','gallery_albums','gallery_media_adjustments',
  'gallery_media_descriptions','gallery_media_people','gallery_private_items'
);

COMMIT;
