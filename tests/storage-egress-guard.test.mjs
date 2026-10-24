import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("free-plan gallery never replaces unavailable thumbnails with full-size originals", async () => {
  const gallery = await read("assets/js/gallery.js");
  assert.match(gallery, /const maxInlinePreviewBytes = 256 \* 1024/);
  assert.match(gallery, /Number\(x\.byte_size \|\| 0\) > maxInlinePreviewBytes\) return ""/);
  assert.match(gallery, /archive_media"\)\.select\("[^"]*byte_size/);
  assert.match(gallery, /community_gallery_media"\)\.select\("[^"]*byte_size/);
  assert.doesNotMatch(gallery, /thumbnail transformation unavailable; using original image/i);
});

test("new uploads have free-tier egress guardrails", async () => {
  const [gallery, social, stories, chat, profiles] = await Promise.all([
    read("assets/js/gallery.js"), read("src/social.js"), read("src/stories.js"),
    read("src/chat.js"), read("src/profiles.js")
  ]);
  for (const source of [gallery, social, stories, chat]) assert.match(source, /25 \* 1024 \* 1024/);
  assert.match(profiles, /file\.size>2\*1024\*1024/);
});

test("deployed cleanup removes expired stories and unreferenced avatar versions", async () => {
  const [cleanup, workflow] = await Promise.all([
    read("supabase/functions/looply-stories-cleanup/index.ts"),
    read(".github/workflows/supabase-deploy.yml")
  ]);
  assert.match(cleanup, /cleanupOrphanAvatars/);
  assert.match(cleanup, /SUPABASE_PUBLISHABLE_KEYS/);
  assert.match(cleanup, /SUPABASE_SECRET_KEYS/);
  assert.match(cleanup, /storage\.from\("looply-media"\)\.remove\(paths\)/);
  assert.match(workflow, /functions deploy looply-stories-cleanup/);
});
