import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("only the verified administrator can persist gallery pins", async () => {
  const migration = await read("supabase/migrations/20261024221744_gallery_admin_pins.sql");
  assert.match(migration, /create table if not exists public\.gallery_media_pins/);
  assert.match(migration, /auth\.uid\(\) is null or not private\.is_admin\(\)/);
  assert.match(migration, /revoke all on function public\.set_gallery_media_pinned[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute[\s\S]*to authenticated/i);
});

test("pinned media is visibly identified and sorted before recent media", async () => {
  const gallery = await read("assets/js/gallery.js");
  assert.match(gallery, /client\.from\("gallery_media_pins"\)/);
  assert.match(gallery, /Number\(Boolean\(b\.isPinned\)\) - Number\(Boolean\(a\.isPinned\)\)/);
  assert.match(gallery, /data-admin-pin/);
  assert.match(gallery, /set_gallery_media_pinned/);
  assert.match(gallery, /Fixada pela administração/);
});
