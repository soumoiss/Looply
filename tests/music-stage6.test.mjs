import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("playlist remains sourced from the YouTube Data API with complete pagination and resilient cache", async () => {
  const [playlist, api, proxy] = await Promise.all([read("src/youtube-playlist.js"), read("api/youtube-playlist.js"), read("supabase/functions/looply-youtube-playlist/index.ts")]);
  assert.match(playlist, /fetchPlaylistItems/);
  assert.match(playlist, /nextPageToken/);
  assert.match(playlist, /writePlaylistCache/);
  assert.match(playlist, /Tentar novamente/);
  assert.match(playlist, /youtube-nocookie\.com\/embed/);
  assert.match(api, /LOOPLY_YOUTUBE_API_KEY/);
  assert.match(playlist, /looplystorage\.compute/);
  assert.doesNotMatch(playlist, /LOOPLY_CONFIG\?\.publishableKey/);
  assert.match(proxy, /upstreamEndpoint = "https:\/\/looply-mu\.vercel\.app\/api\/youtube-playlist"/);
  assert.match(proxy, /headers: \{ accept: "application\/json", authorization \}/);
  assert.match(proxy, /access-control-allow-origin/);
  assert.match(proxy, /test\(playlistId\)/);
  assert.doesNotMatch(api, /AIzaSy[A-Za-z0-9_-]{20,}/);
  assert.match(api, /youtube_quota_exceeded/);
});

test("music comments are persisted per track while private admin notes are recipient-only", async () => {
  const [playlist, migration, bridge] = await Promise.all([
    read("src/youtube-playlist.js"),
    read("migration/20261027_cartas_musicas_adm_rls.sql"),
    read("src/neon-rest-bridge.js")
  ]);
  assert.match(playlist, /\.eq\("playlist_id",playlistId\)\.eq\("video_id",track\.videoId\)/);
  assert.match(playlist, /track_key:"youtube:"\+activeTrack\.videoId/);
  assert.match(playlist, /client\.from\("music_track_comments"\)\.insert/);
  assert.match(playlist, /client\.from\("admin_music_track_comments"\)/);
  assert.match(playlist, /recipient_id/);
  assert.match(playlist, /Comentários desta faixa/);
  assert.match(playlist, /youtube-nocookie\.com\/embed/);
  assert.match(migration, /looply_v6_private_mod_select/);
  assert.match(migration, /recipient_id=\(SELECT public\.looply_legacy_uid\(\)\)/);
  assert.match(migration, /looply_v6_private_mod_insert/);
  assert.match(bridge, /music_track_comments:/);
});

test("general comments and multi-recipient dedications remain persisted and realtime-enabled", async () => {
  const [music, migration, css] = await Promise.all([
    read("src/music.js"),
    read("supabase/migrations/20261018192146_music_page_comments.sql"),
    read("assets/css/pages/music.css")
  ]);
  assert.match(music, /data-music-general-comment/);
  assert.match(music, /comment_type: "general"/);
  assert.match(music, /values\.getAll\("recipientId"\)/);
  assert.match(music, /all-users/);
  assert.match(music, /table: "music_page_comments"/);
  assert.match(migration, /alter publication supabase_realtime add table public\.music_page_comments/);
  assert.match(css, /youtube-track-comment/);
});
