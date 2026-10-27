import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("administrator playlist browser uses Neon Auth role, embedded playback and private RLS write", async () => {
  const [module, page, migration, bridge] = await Promise.all([
    read("src/music-admin-playlists.js"), read("assets/js/music.js"),
    read("migration/20261027_cartas_musicas_adm_rls.sql"), read("src/neon-rest-bridge.js")
  ]);
  assert.match(module, /client\.rpc\("v3_self_is_admin"\)/);
  assert.match(module, /adminError\|\|admin!==true/);
  assert.match(module, /youtube-nocookie\.com\/embed\/videoseries/);
  assert.match(module, /client\.from\("admin_music_track_comments"\)\.insert/);
  assert.match(module, /fetchPlaylistItems/);
  assert.match(module, /select\("id"\)/);
  assert.match(module, /selectedUser/);
  assert.match(migration, /looply_v6_private_mod_insert/);
  assert.match(migration, /v3_self_is_admin/);
  assert.match(migration, /looply_v6_private_mod_select/);
  assert.match(bridge, /admin_music_track_comments:/);
  assert.match(page, /mountMusicAdminPlaylistPanel/);
});

test("administrator track comments are scoped to the owner by row-level security", async () => {
  const migration = await read("supabase/migrations/20261023120000_admin_private_music_track_comments.sql");
  assert.match(migration, /recipient_id uuid references public\.profiles/);
  assert.match(migration, /recipient_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_admin\(\)/);
  assert.match(migration, /video_id ~ '\^\[A-Za-z0-9_-\]\{11\}\$'/);
});
