import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("original private-letter unlock uses recipient-scoped Neon RPC, not admin-only action", async () => {
  const client = await read("../src/neon-production-client.js");
  assert.match(client, /if \(action === "unlock_archived_card"\)/);
  assert.match(client, /\/rpc\/v13_unlock_archived_card/);
  assert.match(client, /p_card_id:String\(body.cardId\|\|""\),p_password:String\(body.password\|\|""\)/);
  assert.match(client, /authorization:"Bearer "\+session.access_token/);
});

test("Neon unlock migration enforces verified identity mapping and password for both recipient and admin", async () => {
  const sql = await read("../migration/20261029_neon_original_private_unlock.sql");
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /looply_migration\.verified_identity_links/);
  assert.match(sql, /identity_link\.legacy_user_id=card\.recipient_id/);
  assert.match(sql, /identity_link\.neon_user_id=v_actor/);
  assert.match(sql, /public\.v3_self_is_admin\(\)/);
  assert.match(sql, /public\.pgp_sym_decrypt\(v_encrypted,p_password\)/);
  assert.match(sql, /too_many_unlock_attempts/);
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA looply_private FROM PUBLIC,authenticated/);
  assert.doesNotMatch(sql, /Misolcartaprivada1|secret_body|senha:\s*\S/);
});

test("letter reader distinguishes incorrect password from missing protected content", async () => {
  const ui = await read("../src/archived-cards.js");
  assert.match(ui, /protected_archive_not_restored/);
  assert.match(ui, /senha não foi alterada/);
  assert.match(ui, /incorrect_password/);
  assert.match(ui, /too_many_unlock_attempts/);
});
