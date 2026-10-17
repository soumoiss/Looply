import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("YouTube API credentials are not shipped in browser configuration or client code", async () => {
  const [config, playlist] = await Promise.all([
    readFile(new URL("../config.js", import.meta.url), "utf8"),
    readFile(new URL("../src/youtube-playlist.js", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(config, /youtubeApiKey|AIzaSy[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(playlist, /youtubeApiKey|googleapis\.com\/youtube\/v3\/playlistItems/);
  assert.match(playlist, /authorization:\s*"Bearer "\s*\+\s*token/);
  assert.match(playlist, /LOOPLY_CONFIG\?\.youtubeApiUrl/);
});
