import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("secret VIP messages are recipient-scoped and mark read through constrained fields", async () => {
  const [migration, modal, admin, edge] = await Promise.all([
    readFile(new URL("../supabase/migrations/20261020200000_secret_vip_messages.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/secret-messages.js", import.meta.url), "utf8"),
    readFile(new URL("../src/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/looply-admin/index.ts", import.meta.url), "utf8")
  ]);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /recipient_id = auth\.uid\(\)/);
  assert.match(migration, /grant update \(is_read, read_at\)/);
  assert.match(modal, /eq\("recipient_id", userId\)/);
  assert.match(modal, /update\(\{ is_read: true, read_at:/);
  assert.match(admin, /Enviar Recado Secreto VIP/);
  assert.match(edge, /if \(action === "secret_message_create"\)/);
  assert.match(edge, /if \(action === "secret_messages_list"\)/);
  assert.match(edge, /if \(action === "secret_message_delete"\)/);
});
