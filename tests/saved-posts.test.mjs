import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("the Feed no longer exposes publication bookmarking", async () => {
  const { socialMarkup } = await import("../src/social.js");
  const page = socialMarkup({ people:[], posts:[{
    id:"p1", author_id:"u1", body:"Publicação", visibility:"public",
    created_at:"2026-10-26T00:00:00Z", comments:[], media:[]
  }] }, "u1");
  assert.doesNotMatch(page, /data-toggle-save|Salvar publicação|Remover dos salvos/);
  const social = await read("src/social.js");
  const reels = await read("src/reels-scroll.js");
  assert.doesNotMatch(social, /data-reel-save|from\("saved_posts"\)/);
  assert.doesNotMatch(reels, /data-toggle-save|save: "Salvar"/);
});

test("saved posts migration scopes reads and inserts to the signed-in owner and visible posts", async () => {
  const migration = await read("migration/20261026_saved_posts.sql");
  assert.match(migration, /primary key \(user_id, post_id\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /grant select, insert, delete on public\.saved_posts to authenticated/i);
  assert.match(migration, /user_id = \(select public\.looply_legacy_uid\(\)\) and \(select public\.v3_can_view_post\(post_id\)\)/i);
  assert.match(migration, /saved_posts_delete_own[\s\S]*?using \(user_id = \(select public\.looply_legacy_uid\(\)\)\)/i);
  assert.doesNotMatch(migration, /grant all|drop table|truncate|delete from public\.posts/i);
});
