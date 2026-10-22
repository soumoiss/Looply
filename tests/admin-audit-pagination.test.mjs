import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
const root = resolve(import.meta.dirname, '..');

test('audit reader uses bounded offset pagination and remains service-role only', async () => {
  const sql = await readFile(resolve(root, 'supabase/migrations/20261019090000_admin_audit_pagination.sql'), 'utf8');
  assert.match(sql, /p_offset integer default 0/i);
  assert.match(sql, /p_offset, 0\) > 10000/i);
  assert.match(sql, /offset greatest\(coalesce\(p_offset, 0\), 0\)/i);
  assert.match(sql, /revoke all on function public\.read_looply_admin_audit\(uuid, integer, integer\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.read_looply_admin_audit\(uuid, integer, integer\) to service_role/i);
});

test('admin edge function forwards offset to the audit RPC', async () => {
  const edge = await readFile(resolve(root, 'supabase/functions/looply-admin/index.ts'), 'utf8');
  assert.match(edge, /read_looply_admin_audit", \{ p_actor_id: actorId, p_limit: 100, p_offset: offset \}/);
});

test('admin UI makes offset paging available for all letter collections, archive media, and audit', async () => {
  const ui = await readFile(resolve(root, 'src/admin.js'), 'utf8');
  assert.match(ui, /\["archive_media", "archived_cards", "audit", "community_letters", "letters"\]\.includes\(event\.target\.value\)/);
  assert.match(ui, /data-admin-page="previous"/);
  assert.match(ui, /data-admin-page="next"/);
});
