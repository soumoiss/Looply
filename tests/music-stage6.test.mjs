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
  assert.match(playlist, /functions\/v1\/looply-youtube-playlist/);
  assert.match(playlist, /apikey: String\(globalThis\.window\?\.LOOPLY_CONFIG\?\.publishableKey/);
  assert.match(proxy, /upstreamEndpoint = "https:\/\/looply-mu\.vercel\.app\/api\/youtube-playlist"/);
  assert.match(proxy, /headers: \{ accept: "application\/json", authorization \}/);
  assert.match(proxy, /access-control-allow-origin/);
  assert.match(proxy, /allowedPlaylists\.has\(playlistId\)/);
  assert.doesNotMatch(api, /AIzaSy[A-Za-z0-9_-]{20,}/);
  assert.match(api, /youtube_quota_exceeded/);
});

test("track comments use the exact playlist and video IDs and are sent to the administrator privately", async () => {
  const [playlist, migration, edge, admin] = await Promise.all([
    read("src/youtube-playlist.js"),
    read("supabase/migrations/20261018192146_music_page_comments.sql"),
    read("supabase/functions/looply-admin/index.ts"),
    read("src/admin.js")
  ]);
  assert.match(playlist, /playlist_id: playlistId, video_id: activeTrack\.videoId/);
  assert.match(playlist, /Comentário para Peixinho ADM/);
  assert.match(migration, /author_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_admin\(\)/);
  assert.match(migration, /comment_type = 'general'/);
  assert.ok(migration.includes("and video_id ~ '^[A-Za-z0-9_-]{11}$'"));
  assert.equal(migration.split("create table public.music_page_comments").length - 1, 1);
  assert.equal(migration.split("create or replace function public.record_looply_admin_access").length - 1, 1);
  assert.match(edge, /youtube_track_comments/);
  assert.match(admin, /value="youtube_track_comments"/);
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
