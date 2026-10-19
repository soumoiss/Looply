import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [gallery, notifications, migration] = await Promise.all([
  readFile(new URL("../assets/js/gallery.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/js/notifications.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261019190000_fix_gallery_comments_mentions.sql", import.meta.url), "utf8")
]);

test("editing gallery mentions initializes the saved selection before filtering or saving", () => {
  const start = gallery.indexOf('$("[data-edit-mentions]")');
  const end = gallery.indexOf('$$("[data-close-tags]")', start);
  assert.ok(start >= 0 && end > start, "mention editor handlers should exist");
  const editor = gallery.slice(start, end);
  assert.match(editor, /selectedTagPeople=new Set\(x\.peopleIds\|\|\[\]\)/);
  assert.match(editor, /usersHtml\(selectedTagPeople/);
  assert.match(editor, /client\.from\("gallery_media_people"\)\.insert/);
});

test("gallery comments are created through the permission-checking RPC and reloaded after publishing", () => {
  assert.match(gallery, /create_community_gallery_comment/);
  assert.match(gallery, /Comentário publicado\./);
  assert.match(gallery, /x\.hasComments = true; draw\(\); await loadComments\(\)/);
  assert.match(gallery, /Ainda não há comentários visíveis para você\./);
});

test("gallery notification kinds are preserved and author-only comments are visible to the media owner", () => {
  for (const kind of ["'gallery_comment'", "'gallery_tag'", "'post_like'", "'story_like'"]) {
    assert.ok(migration.includes(kind), "missing notification kind " + kind);
  }
  assert.match(migration, /author_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /comment_row\.audience = 'author_only'[\s\S]*?media\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /new\.audience not in \('members', 'media_viewers', 'author_only'\)/);
  assert.match(migration, /'gallery_comment'/);
});

test("gallery comment and mention notifications have labels and open the gallery", () => {
  assert.match(notifications, /gallery_comment: "Comentário na galeria"/);
  assert.match(notifications, /gallery_tag: "Menção na galeria"/);
  assert.match(notifications, /item\.kind === "gallery_comment" \|\| item\.kind === "gallery_tag"/);
});
