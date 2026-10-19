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
  assert.match(enhancements, /renderTools\(\);\s*applyFilters\(\);\s*\}$/);
  assert.match(enhancements, /\[data-chat-conversations\] \[data-chat-open\]/);
  assert.match(chat, /localStorage\.getItem/);
  assert.match(chat, /activeFilter === "groups" && isGroup/);
  assert.match(chat, /activeFilter === "favorites" && favorites\.has/);
  assert.match(chat, /if \(noMatches\.textContent !== emptyMessage\) noMatches\.textContent = emptyMessage/);
});
