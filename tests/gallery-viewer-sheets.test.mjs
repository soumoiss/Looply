import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gallery = await readFile(new URL("../assets/js/gallery.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../assets/css/pages/gallery.css", import.meta.url), "utf8");
const markup = gallery.slice(gallery.indexOf("const galleryMarkup"), gallery.indexOf('].join("");'));

test("viewer keeps only back, like, admin edit, and more as primary actions", () => {
  assert.match(gallery, /data-close-viewer/);
  assert.match(gallery, /data-viewer-like/);
  assert.match(gallery, /data-open-photo-adjust hidden/);
  assert.match(gallery, /data-toggle-menu/);
  assert.match(gallery, /data-action-sheet/);
  assert.match(styles, /gallery-viewer-bottom/);
});

test("secondary viewer actions and comments stay in sheets without navigation", () => {
  for (const marker of ["data-action-details", "data-share-media", "data-open-comments", "data-viewer-toggle-private", "data-viewer-admin-delete"]) {
    assert.match(gallery, new RegExp(marker));
  }
  assert.match(gallery, /const openComments = async key/);
  assert.match(gallery, /data-comments-modal/);
  for (const selector of [
    "data-close-comments",
    "data-comments-list",
    "data-comment-form",
    "data-comment-recipients",
    "data-comment-mention-search",
    "data-comment-mention-users"
  ]) assert.match(markup, new RegExp(selector));
  assert.match(gallery, /hideSheet\(\$\("\[data-comments-modal\]"\)\)/);
});

test("viewer restores focus to the opening control after closing", () => {
  assert.match(gallery, /viewerTrigger/);
  assert.match(gallery, /trigger\?\.focus\(\)/);
});


test("gallery uses heart for likes, star only for administrative pinning and compact accessible actions",()=>{
  const icons = gallery.match(/icon\(x\.likedByMe\s*\?\s*"heartFilled"\s*:\s*"heart"\)/);
  assert.ok(icons,"gallery likes must use heart icons");
  assert.match(gallery,/icon\("starFilled"\)/,"pinned media must keep a distinct star");
  assert.match(gallery,/data-viewer-like aria-label="Curtir foto"/);
  assert.match(gallery,/data-open-photo-adjust aria-label="Editar foto"/);
  assert.match(gallery,/data-toggle-menu aria-label="Mais opções"/);
  assert.match(gallery,/setAttribute\("aria-label",x\.likedByMe\?"Remover curtida da foto":"Curtir foto"\)/);
  assert.match(styles,/Mobile gallery viewer: accessible icon actions/);
  assert.match(styles,/\.gallery-viewer-bottom \.gallery-viewer-action > span\s*\{[^}]*clip-path: inset\(50%\)/s);
  assert.match(styles,/padding-bottom: max\(10px, env\(safe-area-inset-bottom\)\)/);
});
