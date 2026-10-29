import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL("../"+path, import.meta.url), "utf8");

test("ADM dashboard routes status, audited reads and writes through the verified Neon adapter",async()=>{
  const [admin,bridge,sql]=await Promise.all([
    read("src/admin.js"),
    read("src/neon-production-client.js"),
    read("migration/20261029_neon_admin_restoration.sql")
  ]);
  assert.match(admin,/body: \{ resourceType: "status" \}/);
  assert.match(bridge,/body\.resourceType === "status" \? "status" : "read"/);
  assert.match(bridge,/p_purpose:String\(body\.purpose\|\|""\)/);
  assert.match(admin,/adminSessionToken: _ignoredToken, \.\.\.action/);
  assert.doesNotMatch(admin,/purpose: _ignoredPurpose/);
  assert.match(admin,/name="purpose" minlength="20"/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.v12_admin_read/i);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.v12_admin_action/i);
  assert.match(sql,/admin_forbidden/);
  assert.match(sql,/looply_admin_audit_events/);
});

test("VIP and announcement media use private Neon buckets and authenticated access",async()=>{
  const [admin,storage,announcements]=await Promise.all([
    read("src/admin.js"),
    read("backend/neon-storage/index.mjs"),
    read("src/global-announcements.js")
  ]);
  assert.match(admin,/storage\.from\("looply-secret-messages"\)/);
  assert.match(admin,/storage\.from\("looply-announcements"\)/);
  assert.match(admin,/action:"secret_create"/);
  assert.match(admin,/action:"secret_cancel"/);
  assert.match(storage,/isAuthenticatedAdmin/);
  assert.match(storage,/object\.type==="secret"/);
  assert.match(storage,/object\.type==="announcement"/);
  assert.match(announcements,/createSignedUrl\(path,1800\)/);
});

test("archive importer never uses Supabase and verifies S3 size prior to metadata",async()=>{
  const [importer,bridge,sql]=await Promise.all([
    read("src/archive-import.js"),read("src/neon-production-client.js"),
    read("migration/20261029_neon_admin_restoration.sql")
  ]);
  assert.doesNotMatch(importer,/supabaseUrl|publishableKey|tus-js-client/);
  assert.match(importer,/storage\.verify\(path\)/);
  assert.match(importer,/register_archive_media/);
  assert.match(bridge,/storageRequest\("verify",bucket,path\)/);
  assert.match(sql,/v12_admin_import_card/);
  assert.match(sql,/v12_admin_register_archive_media/);
});