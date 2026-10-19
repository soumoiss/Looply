import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
const root = resolve(import.meta.dirname, '..');
test('moderation is session protected and audited', async () => { const edge = await readFile(resolve(root, 'supabase/functions/looply-admin/index.ts'), 'utf8'); const guard = edge.indexOf('const adminSessionToken = String(payload.adminSessionToken || "");'); const action = edge.indexOf('if (action === "moderate_content")'); assert.ok(action > guard); assert.match(edge, /moderation_requested/); assert.match(edge, /moderation_completed/); assert.match(edge, /moderation_failed/); });
test('moderation table is private and used by read policies', async () => { const sql = await readFile(resolve(root, 'supabase/migrations/20261019070000_audited_content_moderation.sql'), 'utf8'); assert.match(sql, /enable row level security/i); assert.match(sql, /revoke all on table public\.looply_content_moderation from public, anon, authenticated/i); assert.match(sql, /looply_content_is_hidden/); });
test('admin UI provides hide and restore controls', async () => { const ui = await readFile(resolve(root, 'src/admin.js'), 'utf8'); assert.match(ui, /data-moderate-content/); assert.match(ui, /Ocultar conteúdo/); assert.match(ui, /Restaurar conteúdo/); });
