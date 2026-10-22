import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

test('service worker activates a fresh shell cache and respects browser HTTP caching', async () => {
  const worker = await readFile(resolve(root, 'sw.js'), 'utf8');
  const cache = worker.match(/const CACHE = "([^"]+)"/);
  assert.ok(cache, 'service worker must declare a shell cache version');
  assert.equal(cache[1], 'looply-shell-v7', 'deployment must invalidate entries created under the old forced-revalidation policy');
  assert.match(worker, /fetch\(event\.request\)/);
  assert.doesNotMatch(worker, /cache:\s*"no-cache"/, 'static requests must not bypass the browser HTTP cache');
  assert.match(worker, /\.catch\(\(\) => cached\)/, 'cached static files remain available when the network is offline');
});

