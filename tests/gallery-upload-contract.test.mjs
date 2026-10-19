import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [gallery, migration] = await Promise.all([
  readFile(new URL("../assets/js/gallery.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019075000_gallery_upload_media_formats.sql", import.meta.url), "utf8")
]);

test("gallery accepts the browser's full image, video and audio MIME families", () => {
  assert.match(gallery, /accept="image\/\*,video\/\*,audio\/\*"/);
  assert.match(gallery, /declared\.startsWith\("image\/"\)/);
  assert.match(gallery, /declared\.startsWith\("video\/"\)/);
  assert.match(gallery, /declared\.startsWith\("audio\/"\)/);
  assert.doesNotMatch(gallery, /allowedMime\.has\(file\.type\)/);
});

test("gallery upload infers common device formats when browser MIME is empty", () => {
  for (const ext of ["gif", "avif", "heic", "heif", "tiff", "bmp", "mov", "mkv", "avi", "3gp", "mts", "flac", "opus"]) {
    assert.ok(gallery.includes(ext + ":"), "Missing MIME inference for " + ext);
  }
  assert.match(gallery, /contentType:mimeType/);
  assert.match(gallery, /mime_type:mimeType/);
});

test("database and private Storage policies remove gallery-specific MIME and size caps", () => {
  assert.match(migration, /allowed_mime_types = null/);
  assert.match(migration, /file_size_limit = null/);
  assert.match(migration, /\[a-z0-9\]\{1,20\}/);
  assert.doesNotMatch(migration, /209715200|104857600/);
});
