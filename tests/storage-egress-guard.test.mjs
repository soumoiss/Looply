import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("gallery shows confirmed existing Neon originals when no thumbnail is available", async () => {
  const gallery = await read("assets/js/gallery.js");
  assert.ok(!gallery.includes("if (Number(x.byte_size || 0) > maxInlinePreviewBytes) return"));
  assert.match(gallery, /cachedSignedUrl\\(client, bucket, x\\.storage_path, 300\\)/);
  assert.match(gallery, /loading="lazy"/);
  assert.ok(gallery.includes('client.from("archive_media").select('));
  assert.ok(gallery.includes('client.from("community_gallery_media").select('));
});

test("new uploads have free-tier egress guardrails", async () => {
  const [gallery, social, stories, chat, profiles] = await Promise.all([
    read("assets/js/gallery.js"), read("src/social.js"), read("src/stories.js"),
    read("src/chat.js"), read("src/profiles.js")
  ]);
  for (const source of [gallery, social, stories, chat]) assert.match(source, /25 \* 1024 \* 1024/);
  assert.match(profiles, /file\.size>10\*1024\*1024/);
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

test("cleanup removes only aged unreferenced objects from every application bucket", async () => {
  const cleanup = await read("supabase/functions/looply-stories-cleanup/index.ts");
  for (const bucket of ["looply-media", "looply-gallery", "looply-chat", "looply-avatars", "looply-letters", "looply-secret-messages"]) {
    assert.match(cleanup, new RegExp(`\\["${bucket}"`));
  }
  assert.match(cleanup, /graceHours = 24/);
  assert.match(cleanup, /referenced\.has\(file\.path\)/);
  assert.match(cleanup, /no unverified files were removed/);
});

test("username login supports current Supabase key names and is deployed continuously", async () => {
  const [login, workflow] = await Promise.all([
    read("supabase/functions/looply-login/index.ts"),
    read(".github/workflows/supabase-deploy.yml")
  ]);
  assert.match(login, /SUPABASE_PUBLISHABLE_KEYS/);
  assert.match(login, /SUPABASE_SECRET_KEYS/);
  assert.match(workflow, /functions deploy looply-login/);
});
