import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("user management actions are behind protected session and require audited purpose", async () => {
  const edge = await readFile(resolve(root, "supabase/functions/looply-admin/index.ts"), "utf8");
  const guard = edge.indexOf('const adminSessionToken = String(payload.adminSessionToken || "")');
  const purpose = edge.indexOf('const purpose = String(payload.purpose || "").trim()');
  const list = edge.indexOf('if (action === "users_list")');
  assert.ok(guard > -1 && purpose > guard && list > purpose);
  for (const action of ["users_list", "user_create_invite", "user_update_profile", "user_set_suspended", "user_restore_access"]) {
    assert.ok(edge.includes(`action === "${action}"`), "missing action " + action);
  }
  assert.match(edge, /recordAccess\(service, authData\.user\.id, "write_requested", "profiles"/);
  assert.match(edge, /recordAccess\(service, authData\.user\.id, "write_completed", "profiles"/);
  assert.match(edge, /recordAccess\(service, authData\.user\.id, "write_failed", "profiles"/);
});

test("user creation is invitation-only, accepts new usernames, and never grants ADM", async () => {
  const edge = await readFile(resolve(root, "supabase/functions/looply-admin/index.ts"), "utf8");
  assert.match(edge, /\^\[a-z0-9_\]\{3,30\}\$/);
  assert.match(edge, /looply_user_invites/);
  assert.match(edge, /data: \{ username, display_name: displayName \}/);
  assert.match(edge, /redirectTo/);
  assert.match(edge, /inviteUserByEmail/);
  assert.match(edge, /cannot_change_own_access/);
  assert.match(edge, /cannot_suspend_administrator/);
});

test("user management UI exposes profile edits and access restoration without unsafe HTML rendering", async () => {
  const ui = await readFile(resolve(root, "src/admin.js"), "utf8");
  assert.match(ui, /data-user-invite/);
  assert.match(ui, /name="email"/);
  assert.match(ui, /Convidar novo usuário comum/);
  assert.match(ui, /O convite nunca concede acesso ADM/);
  assert.match(ui, /data-user-profile-form/);
  assert.match(ui, /data-user-access-action/);
  assert.match(ui, /user_update_profile/);
  assert.match(ui, /user_set_suspended/);
  assert.match(ui, /user_restore_access/);
  assert.match(ui, /createElement\("article"\)/);
  assert.doesNotMatch(ui, /innerHTML\s*=\s*.*user\./);
});
