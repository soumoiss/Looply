import test from "node:test";
import assert from "node:assert/strict";
import storage from "../backend/neon-storage/index.mjs";

const profileId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const storyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mediaId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const objectPath = `stories/${storyId}/${mediaId}.jpg`;
const payload = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

test("storage download requires visible Story media and returns a size-limited image", async () => {
  const keys = [
    "NEON_DATA_API_URL", "AWS_ENDPOINT_URL_S3", "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY", "AWS_REGION"
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let visible = false;
  let objectReads = 0;
  try {
    process.env.NEON_DATA_API_URL = "https://neon.test/rest/v1";
    process.env.AWS_ENDPOINT_URL_S3 = "https://objects.test";
    process.env.AWS_ACCESS_KEY_ID = "test-access";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
    process.env.AWS_REGION = "us-east-1";
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.origin === "https://neon.test" && url.pathname.endsWith("/v3_self_profile")) {
        return Response.json([{ id: profileId }]);
      }
      if (url.origin === "https://neon.test" && url.pathname.endsWith("/story_media")) {
        if (url.searchParams.get("select") === "id") {
          return Response.json(visible ? [{ id: mediaId }] : []);
        }
        return Response.json([{ byte_size: payload.byteLength, mime_type: "image/jpeg" }]);
      }
      if (url.origin === "https://objects.test") {
        objectReads++;
        return new Response(payload, { headers: { "content-length": String(payload.byteLength) } });
      }
      throw new Error("Unexpected upstream request: " + url.origin + url.pathname);
    };
    const makeRequest = () => new Request("https://storage.test/storage/download", {
      method: "POST",
      headers: {
        origin: "https://soumoiss.github.io",
        authorization: "Bearer test-user-token",
        "x-looply-bucket": "looply-media",
        "x-looply-path": objectPath
      },
      body: "{}"
    });
    const denied = await storage.fetch(makeRequest());
    assert.equal(denied.status, 403);
    assert.equal(objectReads, 0);

    visible = true;
    const allowed = await storage.fetch(makeRequest());
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("content-type"), "image/jpeg");
    assert.equal(allowed.headers.get("cache-control"), "no-store");
    assert.deepEqual(new Uint8Array(await allowed.arrayBuffer()), payload);
    assert.equal(objectReads, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
