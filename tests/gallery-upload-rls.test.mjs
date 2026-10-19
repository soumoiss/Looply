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
