import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("protected admin sessions keep credentials, attempts, and token hashes private", async () => {
  const migration = await readFile(resolve(root, "supabase/migrations/20261019060000_protected_admin_sessions.sql"), "utf8");
  for (const table of [
    "private.looply_admin_session_credentials",
    "private.looply_admin_sessions",
    "private.looply_admin_session_attempts"
  ]) {
    assert.match(migration, new RegExp("alter table " + table.replaceAll(".", "\\.") + " enable row level security", "i"));
    assert.match(migration, new RegExp("revoke all on table " + table.replaceAll(".", "\\.") + " from public, anon, authenticated", "i"));
  }
  assert.match(migration, /extensions\.crypt\(p_password, extensions\.gen_salt\('bf', 12\)\)/i);
  assert.match(migration, /failed_attempts[\s\S]*?>= 5[\s\S]*?interval '15 minutes'/i);
  assert.match(migration, /expires_at timestamptz not null/i);
  assert.match(migration, /token_hash text not null unique/i);
  assert.doesNotMatch(migration, /grant execute on function public\.looply_admin_session_[^(]+\([^;]+ to authenticated/i);
});

test("admin session RPCs lock search_path and are service-role-only", async () => {
  const migration = await readFile(resolve(root, "supabase/migrations/20261019060000_protected_admin_sessions.sql"), "utf8");
  const names = ["status", "setup", "unlock", "validate", "revoke"];
  for (const name of names) {
    const pattern = new RegExp(
      "create or replace function public\\.looply_admin_session_" + name + "\\([\\s\\S]*?\\$function\\$;",
      "i"
    );
    const match = migration.match(pattern);
    assert.ok(match, "missing admin session RPC: " + name);
    assert.match(match[0], /security definer/i);
    assert.match(match[0], /set search_path = ''/i);
    assert.match(match[0], /public\.is_looply_admin\(p_actor_id\)/i);
    assert.match(migration, new RegExp("grant execute on function public\\.looply_admin_session_" + name + "\\([^;]+ to service_role", "i"));
  }
});

test("Edge Function only returns a raw token at unlock and validates its hash server-side", async () => {
  const edge = await readFile(resolve(root, "supabase/functions/looply-admin/index.ts"), "utf8");
  assert.match(edge, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(edge, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(edge, /admin_session_unlock/);
  assert.match(edge, /admin_session_validate/);
  assert.match(edge, /looply_admin_session_validate/);
  assert.match(edge, /Protected administrator session created with a 15-minute expiry/);
});

test("privileged admin actions require a live server-validated session", async () => {
  const edge = await readFile(resolve(root, "supabase/functions/looply-admin/index.ts"), "utf8");
  const guardAt = edge.indexOf('const adminSessionToken = String(payload.adminSessionToken || "")');
  const purposeAt = edge.indexOf('const purpose = String(payload.purpose || "").trim()');
  assert.ok(guardAt > -1 && purposeAt > guardAt, "session guard must run before any privileged action");
  assert.match(edge, /looply_admin_session_validate/);
  assert.match(edge, /admin_session_expired_or_revoked/);
  const ui = await readFile(resolve(root, "src/admin.js"), "utf8");
  assert.match(ui, /data-admin-session-setup/);
  assert.match(ui, /data-admin-session-unlock/);
  assert.match(ui, /data-admin-session-exit/);
  assert.match(ui, /adminSessionToken: token/);
  const imports = await readFile(resolve(root, "src/archive-import.js"), "utf8");
  assert.match(imports, /adminSessionToken: sessionStorage\.getItem\("looplyAdminSessionToken"\)/);
});
