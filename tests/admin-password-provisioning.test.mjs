import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = path => readFile(resolve(root,path),"utf8");

test("Neon Auth user creation checks admin permission, links profile and never relies on legacy session tokens",async()=>{
  const [ui,adapter,migration] = await Promise.all([
    read("src/admin.js"),
    read("src/neon-production-client.js"),
    read("migrations/20261029_01_admin_action_archive_routing.sql")
  ]);
  assert.match(ui,/data-user-create/);
  assert.match(ui,/name="password"/);
  assert.match(ui,/user_create_with_password/);
  assert.match(ui,/validatedUserPurpose/);
  assert.doesNotMatch(ui,/looplyAdminSessionToken|admin_session_revoke|showSessionState/);
  assert.match(adapter,/adminFunctionInvoke\(\{body:\{action:"status"\}\}\)/);
  assert.match(adapter,/adminApi\.createUser\(/);
  assert.match(adapter,/v12_admin_finish_signup/);
  assert.match(adapter,/created\.data\?\.user\?\.id/);
  assert.match(migration,/v12_admin_action/);
});
