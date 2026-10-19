import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [gallery, styles] = await Promise.all([
  read("assets/js/gallery.js"),
  read("assets/css/pages/gallery.css")
]);

test("mobile gallery exposes one filter sheet and horizontal controls", () => {
  assert.match(gallery, /data-filter-sheet/);
  assert.match(gallery, /data-toggle-filters/);
  assert.match(styles, /writing-mode:\s*horizontal-tb/);
  assert.match(styles, /gallery-filter-sheet/);
});

test("gallery cards expose comment presence without loading comment bodies", () => {
  assert.match(gallery, /gallery-comment-dot/);
  assert.match(gallery, /data-comments=/);
  assert.match(gallery, /ensureMediaUrl\(x, mediaType\(x\) === "image"\)/);
  assert.doesNotMatch(gallery, /archive_media_comments.*select\([^)]*body/);
});
