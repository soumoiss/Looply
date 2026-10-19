import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("production backend deployment is automated without committing Supabase credentials", async () => {
  const root = resolve(import.meta.dirname, "..");
  const workflow = await readFile(resolve(root, ".github/workflows/supabase-deploy.yml"), "utf8");
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /secrets\.SUPABASE_ACCESS_TOKEN/);
  assert.match(workflow, /secrets\.SUPABASE_DB_PASSWORD/);
  assert.match(workflow, /SUPABASE_PROJECT_ID: qixocgetiwlrsbadpbvh/);
  assert.match(workflow, /version: 2\.118\.0-beta\.37/);
  assert.match(workflow, /supabase db push/);
  assert.match(workflow, /Remote migration versions not found in local migrations directory/);
  assert.match(workflow, /Found local migration files to be inserted before the last migration/);
  assert.match(workflow, /supabase migration repair/);
  assert.match(workflow, /supabase db push --include-all/);
  assert.match(workflow, /functions deploy looply-admin/);
  assert.match(workflow, /functions deploy looply-youtube-playlist/);
  assert.doesNotMatch(workflow, /service_role|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]{20,}/i);
});
