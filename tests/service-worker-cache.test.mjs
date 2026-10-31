import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("SW serves cached static pages immediately without mixing different build URLs", async () => {
  const worker = await readFile(resolve(root,"sw.js"),"utf8");
  assert.match(worker,/const CACHE = "looply-shell-v10-admin-notices-20261031"/);
  assert.match(worker,/Promise\.allSettled\(SHELL\.map/);
  assert.ok(worker.includes("const cached = await cache.match(event.request, { ignoreSearch: false })"));
  assert.match(worker,/if \(cached\) \{/);
  assert.match(worker,/event\.waitUntil\(fetch\(event\.request\)/);
  assert.match(worker,/return cached;/);
  assert.match(worker,/\.catch\(\(\) => cached \|\| Response\.error\(\)\)/);
  assert.doesNotMatch(worker,/cache:\s*"no-cache"/);
  assert.match(worker,/response\.type === "basic"/);
  assert.match(worker,/url\.origin === self\.location\.origin/);
  assert.match(worker,/!url\.pathname\.includes\("\/api\/"\)/);
  assert.match(worker,/!url\.pathname\.endsWith\("\/sw\.js"\)/);
  assert.match(worker,/event\.notification\.close\(\)/);
});
