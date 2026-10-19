import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("admin user provisioning persists an optional YouTube playlist without exposing credentials", async () => {
  const [migration, edge, admin] = await Promise.all([
    read("supabase/migrations/20261020093000_profile_playlist_url.sql"),
    read("supabase/functions/looply-admin/index.ts"),
    read("src/admin.js")
  ]);

  assert.match(migration, /add column if not exists playlist_url text/i);
  assert.match(migration, /profiles_playlist_url_format/);
  assert.match(migration, /grant select \(playlist_url\)/i);
  assert.match(migration, /grant update \(playlist_url\)/i);
  assert.match(edge, /const playlistUrl = String\(payload\.playlistUrl \|\| ""\)\.trim\(\)/);
  assert.match(edge, /auth\.admin\.createUser\(\{/);
  assert.match(edge, /\.update\(\{ playlist_url: playlistUrl \}\)/);
  assert.match(edge, /playlistUrl: playlistUrl \|\| null/);
  assert.match(admin, /name="playlistUrl"/);
  assert.match(admin, /name="confirmPassword"/);
  assert.match(admin, /password !== confirmPassword/);
  assert.match(admin, /playlistUrl, purpose/);
});

test("the configured profile playlist is normalized and overrides legacy username defaults", async () => {
  const playlist = await import(pathToFileURL(resolve(root, "src/youtube-playlist.js")).href);
  assert.equal(playlist.normalizeYouTubePlaylistUrl("https://www.youtube.com/playlist?list=PLabc_123"), "https://www.youtube.com/playlist?list=PLabc_123");
  assert.equal(playlist.normalizeYouTubePlaylistUrl("http://www.youtube.com/playlist?list=PLabc_123"), "");
  assert.equal(playlist.playlistIdFor("misol", "https://www.youtube.com/playlist?list=PLcustom_123"), "PLcustom_123");
});

test("profile runtime and self-edit flow carry playlist_url through the real profiles table", async () => {
  const [runtime, profiles] = await Promise.all([read("src/page-runtime.js"), read("src/profiles.js")]);
  assert.match(runtime, /profile_visibility,playlist_url,avatar_path/);
  assert.match(profiles, /name="playlistUrl"/);
  assert.match(profiles, /normalizeYouTubePlaylistUrl/);
  assert.match(profiles, /updates\.playlist_url = playlistUrl \|\| null/);
});
