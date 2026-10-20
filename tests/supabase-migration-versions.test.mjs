import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const migrationsDirectory = resolve(import.meta.dirname, "../supabase/migrations");

test("Supabase migration versions are unique", async () => {
  const files = await readdir(migrationsDirectory);
  const versions = files
    .filter((file) => /^\d{14}_.+\.sql$/.test(file))
    .map((file) => [file.slice(0, 14), file]);
  const duplicates = new Map();
  for (const [version, file] of versions) {
    const existing = duplicates.get(version) || [];
    duplicates.set(version, [...existing, file]);
  }
  const collisions = [...duplicates].filter(([, names]) => names.length > 1);
  assert.deepEqual(collisions, [], `migration version collisions: ${JSON.stringify(collisions)}`);
});

