import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("Secret VIP messages are recipient-scoped and mark-read is column-restricted", async () => {
  const migration = await readFile(resolve(root, "supabase/migrations/20261020180000_secret_vip_messages.sql"), "utf8");
  assert.match(migration, /create table if not exists public\.secret_messages/i);
  assert.match(migration, /private\.is_admin\(\) and sender_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /recipient_id = \(select auth\.uid\(\)\) or private\.is_admin\(\)/i);
  assert.match(migration, /grant update \(is_read, read_at\) on public\.secret_messages to authenticated/i);
  assert.match(migration, /values \('looply-secret-messages', 'looply-secret-messages', false/i);
  assert.match(migration, /storage\.foldername\(name\).*auth\.uid/i);

  const admin = await readFile(resolve(root, "src/admin.js"), "utf8");
  assert.match(admin, /data-secret-message-form/);
  assert.match(admin, /data-secret-history/);
  assert.match(admin, /data-secret-delete/);
  assert.match(admin, /from\("secret_messages"\)\.insert/);

  const modal = await readFile(resolve(root, "src/secret-messages.js"), "utf8");
  assert.match(modal, /eq\("recipient_id", userId\)\.eq\("is_read", false\)/);
  assert.match(modal, /update\(\{ is_read: true, read_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(modal, /createSignedUrl/);
  assert.match(modal, /if \(!client \|\| !userId \|\| isAdmin\) return/);
  const home = await readFile(resolve(root, "assets/js/home.js"), "utf8");
  assert.match(home, /mountSecretMessages\(client, user\.id, isAdmin\)/);
});
