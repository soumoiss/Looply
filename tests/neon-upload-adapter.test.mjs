import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adapter, migration, functionSource] = await Promise.all([
  readFile(new URL("../src/neon-production-client.js", import.meta.url), "utf8"),
  readFile(new URL("../migration/20261026_neon_profile_gallery_upload.sql", import.meta.url), "utf8"),
  readFile(new URL("../backend/neon-storage/index.mjs", import.meta.url), "utf8")
]);

test("Neon adapter permits only profile updates and gallery insert/publish writes", () => {
  assert.match(adapter, /table === "profiles" && state\.mode === "update"/);
  assert.match(adapter, /table === "community_gallery_media" && \["insert", "update"\]/);
  assert.match(adapter, /neon\.from\(table\)\.insert/);
  assert.match(adapter, /neon\.from\(table\)\.update/);
  assert.match(adapter, /storageFunction \+ "\/storage\/" \+ action/);
});

test("Neon storage function authenticates and restricts each private object to its owner", () => {
  assert.match(functionSource, /v3_self_profile\?select=id/);
  assert.match(functionSource, /allowedFile\(bucket, path, mime/);
  assert.match(functionSource, /PutObjectCommand/);
  assert.match(functionSource, /getSignedUrl/);
  assert.match(functionSource, /DeleteObjectCommand/);
  assert.match(functionSource, /origin !== allowedOrigin/);
});

test("Neon policies resolve historical profile ownership and keep gallery uploads pending until publication", () => {
  assert.match(migration, /public\.looply_legacy_uid\(\)/);
  assert.match(migration, /publication_state = 'pending'/);
  assert.match(migration, /publication_state = 'published'/);
  assert.match(migration, /grant update \(publication_state\)/);
  assert.match(migration, /v3_cleanup_pending_gallery_media/);
});
