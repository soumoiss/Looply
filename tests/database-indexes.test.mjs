import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("the performance migration adds indexes for all foreign keys flagged by Supabase", async () => {
  const migration = await readFile(resolve(root, "supabase/migrations/20261019040000_add_gallery_social_fk_indexes.sql"), "utf8");
  const expectedIndexes = [
    /archive_media_likes_user_id_idx[\s\S]*?archive_media_likes \(user_id\)/i,
    /community_gallery_media_private_owner_id_idx[\s\S]*?community_gallery_media \(private_owner_id\)/i,
    /community_gallery_media_likes_user_id_idx[\s\S]*?community_gallery_media_likes \(user_id\)/i,
    /gallery_media_people_created_by_idx[\s\S]*?gallery_media_people \(created_by\)/i,
    /global_announcements_created_by_idx[\s\S]*?global_announcements \(created_by\)/i,
    /post_likes_user_id_idx[\s\S]*?post_likes \(user_id\)/i,
    /story_likes_user_id_idx[\s\S]*?story_likes \(user_id\)/i,
    /story_replies_conversation_id_idx[\s\S]*?story_replies \(conversation_id\)/i,
    /story_replies_message_conversation_idx[\s\S]*?story_replies \(message_id, conversation_id\)/i,
    /story_views_viewer_id_idx[\s\S]*?story_views \(viewer_id\)/i
  ];
  assert.equal((migration.match(/create index if not exists/gi) || []).length, expectedIndexes.length);
  for (const indexPattern of expectedIndexes) assert.match(migration, indexPattern);
});

test("gallery adjustment editor foreign key has a covering index", async () => {
  const migration = await readFile(resolve(root, "supabase/migrations/20261019060000_gallery_adjustments_fk_index.sql"), "utf8");
  assert.match(migration, /create index if not exists gallery_media_adjustments_updated_by_idx[\s\S]*?on public\.gallery_media_adjustments \(updated_by\)/i);
});
