import assert from "node:assert/strict";
import test from "node:test";
import { cachedSignedUrl, cachedSignedUrls } from "../src/storage-url-cache.js";

function mockStore() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

function mockClient(userId = "user-1") {
  const stats = { singles: 0, batches: 0, paths: [] };
  const client = {
    auth: { async getSession() { return { data: { session: { user: { id: userId } } } }; } },
    storage: { from(bucket) {
      return {
        async createSignedUrl(path) {
          stats.singles++;
          return { data: { signedUrl: `https://test.invalid/${bucket}/${path}?token=${stats.singles}` }, error: null };
        },
        async createSignedUrls(paths) {
          stats.batches++;
          stats.paths.push(paths);
          return { data: paths.map(path => ({ path, signedUrl: `https://test.invalid/${bucket}/${path}?batch=${stats.batches}` })), error: null };
        }
      };
    } }
  };
  return { client, stats };
}

test("private URLs reuse the same signed token within a session", async () => {
  globalThis.sessionStorage = mockStore();
  const { client, stats } = mockClient();
  const first = await cachedSignedUrl(client, "looply-media", "picture.jpg");
  const second = await cachedSignedUrl(client, "looply-media", "picture.jpg");
  assert.equal(first.data.signedUrl, second.data.signedUrl);
  assert.equal(stats.singles, 1);
  delete globalThis.sessionStorage;
});

test("batch signing only requests URLs that are not cached and keeps original order", async () => {
  globalThis.sessionStorage = mockStore();
  const { client, stats } = mockClient("batch-user");
  const original = await cachedSignedUrls(client, "looply-chat", ["a.jpg", "b.jpg"]);
  const reused = await cachedSignedUrls(client, "looply-chat", ["b.jpg", "c.jpg", "a.jpg"]);
  assert.equal(stats.batches, 2);
  assert.deepEqual(stats.paths, [["a.jpg", "b.jpg"], ["c.jpg"]]);
  assert.equal(reused.data[0].signedUrl, original.data[1].signedUrl);
  assert.equal(reused.data[2].signedUrl, original.data[0].signedUrl);
  assert.match(reused.data[1].signedUrl, /c\.jpg/);
  delete globalThis.sessionStorage;
});

test("URL cache is scoped per authenticated user", async () => {
  globalThis.sessionStorage = mockStore();
  const first = mockClient("account-a"), other = mockClient("account-b");
  await cachedSignedUrl(first.client, "looply-media", "private.jpg");
  await cachedSignedUrl(other.client, "looply-media", "private.jpg");
  assert.equal(first.stats.singles, 1);
  assert.equal(other.stats.singles, 1);
  delete globalThis.sessionStorage;
});

test("short-lived signed URLs are not cached past their original token lifetime", async () => {
  globalThis.sessionStorage = mockStore();
  const { client, stats } = mockClient("short");
  await cachedSignedUrl(client, "looply-media", "short.jpg", 30);
  await cachedSignedUrl(client, "looply-media", "short.jpg", 30);
  assert.equal(stats.singles, 2);
  delete globalThis.sessionStorage;
});
