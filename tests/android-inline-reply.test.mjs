import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dispatchImmediateChat } from "../backend/cloudflare/android-push-worker.mjs";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const bearer = "Bearer " + "a".repeat(64);
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

function call({ origin, authorization = bearer, id = uuid } = {}) {
  return new Request("https://looply-android-push.s0upoetamoiss.workers.dev/chat-notify", {
    method: "POST",
    headers: {
      ...(origin === undefined ? {} : { origin }),
      authorization,
      "content-type": "application/json"
    },
    body: JSON.stringify({ messageId: id })
  });
}

test("a native Android message may trigger immediate FCM without browser Origin, but only through Neon verification", async () => {
  let validations = 0, deliveries = 0;
  const result = await dispatchImmediateChat({}, {
    request: call(),
    authFetch: async (_url, init) => {
      validations++;
      assert.equal(init.headers.authorization, bearer);
      assert.deepEqual(JSON.parse(init.body), { p_message_id: uuid });
      return Response.json(uuid);
    },
    deliver: async () => { deliveries++; return { sent: 1, failed: 0 }; }
  });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).accepted, 1);
  assert.equal(validations, 1);
  assert.equal(deliveries, 1);
});

test("unknown browser origin remains forbidden and never calls Neon", async () => {
  let calls = 0;
  const response = await dispatchImmediateChat({}, {
    request: call({ origin: "https://attacker.example" }),
    authFetch: async () => { calls++; return Response.json(uuid); },
    deliver: async () => { calls++; return { sent: 1, failed: 0 }; }
  });
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test("originless native request cannot bypass invalid JWT or message ownership", async () => {
  const noJwt = await dispatchImmediateChat({}, {
    request: call({ authorization: "" })
  });
  assert.equal(noJwt.status, 401);
  const invalidId = await dispatchImmediateChat({}, {
    request: call({ id: "bad" })
  });
  assert.equal(invalidId.status, 400);
  let deliveries = 0;
  const unauthorized = await dispatchImmediateChat({}, {
    request: call(),
    authFetch: async () => new Response("forbidden", { status: 403 }),
    deliver: async () => { deliveries++; return { sent: 1, failed: 0 }; }
  });
  assert.equal(unauthorized.status, 403);
  assert.equal(deliveries, 0);
});

test("Android inline replies never open MainActivity or WebView as part of sending", async () => {
  const service = await read("android/app/src/main/java/com/soumoiss/looply/LooplyMessagingService.kt");
  const receiver = await read("android/app/src/main/java/com/soumoiss/looply/NativeInlineReplyReceiver.kt");
  const manifest = await read("android/app/src/main/AndroidManifest.xml");
  assert.match(service, /RemoteInput\.Builder\(/);
  assert.match(service, /FLAG_MUTABLE/);
  assert.match(service, /PendingIntent\.getBroadcast\(/);
  assert.match(service, /NativeInlineReplyReceiver::class\.java/);
  assert.match(receiver, /NativeCallSessionStore\.read\(app\)/);
  assert.match(receiver, /chat_messages\?select=id/);
  assert.match(receiver, /Prefer", "return=representation"/);
  assert.match(receiver, /verifyAlreadyInserted/);
  assert.match(receiver, /\.appendQueryParameter\("sender_id", "eq\.\$account"\)/);
  assert.match(receiver, /requestImmediatePush/);
  assert.match(manifest, /android:name="\.NativeInlineReplyReceiver"\s+android:exported="false"/);
});
