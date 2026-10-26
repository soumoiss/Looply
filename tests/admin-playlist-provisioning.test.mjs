import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("admin user provisioning persists an optional YouTube playlist without exposing credentials", async () => {
  const [migration, edge, admin, api, relay] = await Promise.all([
    read("supabase/migrations/20261020093000_profile_playlist_url.sql"),
    read("supabase/functions/looply-admin/index.ts"),
    read("src/admin.js"),
    read("api/youtube-playlist.js"),
    read("supabase/functions/looply-youtube-playlist/index.ts")
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
  assert.match(api, /rest\/v1\/profiles\?id=eq/);
  assert.match(api, /configuredPlaylistId !== playlistId/);
  assert.match(relay, /\^\[A-Za-z0-9_\-\]\{1,100\}\$/);
  assert.match(admin, /playlistUrl, purpose/);
});

test("the configured profile playlist is normalized and overrides legacy username defaults", async () => {
  const playlist = await import(pathToFileURL(resolve(root, "src/youtube-playlist.js")).href);
  assert.equal(playlist.normalizeYouTubePlaylistUrl("https://www.youtube.com/playlist?list=PLabc_123"), "https://www.youtube.com/playlist?list=PLabc_123");
  assert.equal(playlist.normalizeYouTubePlaylistUrl("http://www.youtube.com/playlist?list=PLabc_123"), "");
  assert.equal(playlist.playlistIdFor("misol", "https://www.youtube.com/playlist?list=PLcustom_123"), "PLcustom_123");
});

test("Neon page runtime resolves the existing profile identity and retains the playlist editor", async () => {
  const [runtime, profiles] = await Promise.all([read("src/page-runtime.js"), read("src/profiles.js")]);
  assert.match(runtime, /looplyClient as supabase, selfProfile/);
  assert.match(runtime, /await selfProfile\(\)/);
  assert.match(profiles, /name="playlistUrl"/);
  assert.match(profiles, /normalizeYouTubePlaylistUrl/);
  assert.match(profiles, /playlist_url: playlistUrl \|\| null/);
});
