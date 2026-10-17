import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { archiveGalleryMarkup, loadArchiveMedia } from "../src/gallery-archive.js";
import { galleryExperienceMarkup } from "../src/gallery-experience.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

function query(data) {
  return {
    select() { return this; },
    order() { return this; },
    limit() { return this; },
    eq() { return this; },
    then(resolve, reject) { return Promise.resolve({ data, error: null }).then(resolve, reject); }
  };
}

test("archive metadata loads in parallel without signing every media object or downloading every comment", async () => {
  const calls = [];
  const media = [
    { id: "visible", storage_path: "legacy-archive/a.jpg", kind: "image", comment_access: "viewers" },
    { id: "selected", storage_path: "legacy-archive/b.jpg", kind: "image", comment_access: "selected" },
    { id: "closed", storage_path: "legacy-archive/c.jpg", kind: "image", comment_access: "disabled" }
  ];
  const client = {
    from(table) {
      calls.push(table);
      return query(table === "archive_media" ? media : [{ media_id: "selected" }]);
    },
    storage: { from() { throw new Error("media URLs should stay lazy"); } }
  };
  const result = await loadArchiveMedia(client, "member-id");
  assert.deepEqual(calls, ["archive_media", "archive_media_commenters", "archive_media_comments"]);
  assert.deepEqual(result.map((item) => item.canComment), [true, true, false]);
  assert.deepEqual(result.map((item) => item.hasVisibleComments), [false, true, false]);
  assert.ok(result.every((item) => item.signedUrl === null && item.commentsLoaded === false));
});

test("the restored archive keeps search, type/access filters, sort, and all three legacy layouts", async () => {
  const markup = archiveGalleryMarkup([
    { id: "photo", file_name: "photo.jpg", source_path: "midia/photo.jpg", kind: "image", mime_type: "image/jpeg", visibility: "exclusive", created_at: "2026-01-01" }
  ]);
  for (const value of ["data-archive-gallery-search", "data-archive-gallery-type", "data-archive-gallery-access", "data-archive-gallery-sort"]) {
    assert.match(markup, new RegExp(value));
  }
  for (const value of ["grid", "list", "masonry"]) assert.match(markup, new RegExp('data-archive-gallery-view="' + value + '"'));
  assert.match(markup, /data-access="exclusive"/);
  assert.match(markup, /data-comment-audience/);
  assert.match(markup, /data-comment-recipients/);
});

test("viewer navigation supports touch swipes, keyboard arrows, responsive containment, and zoom", async () => {
  const [gallery, css] = await Promise.all([read("src/gallery-archive.js"), read("styles.css")]);
  assert.match(gallery, /pointerup/);
  assert.ok(gallery.includes("Math.abs(dx) < 52"));
  assert.match(gallery, /ArrowLeft/);
  assert.match(gallery, /ArrowRight/);
  assert.match(gallery, /data-media-zoom/);
  assert.ok(css.includes(".archive-viewer-content > img") && css.includes("object-fit: contain"));
  assert.ok(css.includes(".archive-viewer-stage { touch-action: pan-y;"));
});

test("gallery permissions use the active atomic authenticated API", async () => {
  const [manager, edge, migration, audiences] = await Promise.all([
    read("src/gallery-experience.js"),
    read("supabase/functions/looply-admin/index.ts"),
    read("supabase/migrations/20261016195217_gallery_permissions_atomic_rpc.sql"),
    read("supabase/migrations/20261016152935_gallery_private_audiences.sql")
  ]);
  assert.match(manager, /set_gallery_media_permissions/);
  assert.match(manager, /data-comment-audience/);
  assert.match(manager, /data-comment-recipients/);
  assert.match(edge, /userClient\.rpc\("set_gallery_media_permissions"/);
  assert.match(edge, /p_source: "archive"/);
  assert.doesNotMatch(edge, /set_looply_archive_media_access/);
  assert.match(migration, /create or replace function public\.set_gallery_media_permissions/);
  assert.match(migration, /grant execute on function public\.set_gallery_media_permissions[\s\S]*?to authenticated/i);
  assert.ok(audiences.includes("archive_media_comment_recipients"));
  assert.ok(audiences.includes("archive_media_commenters"));
});

test("the page runtime renders before refreshing unread counts and prefetches navigation on intent", async () => {
  const runtime = await read("src/page-runtime.js");
  assert.ok(!runtime.includes("auth.getSession("));
  assert.ok(runtime.includes("prefetchNavigation"));
  assert.ok(runtime.includes("void refreshUnreadBadge"));
  assert.ok(runtime.includes('hint.rel = "prefetch"'));
});


test("archive viewer keeps media dominant and opens comments in a separate persistent drawer", async () => {
  const [gallery, css] = await Promise.all([read("src/gallery-archive.js"), read("styles.css")]);
  assert.match(gallery, /data-viewer-comments-toggle/);
  assert.match(gallery, /data-viewer-comments-panel hidden/);
  assert.match(gallery, /data-viewer-comments-close/);
  assert.match(gallery, /data-viewer-download/);
  assert.match(gallery, /setCommentsOpen\(!state\.commentsOpen\)/);
  assert.match(gallery, /hasVisibleComments: mediaWithReadableComments\.has\(item\.id\)/);
  assert.match(css, /\.archive-viewer-comments\[hidden\] \{ display:none !important; \}/);
  assert.match(css, /object-fit:contain/);
});

test("rebuilt gallery has compact options menu, three layouts, title/type/person filters and immersive viewer", () => {
  const markup = galleryExperienceMarkup();
  for (const selector of [
    "data-gallery-menu-toggle", "data-gallery-menu-action=\"upload\"",
    "data-gallery-menu-action=\"filters\"", "data-gallery-menu-action=\"exclusive\"",
    "data-gallery-menu-action=\"sort\"", "data-gallery-menu-action=\"people\"",
    "data-gallery-view=\"list\"", "data-gallery-view=\"grid\"", "data-gallery-view=\"masonry\"",
    "data-gallery-person", "data-viewer-close", "data-viewer-comments",
    "data-gallery-people-tags-form", "data-comment-audience", "data-comment-recipients"
  ]) assert.ok(markup.includes(selector), "missing gallery control: " + selector);
  assert.match(markup, /gallery-viewer-back/);
  assert.match(markup, /gallery-viewer-bottom-actions/);
  assert.match(markup, /data-viewer-content/);
});
