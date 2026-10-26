import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("saved feed posts expose the persistent action only when the query is available", async () => {
  const { socialMarkup } = await import("../src/social.js");
  const makePage = (savedPostsAvailable, savedByMe = false) => socialMarkup({
    people: [],
    posts: [{
      id: "p1", author_id: "u1", body: "Post",
      visibility: "public", created_at: "2026-10-26T00:00:00Z",
      comments: [], media: [], savedPostsAvailable, savedByMe
    }]
  }, "u1");
  const ready = makePage(true, true);
  assert.match(ready, /data-toggle-save="p1"/);
  assert.match(ready, /aria-pressed="true" aria-label="Remover dos salvos"/);
  assert.doesNotMatch(makePage(false), /data-toggle-save="p1"/);
});

test("Reels save control routes through the feed's persisted saved-post action", async () => {
  const source = await read("src/social.js");
  assert.match(source, /data-reel-save/);
  assert.ok(source.includes('current.card.querySelector("[data-toggle-save]")?.click()'));
  assert.match(source, /from\("saved_posts"\)\.insert/);
  assert.match(source, /from\("saved_posts"\)\.delete/);
  assert.match(source, /from\("saved_posts"\)\.select\("post_id"\)/);
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
