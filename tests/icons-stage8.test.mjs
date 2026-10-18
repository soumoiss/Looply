import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { icon, iconNames } from "../src/icons.js";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("shared icon registry exposes unique semantic names and valid SVG output", () => {
  assert.equal(new Set(iconNames).size, iconNames.length);
  for (const name of ["close", "back", "check", "cancel", "save", "pencil", "trash", "plus", "minus", "search", "filter", "refresh", "copy", "share", "external", "upload", "menu", "alert", "offline", "empty", "sync", "loader", "play", "pause", "phone", "video", "mic", "micOff", "volume", "volumeOff", "camera", "cameraOff", "cameraSwitch"]) {
    assert.ok(iconNames.includes(name), "missing icon " + name);
    assert.match(icon(name), /^<svg class="looply-icon"/);
    assert.match(icon(name), /aria-hidden="true"/);
    assert.match(icon(name), /viewBox="0 0 24 24"/);
  }
  assert.throws(() => icon("unknown-semantic"), /Unknown Looply icon/);
  assert.match(icon("close", { label: "Fechar" }), /role="img" aria-label="Fechar"/);
});

test("playlist controls use semantic icons without typographic substitute glyphs", async () => {
  const source = await read("src/youtube-playlist.js");
  assert.match(source, /from "\.\/icons\.js"/);
  for (const name of ["close", "play", "comment", "share", "external"]) assert.match(source, new RegExp('icon\\("' + name + '"\\)'));
  assert.doesNotMatch(source, /aria-label="Fechar reprodutor">×/);
  assert.doesNotMatch(source, /youtube-track-play[^<]*>▶/);
  assert.doesNotMatch(source, /title="Comentar esta música">▤/);
  assert.doesNotMatch(source, /title="Compartilhar música">↗/);
});

test("call, story, attachment and letter controls share the central icon registry", async () => {
  const [calls, stories, social, letters, enhancements, runtime] = await Promise.all([
    read("src/chat-calls.js"), read("src/stories.js"), read("src/social.js"),
    read("src/letters-community.js"), read("src/chat-enhancements.js"), read("src/page-runtime.js")
  ]);
  for (const source of [calls, stories, social, letters, enhancements, runtime]) assert.match(source, /from "\.\/icons\.js"/);
  for (const name of ["mic", "micOff", "volume", "volumeOff", "camera", "cameraOff", "cameraSwitch", "hangup"]) assert.ok(calls.includes('icon("' + name + '")') || calls.includes('icon(track.enabled ? "' + name));
  assert.match(stories, /data-story-play-toggle[^\n]*icon\("pause"\)/);
  assert.match(stories, /button\.innerHTML = icon\(state\.paused \? "play" : "pause"\)/);
  assert.match(social, /icon\("plus"\)/);
  assert.doesNotMatch(letters, /function icon\(name\)/);
  assert.match(letters, /icon\("close"\)/);
  assert.match(runtime, /icon\("menu"\)/);
});

test("shared icon styles preserve theme inheritance, focus visibility and touch targets", async () => {
  const css = await read("styles.css");
  assert.match(css, /\.looply-icon[\s\S]*?color:\s*currentColor/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
});
