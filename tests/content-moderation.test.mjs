import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("moderation flags are private and hide content through existing read policies", async () => {
  const migration = await readFile(resolve(root, "supabase/migrations/20261019070000_audited_content_moderation.sql"), "utf8");
  assert.match(migration, /looply_content_moderation/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.looply_content_moderation from public, anon, authenticated/i);
  assert.match(migration, /not private\.looply_content_is_hidden\('post', p\.id\)/);
  assert.match(migration, /looply_content_is_hidden\('comment', id\)/);
  assert.match(migration, /reason text not null check \(char_length\(btrim\(reason\)\) between 20 and 500\)/);
});

test("moderation actions require protected admin session and audit interventions", async () => {
  const edge = await readFile(resolve(root, "supabase/functions/looply-admin/index.ts"), "utf8");
  const guard = edge.indexOf('const adminSessionToken = String(payload.adminSessionToken || "")');
  const moderation = edge.indexOf('if (action === "moderate_content")');
  assert.ok(moderation > guard, "moderation must appear after the protected-session guard");
  assert.match(edge, /moderation_requested/);
  assert.match(edge, /moderation_completed/);
  assert.match(edge, /moderation_failed/);
  assert.match(edge, /post: "posts"[\s\S]*comment: "comments"[\s\S]*archive_media: "archive_media"[\s\S]*archive_media_comment: "archive_media_comments"[\s\S]*music_page_comment: "music_page_comments"/);
  assert.match(edge, /suppliedReason.length > 500/);
  assert.match(edge, /adminAuditPurpose\(action, contentType\)/);
});

test("moderation controls are available for posts and comments", async () => {
  const ui = await readFile(resolve(root, "src/admin.js"), "utf8");
  assert.match(ui, /data-moderate-content/);
  assert.match(ui, /moderate_content/);
  assert.match(ui, /Ocultar conteúdo/);
  assert.match(ui, /Restaurar conteúdo/);
});
