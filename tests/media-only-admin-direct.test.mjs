import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(resolve(root, file), "utf8");

test("media-only publication contracts allow empty body but keep media requirement", async () => {
  const [schema, social, validation] = await Promise.all([
    read("supabase/migrations/20261015231928_posts_comments_core.sql"),
    read("src/social.js"),
    read("src/publication-validation.js")
  ]);
  assert.match(schema, /body text(?:\s+default ''|\s*;)/i);
  assert.match(schema, /p_body is null or char_length\(btrim\(p_body\)\) between 0 and 5000/i);
  assert.doesNotMatch(social, /id="postBody"[^>]*required/);
  assert.match(validation, /export function validatePublicationInput/);
  assert.match(validation, /mediaCount\s*>\s*0/);
});

test("ADM actions stay direct except permanent community-letter deletion, which requires confirmation", async () => {
  const [admin, gallery, edge] = await Promise.all([
    read("src/admin.js"), read("assets/js/gallery.js"), read("supabase/functions/looply-admin/index.ts")
  ]);
  const safeAdmin = admin.replace('if (!window.confirm("Excluir esta carta permanentemente? Esta ação não pode ser desfeita.")) return;', "");
  assert.doesNotMatch(safeAdmin + gallery, /prompt\(|confirm\(/);
  assert.match(admin, /if \(!window\.confirm\("Excluir esta carta permanentemente\?/);
  assert.doesNotMatch(admin, /purpose\.length\s*<\s*20/);
  assert.match(edge, /function adminAuditPurpose|const adminAuditPurpose/);
  assert.match(edge, /recordAccess\(/);
});

test("story and gallery media-only forms remain optional for text", async () => {
  const [stories, gallery] = await Promise.all([read("src/stories.js"), read("assets/js/gallery.js")]);
  assert.doesNotMatch(stories, /name="body"[^>]*required/);
  assert.match(stories, /!body && !media/);
  assert.match(gallery, /Descrição \S*<textarea name="description" maxlength="10000" placeholder="Adicione uma descrição \(opcional\)"/);
});
