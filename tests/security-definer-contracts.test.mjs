import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

const contracts = [
  ["cleanup_pending_gallery_media", /owner_id\s*=\s*v_actor/i],
  ["mark_conversation_read", /is_conversation_participant/i],
  ["mark_conversations_delivered", /conversation_participants[\s\S]*?user_id\s*=\s*actor_id/i],
  ["record_story_view", /story_recipients|visibility\s*=\s*'public'/i],
  ["send_story_reply", /can_view_story/i],
  ["set_gallery_media_adjustment", /private\.is_admin\(\)/i],
  ["set_gallery_media_permissions", /private\.is_admin\(\)[\s\S]*?item_owner\s*<>\s*actor/i],
  ["set_gallery_media_private", /can_view_community_gallery_media|can_view_archive_media/i],
  ["set_gallery_private_passcode", /extensions\.crypt[\s\S]*?auth\.uid\(\)/i],
  ["verify_gallery_private_passcode", /where\s+user_id\s*=\s*\(select\s+auth\.uid\(\)\)/i]
];

test("SECURITY DEFINER RPCs keep a locked search_path and an explicit identity/ownership guard", async () => {
  const migrationDir = resolve(root, "supabase/migrations");
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();
  const sql = (await Promise.all(files.map((file) => readFile(resolve(migrationDir, file), "utf8")))).join("\n");
  const statements = sql.split(";");

  for (const [name, guard] of contracts) {
    const declaration = new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?(?:\\$function\\$|\\$\\$)\\s*;`,
      "gi"
    );
    const definitions = [...sql.matchAll(declaration)];
    assert.ok(definitions.length, `missing migration definition for ${name}`);
    const body = definitions.at(-1)[0].toLowerCase();
    assert.match(body, /security definer/, `${name} must be reviewed as SECURITY DEFINER`);
    assert.match(body, /set search_path\\s+(?:to|=)\\s*''/, `${name} must lock search_path`);
    assert.match(body, /auth\\.uid\\(\\)/, `${name} must bind authorization to the signed-in identity`);
    assert.match(body, guard, `${name} must keep its operation-specific guard`);
    assert.ok(
      statements.some((statement) => /revoke\\s+all\\s+on\\s+function/i.test(statement) && statement.includes(`public.${name}(`)),
      `${name} must explicitly revoke default/public execution grants`
    );
    assert.ok(
      statements.some((statement) => /grant\\s+execute\\s+on\\s+function/i.test(statement) && statement.includes(`public.${name}(`) && /to\\s+authenticated/i.test(statement)),
      `${name} must explicitly grant only the intended authenticated RPC access`
    );
  }
});

test("private gallery passcodes stay inaccessible through direct table grants and use a password hash", async () => {
  const migration = await readFile(resolve(root, "supabase/migrations/20261018120000_gallery_social_experience.sql"), "utf8");
  assert.match(migration, /alter table private\.gallery_private_passcodes enable row level security/i);
  assert.match(migration, /revoke all on table private\.gallery_private_passcodes from public, anon, authenticated/i);
  assert.match(migration, /extensions\.crypt\(p_password,\s*extensions\.gen_salt\('bf'\)\)/i);
  assert.doesNotMatch(migration, /create policy[\s\S]{0,300}on private\.gallery_private_passcodes/i);
});
