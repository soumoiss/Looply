import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("ADM provisions a confirmed common user through the server-only Auth admin API", async () => {
  const [migration, edge, ui] = await Promise.all([
    read("supabase/migrations/20261020090000_admin_password_provisioning.sql"),
    read("supabase/functions/looply-admin/index.ts"),
    read("src/admin.js")
  ]);

  assert.match(migration, /looply_admin_provisioned/);
  assert.match(migration, /raw_app_meta_data/);
  assert.match(migration, /insert into public\.profiles/i);
  assert.match(edge, /auth\.admin\.createUser\(\{/);
  assert.match(edge, /email_confirm:\s*true/);
  assert.match(edge, /app_metadata:\s*\{[^}]*looply_admin_provisioned/);
  assert.match(edge, /user_metadata:\s*\{ username, display_name: displayName \}/);
  assert.match(ui, /data-user-create/);
  assert.match(ui, /name="password"/);
  assert.match(ui, /sessionStorage\.getItem\("looplyAdminSessionToken"\)/);
  assert.doesNotMatch(ui, /auth\.signUp\(/);
});
