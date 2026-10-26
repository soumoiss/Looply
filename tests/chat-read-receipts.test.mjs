import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  countUnreadNotificationsByConversation,
  invokeChatReadReceiptRpc,
  validateChatReadReceiptRpc
} from "../src/chat-read-receipts.js";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const id = suffix => "00000000-0000-4000-8000-" + String(suffix).padStart(12, "0");

test("unread chat counts are scoped by conversation and ignore read notifications", () => {
  const counts = countUnreadNotificationsByConversation([
    { conversation_id: "one", read_at: null },
    { conversation_id: "one", read_at: null },
    { conversation_id: "one", read_at: "2026-10-26T10:00:00Z" },
    { conversation_id: "two", read_at: null },
    { conversation_id: null, read_at: null }
  ]);
  assert.deepEqual([...counts.entries()].sort(), [["one", 2], ["two", 1]]);
});

test("read receipt RPC accepts only known parameters and valid conversation UUIDs", () => {
  assert.deepEqual(validateChatReadReceiptRpc("mark_conversation_read", { p_conversation_id: id(1) }), {
    name: "mark_conversation_read",
    body: { p_conversation_id: id(1) }
  });
  assert.deepEqual(validateChatReadReceiptRpc("mark_conversations_delivered", { p_conversation_ids: [id(1), id(2)] }), {
    name: "mark_conversations_delivered",
    body: { p_conversation_ids: [id(1), id(2)] }
  });
  assert.equal(validateChatReadReceiptRpc("mark_conversation_read", { p_conversation_id: id(1), p_user_id: id(2) }), null);
  assert.equal(validateChatReadReceiptRpc("mark_conversation_read", { p_conversation_id: "not-a-uuid" }), null);
  assert.equal(validateChatReadReceiptRpc("mark_conversations_delivered", { p_conversation_ids: Array.from({ length: 51 }, (_, index) => id(index)) }), null);
  assert.equal(validateChatReadReceiptRpc("arbitrary_admin_rpc", {}), null);
});

test("authenticated receipt calls use the fixed Neon endpoint and caller token", async () => {
  let request;
  const result = await invokeChatReadReceiptRpc("https://neon.example/rest/v1", "session-token", "mark_conversation_read", {
    p_conversation_id: id(7)
  }, async (url, options) => {
    request = { url, options };
    return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(result.error, null);
  assert.equal(request.url, "https://neon.example/rest/v1/rpc/mark_conversation_read");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, "Bearer session-token");
  assert.deepEqual(JSON.parse(request.options.body), { p_conversation_id: id(7) });
});

test("invalid receipt calls fail closed without making a network request", async () => {
  let requests = 0;
  const result = await invokeChatReadReceiptRpc("https://neon.example/rest/v1", "token", "mark_conversation_read", {
    p_conversation_id: id(1), p_user_id: id(2)
  }, async () => { requests += 1; return new Response("null"); });
  assert.equal(result.error.message, "neon_feature_not_migrated");
  assert.equal(requests, 0);
});

test("the Neon migration scopes receipt mutations and chat notifications to the signed-in profile", async () => {
  const migration = await read("migration/20261026_neon_chat_read_receipts.sql");
  for (const requirement of [
    "security definer", "set search_path = ''", "public.looply_legacy_uid()",
    "public.conversation_participants", "public.chat_messages",
    "chat_notifications_recipient_read", "chat_notifications_recipient_update",
    "grant update (read_at) on table public.chat_notifications to authenticated"
  ]) assert.ok(migration.includes(requirement), "missing migration guard: " + requirement);
  assert.match(migration, /cardinality\(p_conversation_ids\), 0\) <= 50/);
  assert.match(migration, /user_id = \(select public\.looply_legacy_uid\(\)\)/);
  assert.doesNotMatch(migration, /drop table|truncate|delete from public\.chat_messages/i);
});

test("chat loads recipient-specific notification counts and batches delivery RPCs", async () => {
  const source = await read("src/chat.js");
  assert.match(source, /\.eq\("user_id", userId\)[\s\S]*?\.is\("read_at", null\)/);
  assert.match(source, /\.range\(offset, offset \+ 999\)/);
  assert.match(source, /ids\.slice\(start, start \+ 50\)/);
  assert.match(source, /countUnreadNotificationsByConversation/);
});
