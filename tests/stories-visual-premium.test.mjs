import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sheet = read("assets/css/pages/stories-premium-polish.css");

test("Stories premium visual layer loads last on home and chat", () => {
  for (const page of ["home.html", "chat.html"]) {
    const html = read(page);
    const file = "assets/css/pages/stories-premium-polish.css";
    assert.equal(html.split(file).length, 2, page + " must load the layer once");
    assert.ok(html.indexOf(file) > html.indexOf("assets/css/theme-complete.css"), page + " must load last");
  }
});

test("Stories redesign keeps original handlers and media proportions", () => {
  for (const required of [
    ".studio-top", ".studio-side", ".studio-camera-bottom", ".studio-shutter",
    ".studio-edit-tools", ".studio-edit-bottom", ".studio-publish-row",
    ".studio-modal-panel", ".story-viewer-header", ".story-viewer-actions",
    ".story-owner-action", ".story-reply-form", ".story-close-floating"
  ]) {
    assert.ok(sheet.includes(required), required);
  }
  assert.match(sheet, /object-fit:\s*contain\s*!important/);
  assert.match(sheet, /--story-brand:\s*var\(--primary/);
  assert.match(sheet, /env\(safe-area-inset-bottom\)/);
  assert.match(sheet, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(sheet, /pointer-events:\s*none\s*!important/);
  // Atributos hidden devem continuar escondendo menus inativos.
  assert.match(sheet, /\.story-viewer-owner-actions\[hidden\]/);
});
