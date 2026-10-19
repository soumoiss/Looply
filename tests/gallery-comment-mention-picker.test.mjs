import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [gallery, migration] = await Promise.all([
  readFile(new URL("../assets/js/gallery.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019200000_fix_comment_permissions_and_mentions.sql", import.meta.url), "utf8")
]);

test("comment permission checks retain media visibility", () => {
  assert.match(migration, /private\.can_view_community_gallery_media\(p_media_id\)/);
  assert.match(migration, /private\.can_view_archive_media\(p_media_id\)/);
});

test("disabled community gallery comments are denied by the database helper", () => {
  assert.match(migration, /media\.comment_access = 'viewers'[\s\S]*?media\.comment_access = 'selected'[\s\S]*?community_gallery_media_commenters/);
  assert.doesNotMatch(migration, /media\.comment_access = 'disabled'\s+or/);
});

test("selected community gallery commenters must be explicitly authorized", () => {
  assert.match(migration, /community_gallery_media_commenters commenter[\s\S]*?commenter\.user_id = \(select auth\.uid\(\)\)/);
});

test("archive comments retain viewer, selected, and disabled access behavior", () => {
  assert.match(migration, /archive_media_commenters commenter[\s\S]*?commenter\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /revoke all on function private\.can_comment_archive_media\(uuid\) from public, anon/);
});

test("gallery comment form offers a searchable mention picker", () => {
  assert.match(gallery, /data-comment-mention-search/);
  assert.match(gallery, /data-comment-mention-users/);
  assert.match(gallery, /data-comment-username/);
});

test("selecting a person inserts an @username token into the comment body", () => {
  assert.match(gallery, /const mention = "@" \+ button\.dataset\.commentUsername/);
  assert.match(gallery, /textarea\.value = current\.slice\(0, start\) \+ separator \+ mention/);
});

test("community comment mentions trigger gallery_tag notifications", () => {
  assert.match(migration, /notify_community_gallery_comment_mentions/);
  assert.match(migration, /'gallery_tag'/);
  assert.match(migration, /community_gallery_comment_mentions_notification/);
});

test("selected-audience mentions are notified only after the recipient is authorized", () => {
  assert.match(migration, /notify_selected_gallery_comment_mention/);
  assert.match(migration, /v_audience = 'selected' and new\.user_id <> v_author/);
  assert.match(migration, /selected_gallery_comment_mention_notification/);
});

test("mention notifications avoid duplicates", () => {
  assert.match(migration, /on conflict \(recipient_id, kind, event_id\) do nothing/);
});

test("comment permission failures provide actionable feedback instead of hiding all 42501 details", () => {
  assert.match(gallery, /Authentication required/);
  assert.match(gallery, /Not permitted to comment/);
  assert.match(gallery, /Looply comment publish failed/);
});
