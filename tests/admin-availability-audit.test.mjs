import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

test('availability checks are accepted by the administrative audit contract', async () => {
  const migration = await readFile(resolve(root, 'supabase/migrations/20261020210000_admin_availability_audit.sql'), 'utf8');
  const edge = await readFile(resolve(root, 'supabase/functions/looply-admin/index.ts'), 'utf8');
  assert.match(edge, /recordAccess\(service, authData\.user\.id, "availability_checked", "profiles"/);
  assert.match(migration, /availability_checked/);
  assert.match(migration, /admin_audit_event_check/);
  assert.match(migration, /p_event not in \([\s\S]*?availability_checked/);
});

