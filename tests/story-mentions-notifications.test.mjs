import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const studio = file("src/story-studio.js");
const stories = file("src/stories.js");
const client = file("src/neon-production-client.js");
const notifications = file("assets/js/notifications.js");
const migration = file("migration/20261026_story_mentions_notifications.sql");

test("Story mentions use a searchable in-app picker with profile avatars and a 20-person cap", () => {
  assert.match(studio, /data-studio-mentions-open/);
  assert.match(studio, /Mencionar pessoas/);
  assert.match(studio, /Pesquisar nome ou @usuário/);
  assert.match(studio, /studio-mention-person/);
  assert.match(studio, /chosen\.size >= 20/);
  assert.match(stories, /data-avatar=/);
});

test("Mention IDs are persisted only after the Story and its media are attached", () => {
  assert.match(studio, /client\.rpc\("v5_add_story_mentions", \{ p_story_id: storyId, p_user_ids: mentionIds \}\)/);
  assert.ok(studio.indexOf('client.rpc("v5_attach_story_media"') < studio.indexOf('client.rpc("v5_add_story_mentions"'));
  assert.match(client, /"v5_add_story_mentions"/);
});

test("The Neon RPC validates ownership, expiry, visibility, and selected Story recipients", () => {
  for (const rule of ["SECURITY DEFINER", "story_owner <> owner_id", "story_visibility = 'private'", "story_visibility = 'selected'", "story_mentions_unique_user", "notifications_recipient_select", "notifications_recipient_update", "GRANT UPDATE (read_at)"]) {
    assert.ok(migration.includes(rule), "missing database guard: " + rule);
  }
  assert.match(migration, /ON CONFLICT \(recipient_id, kind, event_id\) DO NOTHING/);
});

test("Mention notifications open the exact active Story and are labeled clearly", () => {
  assert.match(notifications, /kind === "story_mention"/);
  assert.match(notifications, /Menção em story/);
  assert.match(stories, /searchParams\.get\("storyId"\)/);
  assert.match(stories, /openDialog|openStoryDialog/);
});
