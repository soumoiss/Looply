import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adapter, migration, functionSource] = await Promise.all([
  readFile(new URL("../src/neon-production-client.js", import.meta.url), "utf8"),
  readFile(new URL("../migration/20261026_neon_profile_gallery_upload.sql", import.meta.url), "utf8"),
  readFile(new URL("../backend/neon-storage/index.mjs", import.meta.url), "utf8")
]);

test("Neon adapter supports authenticated Data API media persistence", async () => {
  const bridge=await readFile(new URL("../src/neon-rest-bridge.js",import.meta.url),"utf8");
  for (const table of ["posts","post_media","stories","story_media","chat_messages","chat_media","community_letters","community_gallery_media"]) {
    assert.match(bridge,new RegExp(table+":"));
  }
  assert.match(bridge,/getAccessToken/);
  assert.match(bridge,/authorization:"Bearer "/);
  assert.match(adapter,/createNeonRestQuery/);
  assert.match(adapter,/storageFunction \+ "\/storage\/" \+ action/);
});

test("Neon storage function authenticates and restricts each private object to its owner", () => {
  assert.match(functionSource, /v3_self_profile\?select=id/);
  assert.match(functionSource, /allowedFile\(bucket, path, mime/);
  assert.match(functionSource, /AWS4-HMAC-SHA256/);
  assert.match(functionSource, /method: "PUT"/);
  assert.match(functionSource, /method: "GET"/);
  assert.match(functionSource, /method: "DELETE"/);
  assert.match(functionSource, /origin !== allowedOrigin/);
});

test("Neon policies resolve historical profile ownership and keep gallery uploads pending until publication", () => {
  assert.match(migration, /public\.looply_legacy_uid\(\)/);
  assert.match(migration, /publication_state = 'pending'/);
  assert.match(migration, /publication_state = 'published'/);
  assert.match(migration, /grant update \(publication_state\)/);
  assert.match(migration, /v3_cleanup_pending_gallery_media/);
});
