import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("chat has four real filters and removes the letter and notifications panels", async () => {
  const chat = await read("src/chat.js");
  assert.match(chat, /data-chat-filter="all"/);
  assert.match(chat, /data-chat-filter="groups"/);
  assert.match(chat, /data-chat-filter="unread"/);
  assert.match(chat, /data-chat-filter="favorites"/);
  assert.doesNotMatch(chat, /Escrever uma carta para Peixinho|chat-notifications-panel|Encontrar uma pessoa/);
  assert.match(chat, /\["all", "groups", "unread", "favorites"\]\.includes\(nextFilter\)/);
});

test("chat favorites are per-user Supabase rows with Realtime synchronization", async () => {
  const [chat, enhancements, migration, unreadMigration] = await Promise.all([
    read("src/chat.js"),
    read("src/chat-enhancements.js"),
    read("supabase/migrations/20261019163114_conversation_favorites.sql"),
    read("supabase/migrations/20261019163632_chat_unread_counts.sql")
  ]);
  assert.match(chat, /from\("conversation_favorites"\)\.select\("conversation_id"\)/);
  assert.match(enhancements, /from\("conversation_favorites"\)\.insert/);
  assert.match(enhancements, /from\("conversation_favorites"\)\.delete/);
  assert.match(enhancements, /table: "conversation_favorites"/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(chat, /rpc\("get_my_conversation_unread_counts"\)/);
  assert.match(unreadMigration, /security invoker/i);
  assert.match(unreadMigration, /cm\.created_at > cp\.last_read_at/i);
});

test("chat signs unique private avatar paths and retains a safe image fallback", async () => {
  const chat = await read("src/chat.js");
  assert.match(chat, /storage\.from\("looply-avatars"\)\.createSignedUrls\(paths, 1800\)/);
  assert.match(chat, /profile\.avatarUrl = urlsByPath\.get\(profile\.avatar_path\) \|\| ""/);
  assert.match(chat, /image\.replaceWith\(fallback\)/);
});
