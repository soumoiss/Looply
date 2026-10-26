import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20261019112000_gallery_upload_rls_returning_and_constraints.sql", import.meta.url),
  "utf8"
);

test("Storage uploader can read metadata for its own just-uploaded gallery object", () => {
  assert.ok(migration.includes("create policy looply_gallery_read_own_uploads"));
  assert.ok(migration.includes("on storage.objects for select to authenticated"));
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

test("gallery upload uses the Neon authenticated storage adapter and preserves the binary body", () => {
  assert.match(gallerySource, /const uploadGalleryObject = async \(path, file, contentType\)/);
  assert.match(gallerySource, /client\.storage\.from\("looply-gallery"\)\.upload\(path, file, \{ contentType, upsert: false \}\)/);
  assert.match(gallerySource, /await uploadGalleryObject\(path, file, mimeType\)/);
  assert.doesNotMatch(gallerySource, /supabaseUrl|supabaseKey|storage\/v1\/object/);
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
  assert.ok(ownerReadMigration.includes("create policy community_gallery_members_read"));
  assert.ok(ownerReadMigration.includes("owner_id = (select auth.uid())"));
  assert.ok(ownerReadMigration.includes("private.can_view_community_gallery_media(community_gallery_media.id)"));
});
