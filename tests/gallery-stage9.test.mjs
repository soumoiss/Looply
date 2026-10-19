import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [gallery, page, runtime, migration, albumMigration, cleanupMigration, pendingMigration, publicationGuard, styles, permissionsMigration] = await Promise.all([
  readFile(new URL("../assets/js/gallery.js", import.meta.url), "utf8"),
  readFile(new URL("../galeria.html", import.meta.url), "utf8"),
  readFile(new URL("../src/page-runtime.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019024037_gallery_private_folder_admin_delete.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019024648_gallery_albums.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019025302_gallery_media_reference_cleanup.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019025446_gallery_pending_uploads.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019025614_gallery_publication_state_guard.sql", import.meta.url), "utf8"),
  readFile(new URL("../assets/css/pages/gallery.css", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019043000_fix_gallery_publish_and_comment_permissions.sql", import.meta.url), "utf8")
]);

test("gallery page uses the single required title and shared runtime", () => {
  assert.match(page, /<script type="module" src="assets\/js\/gallery\.js"><\/script>/);
  assert.doesNotMatch(page, /SEU ESPAÇO COMPARTILHADO|Fotos, vídeos e lembranças da comunidade Looply/);
  assert.match(gallery, /<h1 class="gallery-title">Galeria<\/h1>/);
  assert.doesNotMatch(gallery, /gallery-card-title/);
  assert.doesNotMatch(runtime, /Seu espaço compartilhado|Fotos, vídeos e lembranças da comunidade Looply/);
  assert.match(runtime, /supabase\.auth\.getSession\(\)/);
  assert.match(runtime, /sessionData\?\.session\?\.user/);
  assert.match(runtime, /getUser\(\)/);
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


test("Title filter renders saved albums and album selection opens the album", () => {
  assert.match(gallery, /const showingAlbums = kind === "album" && !activeAlbumId/);
  assert.match(gallery, /data-open-album=/);
  assert.match(gallery, /data-delete-album=/);
  assert.match(gallery, /\$\("\[data-album-select\]"\)\.addEventListener\("change"/);
  assert.match(styles, /gallery-album-open/);
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

test("gallery binds multi-control groups with querySelectorAll instead of querySelector", () => {
  const lines = gallery.split(String.fromCharCode(10)).map(line => line.trimStart());
  for (const selector of ["[data-kind]", "[data-main]", "[data-close-access]", "[data-close-tags]", "[data-close-album]"]) {
    const allQuery = "$$(" + '"' + selector + '"' + ").forEach(";
    const singleQuery = "$(" + '"' + selector + '"' + ").forEach(";
    assert.ok(lines.some(line => line.startsWith(allQuery)), "Expected all controls for " + selector);
    assert.ok(!lines.some(line => line.startsWith(singleQuery)), "Single-element query used for " + selector);
  }
});


test("Peixinho can rotate and reposition gallery photos with shared server persistence", () => {
  const adjustmentMigration = readFile(new URL("../supabase/migrations/20261019042000_gallery_admin_photo_adjustments.sql", import.meta.url), "utf8");
  return adjustmentMigration.then(sql => {
    assert.match(gallery, /data-open-photo-adjust/);
    assert.match(gallery, /data-rotate-left/);
    assert.match(gallery, /data-rotate-right/);
    assert.match(gallery, /data-position-x/);
    assert.match(gallery, /data-position-y/);
    assert.match(gallery, /set_gallery_media_adjustment/);
    assert.match(gallery, /transform-origin:center center/);
    assert.match(sql, /private\.is_admin\(\)/);
    assert.match(sql, /gallery_media_adjustments/);
    assert.match(sql, /position_x between -20 and 20/);
    assert.match(sql, /position_y between -20 and 20/);
    assert.match(styles, /gallery-photo-adjust/);
    assert.match(styles, /gallery-control-text/);
  });
});


test("gallery upload and comments permissions are granted to authenticated members with RLS limits", () => {
  assert.ok(permissionsMigration.includes("grant select, insert on table public.community_gallery_media to authenticated"));
  assert.ok(permissionsMigration.includes("grant update (publication_state) on table public.community_gallery_media to authenticated"));
  assert.ok(permissionsMigration.includes("publication_state = 'pending'"));
  assert.ok(permissionsMigration.includes("private.try_uuid"));
  assert.ok(permissionsMigration.includes("select private.can_view_community_gallery_media(p_media_id)"));
  assert.ok(permissionsMigration.includes("select private.can_view_archive_media(p_media_id)"));
  assert.ok(permissionsMigration.includes("grant execute on function private.can_comment_community_gallery_media"));
});

test("gallery toolbar actions are icon-first and adapt to the selected Looply theme", () => {
  assert.ok(gallery.includes('data-main="recentes" aria-label="Recentes" title="Recentes"'));
  assert.ok(gallery.includes('data-open-upload aria-label="Adicionar mídia" title="Adicionar mídia"'));
  assert.ok(gallery.includes('data-comments-filter aria-label="Filtrar mídias com comentários"'));
  assert.ok(styles.includes("--gallery-action: var(--primary-dark, var(--primary"));
  assert.ok(styles.includes("--gallery-control-text: var(--text"));
  assert.ok(styles.includes("gallery-card-actions button[data-comments] span { display: none"));
});


test("viewer keeps persisted photo adjustment and synchronizes zoom state across media", async () => {
  const adjustment = gallery.slice(gallery.indexOf("const applyPhotoAdjustment"), gallery.indexOf("const draftPhotoAdjustment"));
  const zoom = gallery.slice(gallery.indexOf("const setZoom"), gallery.indexOf('$("[data-zoom-in]")'));
  assert.match(adjustment, /rotate\(.*adjustment\.rotation/s);
  assert.match(adjustment, /scale\(.*viewerZoom/s);
  assert.match(adjustment, /image\.dataset\.zoom = String\(viewerZoom \|\| 1\)/);
  assert.match(zoom, /if\(x\)applyPhotoAdjustment\(x\)/);
  assert.match(zoom, /img\.dataset\.zoom=String\(viewerZoom\)/);
  assert.match(gallery, /x\.savedAdjustment = \{\.\.\.adjustment\}/);
});


test("gallery load tolerates rejected ancillary queries and keeps thumbnail grid compact", async () => {
  const source = await readFile(new URL("../assets/js/gallery.js", import.meta.url), "utf8");
  assert.match(source, /const safeQuery = async query => \\{ try \\{ return await query; \\} catch \\(error\\) \\{ return \\{ data: null, error \\}; \\} \\}/);
  assert.match(source, /gallery_album_items.*?\\n      \\]\\.map\\(safeQuery\\)/s);
  assert.match(source, /gallery_media_adjustments.*?await safeQuery/s);
  assert.match(source, /gallery_media_descriptions.*?\\n      \\]\\.map\\(safeQuery\\)/s);
  assert.match(source, /community_gallery_media_likes.*?\\n      \\]\\.map\\(safeQuery\\)/s);
  assert.match(styles, /gallery-grid:not\\(\\.list\\):not\\(\\.masonry\\) \\.gallery-card-body\\{display:none\\}/);
  assert.match(styles, /gallery-grid:not\\(\\.list\\):not\\(\\.masonry\\) \\.gallery-media\\{aspect-ratio:1\\/1/);
});
