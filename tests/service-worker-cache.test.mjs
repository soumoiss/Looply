import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("SW fetches executable assets fresh while respecting versioned caches and offline fallback", async () => {
  const worker = await readFile(resolve(root,"sw.js"),"utf8");
  assert.match(worker,/const CACHE = "looply-shell-v(?:1[4-9]|[2-9][0-9])-[a-z0-9-]+"/);
  assert.match(worker,/Promise\.allSettled\(SHELL\.map/);
  assert.ok(worker.includes("const cached = await cache.match(event.request, { ignoreSearch: false })"));
  assert.match(worker,/if \(critical\) \{/);
  assert.match(worker,/fetch\(event\.request, \{ cache: "no-cache" \}\)/);
  assert.match(worker,/return cached \|\| Response\.error\(\)/);
  assert.match(worker,/if \(cached\) return cached;/);
  assert.match(worker,/response\.type === "basic"/);
  assert.match(worker,/url\.origin === self\.location\.origin/);
  assert.match(worker,/!url\.pathname\.includes\("\/api\/"\)/);
  assert.match(worker,/!url\.pathname\.endsWith\("\/sw\.js"\)/);
  assert.match(worker,/event\.notification\.close\(\)/);
});
