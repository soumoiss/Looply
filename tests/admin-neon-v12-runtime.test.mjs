import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adminMarkup, ADMIN_DELETE_TYPES } from "../src/admin.js";

const read = path => readFile(new URL("../"+path, import.meta.url), "utf8");

test("Neon administrative panel mounts all core controls with explicit audit reasons", async () => {
  const [admin, entry, adapter] = await Promise.all([
    read("src/admin.js"),
    read("assets/js/admin.js"),
    read("src/neon-production-client.js")
  ]);
  const html = adminMarkup({ username: "peixinho" });
  for(const id of [
    "data-user-create", "data-users-results", "data-users-refresh",
    "data-users-purpose", "data-app-settings-form", "data-maintenance-save",
    "data-music-save", "data-welcome-save", "data-admin-broadcast",
    "data-secret-message-form", "data-admin-read", "data-archive-import"
  ]) assert.ok(html.includes(id), id);
  assert.ok(html.includes('name="purpose"'));
  assert.match(admin,/void loadUsers\(\)/);
  assert.match(admin,/validatedUserPurpose/);
  assert.match(admin,/announcement_deactivation_unconfirmed|deactivation_unconfirmed/);
  assert.match(admin,/app_settings_persistence_unconfirmed|settings_persistence_unconfirmed/);
  assert.doesNotMatch(admin,/looplyAdminSessionToken|admin_session_revoke|showSessionState/);
  assert.match(entry,/root\.dataset\.currentUserId = user\.id/);
  assert.match(adapter,/v12_admin_action/);
  assert.match(adapter,/v12_admin_read/);
  assert.match(adapter,/v12_admin_finish_signup/);
});

test("archive imports use one database route and fail closed on unverifiable files", async () => {
  const [migration, importer, adapter] = await Promise.all([
    read("migrations/20261029_01_admin_action_archive_routing.sql"),
    read("src/archive-import.js"),
    read("src/neon-production-client.js")
  ]);
  assert.equal((migration.match(/WHEN 'import_archived_cards'/g)||[]).length,1);
  assert.match(migration,/v12_admin_import_card\(payload\)/);
  assert.match(migration,/storage_object_verification_requires_authenticated_storage_endpoint/);
  assert.doesNotMatch(migration,/jsonb_build_object\('exists',false\)/);
  assert.match(importer,/storage\.verify\(path\)/);
  assert.match(importer,/verification\.data\?\.exists!==true/);
  assert.match(adapter,/if \(action === "verify_archive_media_upload"\)/);
  assert.match(adapter,/storageBucket\("looply-media"\)\.verify\(path\)/);
});

test("admin sections and permanent deletes remain behind supported Neon contracts", async () => {
  const [letters,musics] = await Promise.all([
    read("admin/cartas/index.html"),read("admin/musicas/index.html")
  ]);
  assert.match(letters,/admin\.html\?resource=community_letters/);
  assert.match(musics,/admin\.html\?resource=music_dedications/);
  assert.ok(ADMIN_DELETE_TYPES.has("community_letter"));
  assert.ok(ADMIN_DELETE_TYPES.has("post"));
  assert.equal(ADMIN_DELETE_TYPES.has("archive_media"),false);
  assert.equal(ADMIN_DELETE_TYPES.has("chat_message"),false);
});
