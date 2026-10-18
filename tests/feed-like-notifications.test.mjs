import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");

test("Instagram URL posts have the required column privilege and like notifications are database-backed", async () => {
  const migration = await read("supabase/migrations/20261019110000_feed_link_permissions_and_like_notifications.sql");
  assert.match(migration, /grant insert \(author_id, body, visibility, external_url\) on public\.posts to authenticated/i);
  assert.match(migration, /'post_like', 'story_like'/);
  assert.match(migration, /after insert on public\.post_likes/i);
  assert.match(migration, /after insert on public\.story_likes/i);
  assert.match(migration, /target_id <> actor_id/);
});

test("notification inbox identifies who liked a post or story and links to the content", async () => {
  const source = await read("assets/js/notifications.js");
  assert.match(source, /post_like: "Curtida no feed"/);
  assert.match(source, /story_like: "Curtida no story"/);
  assert.match(source, /if \(item\.kind === "story_like"\) return "home\.html#stories"/);
  assert.match(source, /post_like[\s\S]*home\.html#post-/);
});
