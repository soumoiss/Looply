import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("new community accounts use either the protected password or expiring invitation flow", async () => {
  const [migration, admin, ui] = await Promise.all([
    read("supabase/migrations/20261019130000_invited_community_accounts.sql"),
    read("supabase/functions/looply-admin/index.ts"),
    read("src/admin.js")
  ]);
  assert.match(migration, /drop constraint if exists profiles_username_allowlist/i);
  assert.match(migration, /create table if not exists public\.looply_user_invites/i);
  assert.match(migration, /revoke all on table public\.looply_user_invites from public, anon, authenticated/i);
  assert.match(migration, /grant all on table public\.looply_user_invites to service_role/i);
  assert.match(migration, /invitation\.expires_at > now\(\)/i);
  assert.match(migration, /new\.invited_at is null/i);
  assert.match(migration, /new\.email !~\*/i);
  assert.equal((migration.match(/create or replace function private\.handle_new_auth_user/g) || []).length, 1);
  assert.match(migration, /lower\(invitation\.email\) = lower\(new\.email\)/i);
  assert.match(migration, /delete from public\.looply_user_invites/i);
  assert.doesNotMatch(migration, /insert into private\.admin_users/i);
  assert.ok(admin.includes("if (isAdmin !== true)"));
  assert.doesNotMatch(admin, /const adminSessionToken = String\(payload\.adminSessionToken/);
  assert.match(admin, /recordAccess\(service, authData\.user\.id, "write_requested", "profiles"/);
  assert.match(admin, /auth\.admin\.createUser\(\{/);
  assert.match(admin, /inviteUserByEmail\(email,\s*\{\s*data: \{ username, display_name: displayName \}/);
  assert.match(admin, /https:\/\/soumoiss\.github\.io\/Looply\/login\.html\?invite=1/);
  assert.match(ui, /data-user-create/);
  assert.match(ui, /name="password"/);
  assert.match(ui, /Cadastrar novo usuário/);
});

test("username login does not reveal the Auth email and delegates password checks to Supabase Auth", async () => {
  const [loginUi, loginEdge, workflow, loginHtml] = await Promise.all([
    read("src/login.js"),
    read("supabase/functions/looply-login/index.ts"),
    read(".github/workflows/verify.yml"),
    read("login.html")
  ]);
  assert.match(loginUi, /functions\.invoke\("looply-login"/);
  assert.match(loginUi, /supabase\.auth\.setSession/);
  assert.match(loginUi, /updateUser\(\{ password: newPassword \}\)/);
  assert.match(loginEdge, /service\.auth\.admin\.getUserById/);
  assert.match(loginEdge, /auth\.auth\.signInWithPassword\(\{ email, password \}\)/);
  assert.match(loginEdge, /error: "invalid_credentials"/);
  assert.match(loginEdge, /access_token:[\s\S]*refresh_token:/);
  assert.doesNotMatch(loginEdge, /respond\(200,\s*\{[^}]*email/);
  assert.match(workflow, /deno check --no-lock --config supabase\/functions\/looply-login\/deno\.json/);
  assert.match(loginHtml, /id="invitePasswordForm"/);
});
