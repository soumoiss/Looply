import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, `file://${process.cwd()}/`), "utf8");

test("chat page has a home link and all conversation filters apply consistently", async () => {
  const [chat, enhancements] = await Promise.all([
    read("src/chat.js"),
    read("src/chat-enhancements.js")
  ]);

  assert.match(enhancements, /home\.href = "home\.html"/);
  assert.match(enhancements, /data-v2-home/);
  assert.match(enhancements, /activeFilter === "groups" && isGroup/);
  assert.match(enhancements, /activeFilter === "favorites" && favorites\.has\(id\)/);
  assert.match(enhancements, /item\.hidden = !matches/);
  assert.match(enhancements, /if \(noMatches\.textContent !== emptyMessage\) noMatches\.textContent = emptyMessage/);
  assert.doesNotMatch(enhancements, /applyWallpaper\(\);\s*applyFilters\(\);\s*\};\s*const renderSettings/);
  assert.match(enhancements.replace(/\r\n/g, "\n"), /  renderTools\(\);\n  applyFilters\(\);\n\}/);
  assert.match(chat, /localStorage\.getItem/);
  assert.match(chat, /activeFilter === "groups" && isGroup/);
  assert.match(chat, /activeFilter === "favorites" && favorites\.has/);
  assert.match(chat, /if \(noMatches\.textContent !== emptyMessage\) noMatches\.textContent = emptyMessage/);
  assert.match(chat, /conversationFilterButton\.dataset\.chatFilter/);
  assert.match(chat, /\["all", "unread", "groups", "favorites"\]/);
  assert.match(chat, /avatar_path/);
  assert.match(chat, /createSignedUrls\(avatarProfiles\.map\(\(profile\) => profile\.avatar_path\)/);
});

test("chat keeps the global header and gives the send icon a fixed size", async () => {
  const css = await read("assets/css/pages/chat.css");
  assert.doesNotMatch(css, /\.page-chat \.page-header[^\n]*display:none/);
  assert.match(css, /chat-message-actions \.primary-button \.looply-icon \{ width:18px; height:18px/);
});
