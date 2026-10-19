import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("music page provides an in-app audio player with synced time and visual feedback", async () => {
  const [music, css] = await Promise.all([read("src/music.js"), read("styles.css")]);
  assert.match(music, /data-music-player/);
  assert.match(music, /data-music-audio/);
  assert.match(music, /data-music-seek/);
  assert.match(music, /loadedmetadata/);
  assert.match(music, /timeupdate/);
  assert.match(music, /isDirectAudioUrl/);
  assert.match(music, /open\\.spotify\\.com/);
  assert.match(css, /music-wave/);
  assert.match(css, /prefers-reduced-motion/);
});
