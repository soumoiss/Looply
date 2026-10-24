import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("administrator playlist browser is permission-gated and uses embedded playback", async () => {
  const [module, page, edge] = await Promise.all([
    read("src/music-admin-playlists.js"), read("assets/js/music.js"), read("supabase/functions/looply-admin/index.ts")
  ]);
  assert.match(module, /resourceType: "status"/);
  assert.match(module, /status\?\.isAdmin !== true/);
  assert.match(module, /youtube-nocookie\.com\/embed\/videoseries/);
  assert.match(module, /admin_music_track_comment/);
  assert.match(await read("src/youtube-playlist.js"), /Mensagem privada da administração/);
  assert.match(await read("src/youtube-playlist.js"), /recipient_id,author:profiles/);
  assert.match(page, /mountMusicAdminPlaylistPanel/);
  assert.match(edge, /action === "admin_music_track_comment"/);
  assert.match(edge, /recipient_id: recipientId/);
  assert.match(edge, /title \+ "\\n" \+ body/);
  assert.match(edge, /recordAccess\(service, authData\.user\.id, "write_completed"/);
});

test("administrator track comments are scoped to the owner by row-level security", async () => {
  const migration = await read("supabase/migrations/20261023120000_admin_private_music_track_comments.sql");
  assert.match(migration, /recipient_id uuid references public\.profiles/);
  assert.match(migration, /recipient_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_admin\(\)/);
  assert.match(migration, /video_id ~ '\^\[A-Za-z0-9_-\]\{11\}\$'/);
});
