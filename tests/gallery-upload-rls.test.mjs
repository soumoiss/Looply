import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20261019112000_gallery_upload_rls_returning_and_constraints.sql", import.meta.url),
  "utf8"
);

test("Storage uploader can read metadata for its own just-uploaded gallery object", () => {
  assert.match(migration, /create policy looply_gallery_read_own_uploads\s+on storage\.objects for select to authenticated/i);
  assert.match(migration, /bucket_id = 'looply-gallery'[\s\S]*?private\.try_uuid\(\(storage\.foldername\(name\)\)\[2\]\) = \(select auth\.uid\(\)\)/);
});

test("gallery metadata insert preserves ownership and pending-state checks without stale size/MIME allowlists", () => {
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /publication_state = 'pending'/);
  assert.match(migration, /byte_size >= 1/);
  assert.doesNotMatch(migration, /104857600|209715200/);
  assert.match(migration, /drop constraint if exists community_gallery_media_mime_type_check/);
  assert.match(migration, /\[a-z0-9\]\{1,20\}/);
});

const gallerySource = await readFile(new URL("../assets/js/gallery.js", import.meta.url), "utf8");
const repairedMigration = await readFile(
  new URL("../supabase/migrations/20261019143000_repair_gallery_upload_rls_regex_and_metadata.sql", import.meta.url),
  "utf8"
);

test("gallery upload sends raw binary using the authenticated session", () => {
  assert.match(gallerySource, /const uploadGalleryObject = async \(path, file, contentType\)/);
  assert.match(gallerySource, /Authorization:\s*"Bearer " \+ accessToken/);
  assert.match(gallerySource, /"Content-Type": contentType/);
  assert.match(gallerySource, /body:\s*file/);
  assert.match(gallerySource, /await uploadGalleryObject\(path, file, mimeType\)/);
  assert.doesNotMatch(gallerySource, /client\.storage\.from\("looply-gallery"\)\.upload\(/);
});

test("gallery Storage policy does not depend on Storage-generated size metadata", () => {
  assert.match(repairedMigration, /create policy looply_gallery_insert_owner/);
  assert.match(repairedMigration, /bucket_id = 'looply-gallery'/);
  assert.match(repairedMigration, /private\.try_uuid\(\(storage\.foldername\(name\)\)\[2\]\) = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(repairedMigration, /metadata\s*->>\s*'size'/);
  assert.match(repairedMigration, /create policy community_gallery_owner_insert_pending/);
});

const ownerReadMigration = await readFile(
  new URL("../supabase/migrations/20261019170000_gallery_owner_read_pending_media.sql", import.meta.url),
  "utf8"
);

test("gallery owner can read pending media for INSERT RETURNING without exposing it to other users", () => {
  assert.match(ownerReadMigration, /create policy community_gallery_members_read[\\s\\S]*?for select to authenticated/i);
  assert.match(ownerReadMigration, /owner_id = \\(select auth\\.uid\\(\\)\\)/);
  assert.match(ownerReadMigration, /or \\(select private\\.can_view_community_gallery_media\\(community_gallery_media\\.id\\)\\)/);
});
