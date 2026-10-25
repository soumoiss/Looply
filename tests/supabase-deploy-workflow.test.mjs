import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("legacy Supabase backend deployment is manual-only and never commits Supabase credentials", async () => {
  const root = resolve(import.meta.dirname, "..");
  const workflow = await readFile(resolve(root, ".github/workflows/supabase-deploy.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+push:\s*$/m);
  assert.doesNotMatch(workflow, /branches: \[main\]/);
  assert.match(workflow, /secrets\.SUPABASE_ACCESS_TOKEN/);
  assert.match(workflow, /secrets\.SUPABASE_DB_PASSWORD/);
  assert.match(workflow, /SUPABASE_PROJECT_ID: qixocgetiwlrsbadpbvh/);
  assert.match(workflow, /version: 2\.118\.0-beta\.37/);
  assert.match(workflow, /Detect migration changes/);
  assert.match(workflow, /git diff --name-only[\s\S]*-- supabase\/migrations\//);
  assert.match(workflow, /if: steps\.migrations\.outputs\.changed == 'true'/);
  assert.match(workflow, /No migration files changed; leaving the production database untouched/);
  assert.match(workflow, /supabase db push/);
  assert.match(workflow, /Fail closed on migration-history mismatches/);
  assert.doesNotMatch(workflow, /supabase migration repair|--include-all/);
  assert.match(workflow, /functions deploy looply-admin/);
  assert.match(workflow, /functions deploy looply-youtube-playlist/);
  assert.doesNotMatch(workflow, /service_role|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]{20,}/i);
});
