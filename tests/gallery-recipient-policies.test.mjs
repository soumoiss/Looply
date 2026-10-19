import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("gallery recipient policies separate SELECT access from write authorization", async () => {
  const migration = await readFile(resolve(root, "supabase/migrations/20261019050000_gallery_recipient_policy_performance.sql"), "utf8");
  for (const table of [
    "community_gallery_comment_recipients",
    "community_gallery_media_commenters",
    "community_gallery_media_recipients"
  ]) {
    assert.match(migration, new RegExp("drop policy if exists [\\w]+\\s+on public\\." + table));
    assert.match(migration, new RegExp("create policy [\\w]+_insert\\s+on public\\." + table + "\\s+for insert to authenticated"));
    assert.match(migration, new RegExp("create policy [\\w]+_update\\s+on public\\." + table + "\\s+for update to authenticated"));
    assert.match(migration, new RegExp("create policy [\\w]+_delete\\s+on public\\." + table + "\\s+for delete to authenticated"));
  }
  assert.equal(migration.split("private.can_manage_community_gallery_").length - 1, 12);
});
