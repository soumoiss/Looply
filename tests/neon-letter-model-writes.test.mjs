import test from "node:test";
import assert from "node:assert/strict";
import { createNeonRestQuery } from "../src/neon-rest-bridge.js";

test("the letter composer and favorite can write model fields through Neon", async () => {
  const requests = [];
  const options = {
    dataApiUrl: "https://example.test/rest/v1",
    getAccessToken: async () => "test-session",
    fetchImpl: async (url, init) => {
      requests.push([new URL(url), JSON.parse(init.body)]);
      return new Response("[]");
    }
  };
  const letter = { sender_id: "sender", recipient_id: "recipient", subject: "Teste",
    body: "Olá", model_style: { seal: "👩🏽‍🚀" }, view_once: true };
  const favorite = { user_id: "recipient", letter_kind: "community", letter_id: "letter", favorite: true };
  assert.equal((await createNeonRestQuery("community_letters", options).insert(letter)).error, null);
  assert.equal((await createNeonRestQuery("looply_letter_ui_state", options)
    .upsert(favorite, { onConflict: "user_id,letter_kind,letter_id" })).error, null);
  assert.deepEqual(requests.map(([, body]) => body), [letter, favorite]);
  assert.equal(requests[1][0].searchParams.get("on_conflict"), "user_id,letter_kind,letter_id");
  assert.equal((await createNeonRestQuery("looply_letter_ui_state", options)
    .upsert({ ...favorite, admin: true })).error.message, "neon_unpermitted_fields");
  assert.equal(requests.length, 2);
});
