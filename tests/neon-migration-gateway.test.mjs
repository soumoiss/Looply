import test from "node:test";
import assert from "node:assert/strict";
import worker from "../backend/neon-cloudflare/worker.mjs";

function request(path, { token, origin = "https://soumoiss.github.io", method = "GET" } = {}) {
  return new Request("https://staging.looply.example" + path, {
    method, headers: {
      ...(origin ? { origin } : {}),
      ...(token ? { authorization: "Bearer " + token } : {})
    }
  });
}
test("migration gateway advertises staging status, not false production-readiness", async () => {
  const response = await worker.fetch(request("/health"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.full_feature_parity, false);
  assert.equal(body.supabase_independence_complete, false);
  assert.equal(body.media_migration_complete, false);
});

test("read-only gateway never accepts unauthenticated profile and feed reads", async () => {
  for (const path of ["/api/feed", "/api/self-profile"]) {
    const result = await worker.fetch(request(path));
    assert.equal(result.status, 401);
    assert.equal((await result.json()).error, "authentication_required");
  }
});

test("unexpected origins and mutation attempts are rejected before database access", async () => {
  const forbidden = await worker.fetch(request("/api/feed", { origin: "https://attacker.example", token: "token" }));
  assert.equal(forbidden.status, 403);
  const mutation = await worker.fetch(request("/api/feed", { method: "POST", token: "token" }));
  assert.equal(mutation.status, 405);
});

test("valid CORS preflight is explicit and restricted", async () => {
  const response = await worker.fetch(request("/api/feed", { method: "OPTIONS" }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://soumoiss.github.io");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, HEAD, OPTIONS");
});

test("server-verified profile reads return only selected attributes", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded = null;
  globalThis.fetch = async (url, options) => {
    forwarded = { url, options };
    return new Response(JSON.stringify([{
      id: "id-1", username: "verified-user", display_name: "Verified User",
      bio: "Hello", theme: "lilas", avatar_path: null, email: "private@example.invalid",
      sensitive_password: "MUST_NOT_LEAK"
    }]), { status: 200 });
  };
  try {
    const response = await worker.fetch(request("/api/self-profile", { token: "valid.jwt.signature" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(forwarded.options.headers.authorization, "Bearer valid.jwt.signature");
    assert.match(forwarded.url, /v3_self_profile/);
    const result = await response.json();
    assert.equal(result.profiles.length, 1);
    assert.equal(result.profiles[0].username, "verified-user");
    assert.equal("sensitive_password" in result.profiles[0], false);
    assert.equal("email" in result.profiles[0], false);
  } finally { globalThis.fetch = originalFetch; }
});

test("Neon authentication refusal does not reveal the original upstream response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("internal provider details", { status: 403 });
  try {
    const response = await worker.fetch(request("/api/feed", { token: "bad.jwt" }));
    assert.equal(response.status, 401);
    assert.doesNotMatch(await response.text(), /provider details/);
  } finally { globalThis.fetch = originalFetch; }
});

test("unrecognized URL is never proxied to Neon", async () => {
  const response = await worker.fetch(request("/rest/v1/any-table", { token: "token" }));
  assert.equal(response.status, 404);
});
