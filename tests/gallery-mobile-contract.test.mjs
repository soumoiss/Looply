import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [gallery, styles, html, runtime] = await Promise.all([
  read("assets/js/gallery.js"),
  read("assets/css/pages/gallery.css"),
  read("galeria.html"),
  read("src/page-runtime.js")
]);

test("mobile gallery exposes one filter sheet and horizontal controls", () => {
  assert.match(gallery, /data-filter-sheet/);
  assert.match(gallery, /data-toggle-filters/);
  assert.match(styles, /writing-mode:\s*horizontal-tb/);
  assert.match(styles, /gallery-filter-sheet/);
  assert.match(styles, /gallery-primary-tabs \.gallery-tab\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*max-content;/s);
});

test("gallery controls render the requested 3-by-2 action layout", () => {
  assert.match(gallery, /gallery-action-row[\\s\\S]*data-open-upload[\\s\\S]*data-toggle-filters[\\s\\S]*data-toggle-page-menu/);
  assert.match(gallery, /gallery-category-row[\\s\\S]*data-main="recentes"[\\s\\S]*data-main="privadas"[\\s\\S]*data-main="exclusivos"/);
  assert.match(styles, /gallery-action-row[^\\{]*\\{[^}]*grid-template-columns:repeat\\(3,minmax\\(0,1fr\\)\\)/);
  assert.match(styles, /gallery-category-row[^\\{]*\\{[^}]*grid-template-columns:repeat\\(3,minmax\\(0,1fr\\)\\)/);
  assert.match(gallery, /data-toggle-page-menu[\\s\\S]*data-open-people-filter[\\s\\S]*data-shuffle[\\s\\S]*data-create-album/);
});

test("gallery cards expose comment presence without loading comment bodies", () => {
  assert.match(gallery, /gallery-comment-dot/);
  assert.match(gallery, /data-comments=/);
  assert.match(gallery, /ensureMediaUrl\(x, mediaType\(x\) === "image"\)/);
  assert.doesNotMatch(gallery, /archive_media_comments.*select\([^)]*body/);
});

test("gallery list view loads RLS-visible comments inline and keeps the full comments sheet", () => {
  assert.match(gallery, /view === "list" \? descriptionMarkup\(x\) \+ inlineCommentsMarkup\(x\)/);
  assert.match(gallery, /if \(view === "list"\) void loadInlineComments\(list\)/);
  assert.match(gallery, /client\.from\(table\)\.select\("id,media_id,author_id,body,created_at,audience"\)[\s\S]*?\.in\("media_id"/);
  assert.match(gallery, /rows\.slice\(-3\)/);
  assert.match(styles, /gallery-inline-comments/);
  assert.match(gallery, /openComments\(comments\.dataset\.comments\)/);
});

test("gallery starts with neutral loading UI while preserving signed-out handling", () => {
  assert.match(html, /Carregando suas fotos/);
  assert.match(html, /gallery-skeleton-card/);
  assert.doesNotMatch(html, /Entrar para acessar a galeria|Entre na sua conta Looply/);
  assert.match(runtime, /if \(!user\) \{\s*if \(page === "gallery"\)/);
});
