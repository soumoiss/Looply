import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { icon, iconNames } from "../src/icons.js";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("shared icon registry exposes unique semantic names and valid SVG output", () => {
  assert.equal(new Set(iconNames).size, iconNames.length);
  for (const name of [
    "close", "back", "forward", "check", "bell", "cancel", "save", "pencil", "trash",
    "plus", "minus", "search", "filter", "refresh", "copy", "share", "external", "upload",
    "menu", "alert", "offline", "empty", "sync", "loader", "play", "pause", "phone", "video",
    "mic", "micOff", "volume", "volumeOff", "camera", "cameraOff", "cameraSwitch", "paperclip",
    "smile", "circle", "lock", "eye", "send"
  ]) {
    assert.ok(iconNames.includes(name), "missing icon " + name);
    assert.match(icon(name), /^<svg class="looply-icon"/);
    assert.match(icon(name), /aria-hidden="true"/);
    assert.match(icon(name), /viewBox="0 0 24 24"/);
  }
  assert.throws(() => icon("unknown-semantic"), /Unknown Looply icon/);
  assert.match(icon("close", { label: "Fechar" }), /role="img" aria-label="Fechar"/);
  assert.match(icon("close", { label: 'Fechar "janela" & confirmar' }), /aria-label="Fechar &quot;janela&quot; &amp; confirmar"/);
  assert.doesNotMatch(icon("close", { label: '<svg onload="alert(1)">' }), /<svg onload=/);
});

test("playlist controls use semantic icons without typographic substitute glyphs", async () => {
  const source = await read("src/youtube-playlist.js");
  assert.match(source, /from "\.\/icons\.js"/);
  for (const name of ["close", "play", "comment", "share", "external"]) {
    assert.match(source, new RegExp('icon\\("' + name + '"\\)'));
  }
  assert.doesNotMatch(source, /aria-label="Fechar reprodutor">×/);
  assert.doesNotMatch(source, /youtube-track-play[^<]*>▶/);
  assert.doesNotMatch(source, /title="Comentar esta música">▤/);
  assert.doesNotMatch(source, /title="Compartilhar música">↗/);
});

test("chat, calls, stories, profiles and letters use the shared registry", async () => {
  const [calls, stories, social, letters, enhancements, runtime, chat, profiles, archive] = await Promise.all([
    read("src/chat-calls.js"), read("src/stories.js"), read("src/social.js"),
    read("src/letters-community.js"), read("src/chat-enhancements.js"), read("src/page-runtime.js"),
    read("src/chat.js"), read("src/profiles.js"), read("src/archived-cards.js")
  ]);
  for (const source of [calls, stories, social, letters, enhancements, runtime, chat, profiles, archive]) {
    assert.match(source, /from "\.\/icons\.js"/);
  }
  for (const token of [
    'icon("mic")', 'icon("volume")', 'icon("camera")', 'icon("cameraSwitch")',
    'icon("hangup")', 'track.enabled ? "mic" : "micOff"',
    'remote.muted ? "volumeOff" : "volume"', 'track.enabled ? "camera" : "cameraOff"'
  ]) assert.ok(calls.includes(token), "missing call icon/state " + token);
  assert.match(calls, /data-call-close aria-label="Encerrar chamada">'\s*\+ icon\("hangup"\)/);
  assert.match(stories, /data-story-play-toggle[^\n]*icon\("pause"\)/);
  assert.match(stories, /button\.innerHTML = icon\(state\.paused \? "play" : "pause"\)/);
  assert.match(social, /icon\("plus"\)/);
  assert.doesNotMatch(letters, /function icon\(name\)/);
  assert.match(letters, /icon\("close"\)/);
  assert.match(runtime, /icon\("menu"\)/);
  assert.match(chat, /data-chat-reply-clear[^>]*>\$\{icon\("close"\)\}/);
  assert.match(chat, /data-chat-back[^>]*>\$\{icon\("back"\)\}/);
  assert.match(chat, /data-chat-record-start[^>]*>\$\{icon\("mic"\)\}/);
  assert.doesNotMatch(chat, /data-chat-reply-clear[^>]*>×/);
  assert.match(profiles, /data-profile-close>\$\{icon\("back"\)\}/);
  assert.match(archive, /data-card-close aria-label="Fechar carta">\$\{icon\("close"\)\}/);
  assert.match(archive, /data-card-next aria-label="Próxima carta">\$\{icon\("forward"\)\}/);
  assert.doesNotMatch(archive, /function cardIcon/);
});

test("shared icon styles preserve theme inheritance, focus visibility and touch targets", async () => {
  const css = await read("styles.css");
  assert.match(css, /\.looply-icon[\s\S]*?color:\s*currentColor/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /\.looply-icon--loading[\s\S]*?animation:/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("Stage 8 icon inventory documents the full registry and semantic states", async () => {
  const inventory = await read("docs/icon-inventory.md");
  for (const name of iconNames) {
    assert.match(inventory, new RegExp("`" + name + "`"), "inventory missing " + name);
  }
  for (const name of ["permissionDenied", "offline", "alert", "empty", "sync", "loader", "check", "external", "menu", "more", "grid", "star", "starFilled"]) {
    assert.ok(iconNames.includes(name), "missing semantic icon " + name);
  }
  assert.match(inventory, /https:\/\/icons8\.com\/icons\/collections\/ui/);
  assert.match(inventory, /https:\/\/icons8\.com\/icons\/set\/close/);
});

test("Stage 8 uses the shared registry instead of improvised UI glyphs", async () => {
  const [social, enhancements, chat, music, admin] = await Promise.all([
    read("src/social.js"), read("src/chat-enhancements.js"), read("src/chat.js"),
    read("src/music.js"), read("src/admin.js")
  ]);
  assert.match(social, /Abrir conteúdo original '\s*\+ icon\("external"\)/);
  assert.match(enhancements, /button\.innerHTML = icon\("menu"\)/);
  assert.match(enhancements, /icon\(favorites\.has\(id\) \? "starFilled" : "star"\)/);
  assert.match(enhancements, /\+ icon\("more"\) \+/);
  assert.match(enhancements, /\+ icon\("grid"\) \+/);
  assert.match(chat, /aria-label="Voltar às conversas">\$\{icon\("back"\)\}/);
  assert.match(music, /icon\("external"\)/);
  assert.match(admin, /icon\("external"\)/);
  assert.doesNotMatch(enhancements, /button\.textContent = "☰"|favorites\.has\(id\) \? "★" : "☆"|>⋯<|>▦<|>\$\{icon\("(?:more|grid)"\)\}<\/button>/);
  assert.doesNotMatch(chat, /data-chat-back[^>]*>←</);
  assert.doesNotMatch(social, /Abrir conteúdo original ↗/);
});
