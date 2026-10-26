import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin UI authority comes from the current Neon identity, never browser user input", async () => {
  const [runtime, client, migration] = await Promise.all([
    read("src/page-runtime.js"),
    read("src/neon-production-client.js"),
    read("migration/20261026_neon_self_admin_identity.sql"),
  ]);

  assert.match(runtime, /supabase\.rpc\("v3_self_is_admin"\)/);
  assert.doesNotMatch(runtime, /user\.role\s*===\s*["']admin/);
  assert.match(client, /name !== "v3_self_is_admin"/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog/);
  assert.match(migration, /auth_user\.id = auth\.uid\(\)/);
  assert.match(migration, /auth_user\.role = 'admin'/);
  assert.match(migration, /COALESCE\(auth_user\.banned, false\) = false/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.v3_self_is_admin\(\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.v3_self_is_admin\(\) TO authenticated/);
});
