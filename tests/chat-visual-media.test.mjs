import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isVisualOnlyChatMessage, threadMarkup } from "../src/chat.js";

const read = name => readFile(new URL("../" + name, import.meta.url), "utf8");
const base = {
  id: "m1", conversation_id: "c1", sender_id: "u1",
  created_at: "2026-10-28T22:25:00Z", body: "Compartilhou arquivos."
};
const picture = { mime_type: "image/jpeg", file_name: "foto.jpg", signedUrl: "https://example.com/foto.jpg" };

test("photos and stickers render without text bubble while ordinary messages retain it", () => {
  const photo = {...base, media:[picture]};
  assert.equal(isVisualOnlyChatMessage(photo), true);
  let html = threadMarkup([photo], "u1");
  assert.match(html, /chat-message is-mine is-visual-only/);
  assert.match(html, /class="chat-message-media"/);
  assert.match(html, /data-chat-message-body class="visually-hidden"/);
  assert.match(html, /data-chat-reply="m1"/);

  html = threadMarkup([{...photo, body:"Legenda da foto"}], "u1");
  assert.match(html, /chat-message is-mine is-visual-only/);
  assert.ok(html.includes('data-chat-message-body>Legenda da foto</p>'));

  html = threadMarkup([{...base, media:[], body:"Oi!"}], "u1");
  assert.doesNotMatch(html, /is-visual-only/);
  assert.ok(html.includes('data-chat-message-body>Oi!</p>'));

  html = threadMarkup([{...base, media:[{mime_type:"video/mp4",file_name:"video.mp4"}]}], "u1");
  assert.doesNotMatch(html, /is-visual-only/);

  html = threadMarkup([{...base, media:[], body:"[[looply-sticker:cat-scared]]"}], "u1");
  assert.match(html, /chat-message is-mine is-visual-only/);
  assert.match(html, /class="chat-catalog-message"/);
});
test("CSS removes purple media surfaces and global header only in open threads", async () => {
  const [css, chat, conversation] = await Promise.all([
    read("assets/css/pages/chat-viewport-catalog.css"),
    read("chat.html"),
    read("conversa.html")
  ]);
  assert.ok(css.includes(".chat-message.is-visual-only"));
  assert.match(css, /background:transparent!important/);
  assert.ok(css.includes(":has(.chat-area.is-conversation-open) > .container-page > .page-header"));
  assert.ok(css.includes(".chat-message.is-visual-only .chat-image-link"));
  assert.ok(chat.includes("chat-viewport-catalog.css"));
  assert.ok(conversation.includes("chat-viewport-catalog.css"));
});
