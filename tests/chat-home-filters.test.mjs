import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, `file://${process.cwd()}/`), "utf8");

test("chat renders explicit conversation metadata and applies shared data filters", async () => {
  const [chat, enhancements] = await Promise.all([
    read("src/chat.js"),
    read("src/chat-enhancements.js")
  ]);

  assert.match(enhancements, /home\.href = "home\.html"/);
  assert.match(enhancements, /data-v2-home/);
  assert.match(enhancements, /matchesConversationFilter\(/);
  assert.match(enhancements, /item\.hidden = !matches/);
  assert.match(enhancements, /if \(noMatches\.textContent !== emptyMessage\) noMatches\.textContent = emptyMessage/);
  assert.doesNotMatch(enhancements, /applyWallpaper\(\);\s*applyFilters\(\);\s*\};\s*const renderSettings/);
  assert.match(enhancements.replace(/\r\n/g, "\n"), /  renderTools\(\);\n  applyFilters\(\);/);
  assert.match(enhancements, /void \(async \(\) => \{/);
  assert.match(chat, /matchesConversationFilter\(/);
  assert.match(chat, /data-chat-kind=/);
  assert.match(chat, /data-chat-unread-count=/);
  assert.doesNotMatch(chat, /Boolean\(item\.querySelector\("\.chat-unread"\)\)/);
  assert.match(chat, /if \(noMatches\.textContent !== emptyMessage\) noMatches\.textContent = emptyMessage/);
  assert.match(chat, /const conversationFilterButton = event\.target\.closest\("\[data-chat-filter\]"\)/);
  assert.match(chat, /conversationFilter = "all"/);
  assert.match(chat, /avatar_path/);
  assert.match(chat, /const profileReferences = /);
  assert.match(chat, /avatarUrls\.get\(person\.id\)/);
  assert.match(chat, /cachedSignedUrl\(client, "looply-avatars", path, 1800\)/);
});

test("chat keeps the global header and gives the send icon a fixed size", async () => {
  const css = await read("assets/css/pages/chat.css");
  const page = await read("chat.html");
  assert.doesNotMatch(css, /\.page-chat \.page-header[^\n]*display:none/);
  assert.match(css, /chat-message-actions \.primary-button \.looply-icon \{ width:18px; height:18px/);
  assert.match(page, /data-site-header>[\s\S]*brand-mark-animated/);
  assert.match(page, /assets\/css\/pages\/chat\.css\?v=[a-z0-9-]+/);
});
