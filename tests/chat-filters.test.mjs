import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { avatarMarkup, filterConversations } from "../src/chat.js";

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

test("conversation filters derive from server state and keep newest conversations first", () => {
  const conversations = [
    { id: "old", kind: "direct", updated_at: "2026-10-18T10:00:00Z", unreadCount: 0, isFavorite: true },
    { id: "group", kind: "group", updated_at: "2026-10-19T09:00:00Z", unreadCount: 2, isFavorite: false },
    { id: "new", kind: "direct", updated_at: "2026-10-19T11:00:00Z", unreadCount: 1, isFavorite: true }
  ];
  assert.deepEqual(filterConversations(conversations, "all").map((item) => item.id), ["new", "group", "old"]);
  assert.deepEqual(filterConversations(conversations, "groups").map((item) => item.id), ["group"]);
  assert.deepEqual(filterConversations(conversations, "unread").map((item) => item.id), ["new", "group"]);
  assert.deepEqual(filterConversations(conversations, "favorites").map((item) => item.id), ["new", "old"]);
});

test("avatar markup includes a safe initial fallback for broken or missing Storage images", () => {
  assert.match(avatarMarkup({ display_name: "Maria Silva", avatarUrl: "https://example.com/avatar.jpg" }), /data-avatar-fallback="MS"/);
  assert.match(avatarMarkup({ display_name: "Maria Silva", avatarUrl: "" }), />MS</);
  assert.match(avatarMarkup({ isGroup: true }), /aria-label="Conversa em grupo"/);
});
