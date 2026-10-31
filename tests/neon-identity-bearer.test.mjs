import test from "node:test";
import assert from "node:assert/strict";
import { fetchLinkedNeonProfile } from "../src/neon-identity.js";

const dataApiUrl = "https://example.neon.tech/neondb/rest/v1";

test("linked Neon profile lookup forwards the real session bearer and disables caching", async () => {
  let calls = 0;
  const result = await fetchLinkedNeonProfile({
    dataApiUrl,
    session: { user: { id: "neon-user-id" }, access_token: "signed.jwt.token" },
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(new URL(url).pathname, "/neondb/rest/v1/v3_self_profile");
      assert.equal(new URL(url).searchParams.get("limit"), "2");
      assert.equal(options.method, "GET");
      assert.equal(options.cache, "no-store");
      assert.equal(options.headers.authorization, "Bearer signed.jwt.token");
      assert.equal(options.headers.accept, "application/json");
      return new Response(JSON.stringify([{ id: "legacy-uuid", username: "peixinho" }]), { status: 200 });
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.id, "legacy-uuid");
});

test("a session without JWT is not treated as a verified linked profile", async () => {
  let called = false;
  await assert.rejects(
    fetchLinkedNeonProfile({
      dataApiUrl,
      session: { user: { id: "neon-user-id" } },
      fetchImpl: async () => { called = true; throw new Error("Unexpected call"); }
    }),
    /não possui token de acesso/
  );
  assert.equal(called, false);
});

test("RLS empty rows and unauthorized tokens produce distinct safe errors", async () => {
  const base = { dataApiUrl, session: { access_token: "test.jwt.token" } };
  await assert.rejects(fetchLinkedNeonProfile({
    ...base, fetchImpl: async () => new Response("[]", { status: 200 })
  }), /perfil original ainda não está vinculado/);
  await assert.rejects(fetchLinkedNeonProfile({
    ...base, fetchImpl: async () => new Response("{}", { status: 401 })
  }), /não autorizou esta sessão/);
});

test("unexpected response does not impersonate a profile", async () => {
  await assert.rejects(fetchLinkedNeonProfile({
    dataApiUrl, session: { access_token: "test.jwt.token" },
    fetchImpl: async () => new Response(JSON.stringify({ id: "untrusted" }), { status: 200 })
  }), /resposta de perfil inválida/);
});

test("newly authenticated profile recovers from a transient empty Neon view", async () => {
  let calls = 0;
  const profile = await fetchLinkedNeonProfile({
    dataApiUrl, session: {access_token: "signed.jwt.token"},
    sleep: async () => {},
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify(calls === 1 ? [] : [{id:"legacy-linked",username:"kelry"}]), {status:200});
    }
  });
  assert.equal(calls, 2);
  assert.equal(profile.id, "legacy-linked");
});

test("profile lookup retries temporary Neon 503 and never retries authorization failure", async () => {
  let calls = 0;
  const options = {dataApiUrl,session:{access_token:"signed.jwt.token"},sleep:async()=>{}};
  const resolved = await fetchLinkedNeonProfile({
    ...options,
    fetchImpl: async () => {
      calls++;
      return calls === 1
        ? new Response("{}", {status:503})
        : new Response(JSON.stringify([{id:"verified-profile"}]), {status:200});
    }
  });
  assert.equal(resolved.id, "verified-profile");
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(fetchLinkedNeonProfile({
    ...options,
    fetchImpl: async () => {calls++; return new Response("{}", {status:403});}
  }),/não autorizou/);
  assert.equal(calls, 1);
});
