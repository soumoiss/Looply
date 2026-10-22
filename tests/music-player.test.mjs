import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { musicEmbedForUrl, musicPlayerMarkup } from "../src/music.js";

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

test("supported music platforms play inline using trusted embed hosts", () => {
  const youtube = musicEmbedForUrl("https://youtu.be/dQw4w9WgXcQ?t=30");
  assert.equal(youtube?.provider, "youtube");
  assert.equal(new URL(youtube.src).hostname, "www.youtube-nocookie.com");
  const spotify = musicEmbedForUrl("https://open.spotify.com/intl-pt-br/track/4uLU6hMCjMI75M1A2tKUQC?si=example");
  assert.equal(spotify?.provider, "spotify");
  assert.equal(new URL(spotify.src).hostname, "open.spotify.com");
  assert.equal(musicEmbedForUrl("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(musicEmbedForUrl("javascript:alert(1)"), null);
  const markup = musicPlayerMarkup({ title: "Teste", listen_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  assert.match(markup, /<iframe/);
  assert.match(markup, /youtube-nocookie\.com\/embed/);
  assert.doesNotMatch(markup, /Abrir música/);
});
