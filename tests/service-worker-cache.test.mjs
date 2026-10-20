import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

test('service worker activates a fresh shell cache and revalidates static files', async () => {
  const worker = await readFile(resolve(root, 'sw.js'), 'utf8');
  const cache = worker.match(/const CACHE = "([^"]+)"/);
  assert.ok(cache, 'service worker must declare a shell cache version');
  assert.notEqual(cache[1], 'looply-shell-v2', 'deployment must invalidate the stale v2 shell');
  assert.match(worker, /fetch\(new Request\(event\.request,\s*\{\s*cache:\s*"no-cache"\s*\}\)\)/);
});

