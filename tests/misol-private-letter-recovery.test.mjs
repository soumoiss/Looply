import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("MiSol recovery requires explicit body and password in one ADM RPC", async () => {
  const [admin, migration, client] = await Promise.all([
    read("src/admin.js"),
    read("migrations/20261030_02_misol_archived_card_recovery.sql"),
    read("src/neon-production-client.js")
  ]);
  assert.match(admin, /p_new_password: password, p_new_body: body/);
  assert.match(admin, /data-load-archived-card-content/);
  assert.match(admin, /Carta restaurada com sucesso/);
  assert.match(migration, /explicit_archive_body_required/);
  assert.match(migration, /source_sha256=encode\(public\.digest/);
  assert.match(migration, /DELETE FROM looply_private\.archived_card_unlock_attempts WHERE card_id=p_card_id/);
  assert.match(client, /"v13_admin_change_archived_card_password"/);
});
