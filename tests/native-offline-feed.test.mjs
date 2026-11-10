import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publishNativeFeedSnapshot } from "../src/native-feed-bridge.js";

const account = "11111111-1111-4111-8111-111111111111";
const postId = "22222222-2222-4222-8222-222222222222";

test("only explicitly public feed posts reach the Android SQLite bridge", () => {
  const calls = [];
  globalThis.window = { LooplyNativeFeed: { postMessage: message => calls.push(JSON.parse(message)) } };
  const posts = [
    { id: postId, visibility: "public", body: "Publicação A",
      author: { display_name: "Patati" }, created_at: "2026-11-10T20:00:00",
      media: [{ kind: "image", storage_path: "posts/example.webp",
        signedUrl: "https://example.r2.dev/path?token=short-lived" }] },
    { id: "33333333-3333-4333-8333-333333333333",
      visibility: "selected", body: "Privado" },
    { id: "44444444-4444-4444-8444-444444444444",
      visibility: "public", external_url: "https://www.youtube.com/example" }
  ];
  assert.equal(publishNativeFeedSnapshot(account, posts), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "snapshot");
  assert.equal(calls[0].account, account);
  assert.deepEqual(calls[0].posts.map(x => x.id), [postId]);
  assert.equal(calls[0].posts[0].author, "Patati");
  delete globalThis.window;
});

test("never overwrite valid offline feed with an unsuccessful online fetch", () => {
  const calls = [];
  globalThis.window = { LooplyNativeFeed: { postMessage: message => calls.push(message) } };
  assert.equal(publishNativeFeedSnapshot(account, [], Error("offline")), false);
  assert.equal(publishNativeFeedSnapshot("not-a-uuid", []), false);
  assert.deepEqual(calls, []);
  delete globalThis.window;
});

test("native feed is a separate Android Activity with no WebView or HTML runtime", async () => {
  const activity = await readFile(new URL("../android/app/src/main/java/com/soumoiss/looply/NativeFeedActivity.kt", import.meta.url), "utf8");
  const db = await readFile(new URL("../android/app/src/main/java/com/soumoiss/looply/NativeFeedStore.kt", import.meta.url), "utf8");
  const main = await readFile(new URL("../android/app/src/main/java/com/soumoiss/looply/MainActivity.kt", import.meta.url), "utf8");
  assert.match(activity, /RecyclerView/);
  assert.doesNotMatch(activity, /import android\\.webkit\\.WebView|WebView\\(|\\.loadUrl\\(|soumoiss\\.github\\.io/);
  assert.match(db, /SQLiteOpenHelper/);
  assert.match(db, /visibility.*public/);
  assert.match(db, /RETENTION_MS = 7L/);
  assert.match(main, /NativeFeedBridge\.register/);
  assert.match(main, /NativeFeedActivity::class\.java/);
});
