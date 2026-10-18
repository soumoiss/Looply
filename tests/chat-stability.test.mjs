import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");

test("Realtime refresh preserves the existing composer DOM node", async () => {
  const source = await read("src/chat.js");
  assert.match(source, /function updateThreadMarkup\(thread, markup, conversationId\)/);
  assert.match(source, /const currentForm = thread\.querySelector\("\[data-chat-send\]"\)/);
  assert.match(source, /child !== currentForm/);
  assert.match(source, /thread\.insertBefore\(child, currentForm\)/);
});

test("background refresh updates the sidebar instead of replacing the whole chat area", async () => {
  const source = await read("src/chat.js");
  const start = source.indexOf("async function refreshChat(");
  const end = source.indexOf("\nfunction scheduleRefresh", start);
  assert.ok(start >= 0 && end > start, "refreshChat function must exist");
  const refresh = source.slice(start, end);
  assert.match(refresh, /currentSidebar\.replaceWith\(freshSidebar\)/);
  assert.doesNotMatch(refresh, /area\.replaceWith\(freshArea\)/);
  assert.doesNotMatch(refresh, /area\.innerHTML\s*=/);
  assert.match(refresh, /requestId !== refreshSequence/);
});

test("opening a conversation invalidates stale background requests and does not clear a same-chat draft", async () => {
  const source = await read("src/chat.js");
  const start = source.indexOf("async function openConversation(");
  const end = source.indexOf("\nasync function refreshChat", start);
  const open = source.slice(start, end);
  assert.match(open, /refreshSequence \+= 1/);
  assert.match(open, /const hasSameComposer = thread\.querySelector\("\[data-chat-send\]"\)\?\.dataset\.conversationId === conversationId/);
  assert.match(open, /if \(hasSameComposer\) updateThreadMarkup\(thread, markup, conversationId\)/);
  assert.match(open, /requestId !== activeThreadRequest/);
});

test("mobile chat uses list-first navigation and keeps the composer controls available", async () => {
  const css = await read("assets/css/pages/chat.css");
  const source = await read("src/chat.js");
  assert.match(css, /\.chat-area\.is-conversation-open \.chat-sidebar\s*\{\s*display:none/);
  assert.match(css, /\.chat-area\.is-conversation-open \.chat-thread-panel\s*\{\s*display:flex/);
  assert.match(source, /data-chat-back/);
  assert.match(source, /data-chat-emoji/);
  assert.match(source, /Anexar mídia/);
});
