import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [gallery, page, runtime, migration, albumMigration, cleanupMigration, pendingMigration, publicationGuard, styles] = await Promise.all([
  readFile(new URL("../assets/js/gallery.js", import.meta.url), "utf8"),
  readFile(new URL("../galeria.html", import.meta.url), "utf8"),
  readFile(new URL("../src/page-runtime.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019024037_gallery_private_folder_admin_delete.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019024648_gallery_albums.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019025302_gallery_media_reference_cleanup.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019025446_gallery_pending_uploads.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019025614_gallery_publication_state_guard.sql", import.meta.url), "utf8"),
  readFile(new URL("../assets/css/pages/gallery.css", import.meta.url), "utf8")
]);

test("gallery page uses the single required title and shared runtime", () => {
  assert.match(page, /<script type="module" src="assets\/js\/gallery\.js"><\/script>/);
  assert.doesNotMatch(page, /SEU ESPAÇO COMPARTILHADO|Fotos, vídeos e lembranças da comunidade Looply/);
  assert.match(gallery, /<h1 class="gallery-title">GALERIA<\/h1>/);
  assert.doesNotMatch(gallery, /gallery-card-title/);
  assert.doesNotMatch(runtime, /Seu espaço compartilhado|Fotos, vídeos e lembranças da comunidade Looply/);
});

test("gallery upload matches the existing private Storage policy and database schema", () => {
  assert.match(gallery, /"gallery\/" \+ user\.id \+ "\/" \+ objectId/);
  assert.match(gallery, /byte_size:file\.size/);
  assert.match(gallery, /set_gallery_media_permissions/);
  assert.match(gallery, /gallery_media_people/);
  assert.match(gallery, /createSignedUrl\(x\.storage_path, 300\)/);
});

test("private-folder access and administrator deletion are enforced in SQL", () => {
  assert.match(migration, /private_owner_id is null/);
  assert.match(migration, /private\.can_view_community_gallery_media/);
  assert.match(migration, /set_gallery_media_private/);
  assert.match(migration, /community_gallery_admin_delete/);
  assert.match(migration, /archive_media_admin_delete/);
  assert.match(migration, /not exists \(\s*select 1 from public\.community_gallery_media media\s*where media\.storage_path = objects\.name/s);
});

test("gallery includes accessible responsive controls and reduced-motion support", () => {
  for (const marker of ["data-open-upload","data-title-filter","data-main=\"privadas\"","data-main=\"exclusivos\"","data-shuffle","data-view=\"masonry\"","data-comments-filter","data-viewer-toggle-private","data-next","data-previous"]) {
    assert.ok(gallery.includes(marker), "Missing gallery control: " + marker);
  }
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /env\(safe-area-inset-top\)/);
});


test("gallery albums are persisted and scoped to their owner", () => {
  assert.match(albumMigration, /create table if not exists public\.gallery_albums/);
  assert.match(albumMigration, /owner_id=\(select auth\.uid\(\)\)/);
  assert.match(albumMigration, /create table if not exists public\.gallery_album_items/);
  assert.match(albumMigration, /private\.can_view_community_gallery_media/);
  assert.match(gallery, /data-create-album/);
  assert.match(gallery, /data-open-album/);
  assert.match(gallery, /data-album-add=/);
});


test("media deletion cleans polymorphic private, album, tag and description references", () => {
  assert.match(cleanupMigration, /cleanup_gallery_media_references/);
  assert.match(cleanupMigration, /gallery_private_items/);
  assert.match(cleanupMigration, /gallery_album_items/);
  assert.match(cleanupMigration, /gallery_media_people/);
  assert.match(cleanupMigration, /gallery_media_descriptions/);
  assert.match(cleanupMigration, /after delete on public\.archive_media/);
  assert.match(cleanupMigration, /after delete on public\.community_gallery_media/);
});


test("incomplete uploads stay hidden and can be cleaned up by their owner", () => {
  assert.match(pendingMigration, /publication_state text not null default 'published'/);
  assert.match(pendingMigration, /media\.publication_state = 'published'/);
  assert.match(pendingMigration, /cleanup_pending_gallery_media/);
  assert.match(pendingMigration, /publication_state='pending'/);
  assert.match(gallery, /publication_state:"pending"/);
  assert.match(gallery, /cleanup_pending_gallery_media/);
  assert.match(gallery, /publication_state:"published"/);
});


test("published gallery media cannot be downgraded to pending to bypass deletion policy", () => {
  assert.match(publicationGuard, /old\.publication_state='published'/);
  assert.match(publicationGuard, /new\.publication_state<>'published'/);
  assert.match(publicationGuard, /before update of publication_state/);
});
