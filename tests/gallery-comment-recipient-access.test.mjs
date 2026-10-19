import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261019100000_guard_selected_comment_media_access.sql", import.meta.url), "utf8");

test("selected archive comments require access to the parent media", () => {
  assert.match(migration, /comment_row\.audience = 'selected'[\s\S]*?private\.can_view_archive_media\(comment_row\.media_id\)[\s\S]*?archive_media_comment_recipients/);
  assert.match(migration, /not private\.looply_content_is_hidden\('archive_media_comment'/);
  assert.match(migration, /not private\.looply_content_is_hidden\('archive_media'/);
});

test("selected community gallery comments require access to the parent media", () => {
  assert.match(migration, /comment_row\.audience = 'selected'[\s\S]*?private\.can_view_community_gallery_media\(comment_row\.media_id\)[\s\S]*?community_gallery_comment_recipients/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function private\.can_view_community_gallery_comment\(uuid\) from public, anon, authenticated/);
});
