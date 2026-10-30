import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("MiSol original recover endpoint is admin-only and scoped to same UUID", async () => {
  const sql = await source("migration/20261029_misol_original_admin_recovery.sql");
  assert.match(sql, /v14_admin_recover_archived_card/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /public\.v3_self_is_admin\(\)/);
  assert.match(sql, /98df71c4-cf50-42fe-98d2-357d12633356/);
  assert.match(sql, /original_file='Misolcartaprivada1\.txt'/);
  assert.match(sql, /p_confirm_replace IS DISTINCT FROM true/);
  assert.match(sql, /btrim\(p_new_body\) = ''/);
  assert.match(sql, /length\(coalesce\(p_new_password,''\)\) NOT BETWEEN 7 AND 256/);
});
test("Recovery preserves ciphertext, letter identity, and original metadata", async () => {
  const sql = await source("migration/20261029_misol_original_admin_recovery.sql");
  assert.match(sql, /archived_card_recovery_history/);
  assert.match(sql, /previous_encrypted_body bytea/);
  assert.match(sql, /REVOKE ALL ON looply_private\.archived_card_recovery_history/);
  assert.match(sql, /ALTER TABLE looply_private\.archived_card_recovery_history ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /INSERT INTO looply_private\.archived_card_recovery_history[\s\S]*UPDATE public\.archived_cards/);
  assert.match(sql, /SET is_protected=p_use_password,[\s\S]*body=CASE WHEN p_use_password THEN NULL ELSE p_new_body END/);
  assert.doesNotMatch(sql, /UPDATE public\.archived_cards\s+SET[^;]+(?:recipient_id|original_file|sent_date|password_hint)\s*=/);
  assert.match(sql, /source_sha256=EXCLUDED\.source_sha256/);
  assert.match(sql, /public\.pgp_sym_decrypt\(v_new_cipher,p_new_password\)/);
  assert.match(sql, /DELETE FROM looply_private\.archived_card_unlock_attempts WHERE card_id=p_card_id/);
});
test("Admin can paste entire text, choose password or no password, and read back", async () => {
  const [page, client] = await Promise.all([
    source("assets/js/letters.js"), source("src/neon-production-client.js")
  ]);
  assert.match(page, /adminOriginalRecoveryMarkup/);
  assert.match(page, /id="archiveRecoveryText"/);
  assert.match(page, /value="password"/);
  assert.match(page, /value="none"/);
  assert.match(page, /archiveRecoveryAcknowledgement/);
  assert.match(page, /client\.rpc\("v14_admin_recover_archived_card"/);
  assert.match(page, /p_new_body: fullText/);
  assert.match(page, /p_use_password: usePassword/);
  assert.match(page, /p_confirm_replace: true/);
  assert.match(page, /checked\.data\?\.body !== fullText/);
  assert.match(page, /persisted\.body !== fullText/);
  assert.match(page, /recoverCardId/);
  assert.match(client, /"v14_admin_recover_archived_card"/);
});
