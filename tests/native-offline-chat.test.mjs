import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cacheThreadForNative, mountNativeChatShortcut } from "../src/native-chat-bridge.js";

const account = "123e4567-e89b-42d3-a456-426614174000";
const conversationId = "123e4567-e89b-42d3-a456-426614174001";
const peer = "123e4567-e89b-42d3-a456-426614174002";
const messageId = "123e4567-e89b-42d3-a456-426614174003";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("only online-authorized conversations are passed to the native encryption bridge", () => {
  const calls = [];
  globalThis.window = { LooplyNativeChat: { postMessage: text => calls.push(JSON.parse(text)) } };
  const conversation = { id: conversationId, kind: "direct" };
  const people = [
    { user_id: account, profile: { display_name: "Eu" } },
    { user_id: peer, profile: { display_name: "Contato" } }
  ];
  const messages = [{ id: messageId, body: "Olá!", created_at: "2026-11-10T20:00:00Z",
    sender_id: peer, author: { display_name: "Contato" },
    media: [], signedUrl: "should not be copied" }];
  assert.equal(cacheThreadForNative(account, conversation, people, messages), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].account, account);
  assert.equal(calls[0].conversation, conversationId);
  assert.equal(calls[0].title, "Contato");
  assert.equal(calls[0].messages[0].body, "Olá!");
  assert.equal(calls[0].messages[0].mine, false);
  assert.equal(JSON.stringify(calls[0]).includes("signedUrl"), false);
  assert.equal(cacheThreadForNative(account, conversation, [], messages), false);
  assert.equal(cacheThreadForNative("bad-account", conversation, people, messages), false);
  assert.equal(cacheThreadForNative(account, conversation, people, []), false);
  assert.equal(calls.length, 1);
  delete globalThis.window;
});

test("no private content is cached when native API is unavailable", () => {
  delete globalThis.window;
  assert.equal(cacheThreadForNative(account, { id: conversationId }, [], []), false);
  assert.doesNotThrow(() => mountNativeChatShortcut(null));
});

test("Android offline chat uses Keystore AES-GCM and no browser rendering", async () => {
  const db = await read("android/app/src/main/java/com/soumoiss/looply/NativeChatStore.kt");
  const bridge = await read("android/app/src/main/java/com/soumoiss/looply/NativeChatBridge.kt");
  const activity = await read("android/app/src/main/java/com/soumoiss/looply/NativeChatActivity.kt");
  const main = await read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  const manifest = await read("android/app/src/main/AndroidManifest.xml");
  assert.match(db, /SQLiteOpenHelper/);
  assert.match(db, /AndroidKeyStore/);
  assert.match(db, /AES\/GCM\/NoPadding/);
  assert.match(db, /updateAAD\(aad\(account, conversation\)\)/);
  assert.match(db, /MAX_MESSAGES = 60/);
  assert.match(db, /MAX_CONVERSATIONS = 20/);
  assert.match(db, /RETENTION_MS = 30L/);
  assert.doesNotMatch(activity, /import android\.webkit\.WebView|WebView\(|\.loadUrl\(/);
  assert.match(activity, /RecyclerView/);
  assert.match(bridge, /isMainFrame/);
  assert.match(bridge, /sourceOrigin\.toString\(\) != ORIGIN/);
  assert.match(main, /NativeChatBridge\.register/);
  assert.match(main, /NativeChatActivity::class\.java/);
  assert.match(manifest, /android:name="\.NativeChatActivity"\s+android:exported="false"/);
});

test("Neon sign-out purges the encrypted offline chat library", async () => {
  const runtime = await read("src/page-runtime.js");
  const neon = await read("src/neon-production-client.js");
  assert.match(runtime, /LooplyNativeChat\?\.postMessage/);
  assert.match(neon, /LooplyNativeChat\?\.postMessage/);
});
