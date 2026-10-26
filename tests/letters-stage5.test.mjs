import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sealLetter, openProtectedLetter, matchesLetterDate, communityLettersMarkup } from "../src/letters-community.js";
import { hashArchivePassword } from "../src/archive-import.js";

const root = process.cwd();

test("protected letters accept 1, 2 and long non-whitespace passwords and round-trip encrypted content", async () => {
  for (const password of ["x", "a7", "a".repeat(180)]) {
    const sealed = await sealLetter("Mensagem secreta de teste", password, "Teste");
    assert.equal(sealed.body, null);
    assert.equal(typeof sealed.password_ciphertext, "string");
    assert.ok(!sealed.password_ciphertext.includes("Mensagem secreta de teste"));
    assert.equal(await openProtectedLetter({ ...sealed, subject: "Teste" }, password), "Mensagem secreta de teste");
  }
});

test("protected letters reject whitespace in passwords without imposing an arbitrary length limit", async () => {
  for (const password of [" ", "a b", "a\tb", "a\nb"]) {
    await assert.rejects(() => sealLetter("Mensagem", password, "Teste"), /não pode conter espaços/);
  }
});

test("edited archive-card password hashes remain compatible with the deployed PBKDF2 verifier", async () => {
  const password = "new archive password";
  const hash = await hashArchivePassword(password);
  const decode = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)), character => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: decode(hash.password_salt), iterations: 210000, hash: "SHA-256" }, key, 256);
  const bytes = new Uint8Array(bits);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  assert.equal(hash.password_hash, btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""));
});

test("received and sent letters can be filtered by their local calendar date and cleared", () => {
  const createdAt = new Date(2026, 9, 22, 12).toISOString();
  const letter = { created_at: createdAt, sender_id: "sender", recipient_id: "recipient" };
  assert.equal(matchesLetterDate(letter, "2026-10-22"), true);
  assert.equal(matchesLetterDate(letter, "2026-10-21"), false);
  assert.equal(matchesLetterDate(letter, ""), true);
  assert.equal(matchesLetterDate({ created_at: "invalid" }, "2026-10-22"), false);
  const markup = communityLettersMarkup([letter], [], "recipient");
  assert.match(markup, /type="hidden" data-letter-date-filter="received"/);
  assert.match(markup, /type="hidden" data-letter-date-filter="sent"/);
  assert.match(markup, /data-shared-calendar-toggle/);
  assert.match(markup, /data-calendar-grid/);
  assert.doesNotMatch(markup, /data-community-calendar-grid/);
});

test("My Letters presents received, sent, and imported archive cards in one switchable collection", async () => {
  const [community, archive, page] = await Promise.all([
    readFile(resolve(root, "src/letters-community.js"), "utf8"),
    readFile(resolve(root, "src/archived-cards.js"), "utf8"),
    readFile(resolve(root, "assets/js/letters.js"), "utf8")
  ]);
  const markup = communityLettersMarkup([], [], "current-user");
  for (const name of ["received", "sent", "legacy"]) {
    assert.match(markup + archive, new RegExp(`data-letter-collection-(?:select|panel)=\\"${name}\\"`));
  }
  assert.match(page, /panel\.hidden = panel\.dataset\.letterCollectionPanel !== collection/);
  assert.match(archive, /data-letter-collection-panel="legacy" hidden/);
  assert.match(page, /archivedCardsMarkup\(\)/);
});

test("Story Studio has in-app original music and retains photo/video capture", async () => {
  const [studio, stories, picker] = await Promise.all([
    readFile(resolve(root, "src/story-studio.js"), "utf8"),
    readFile(resolve(root, "src/stories.js"), "utf8"),
    readFile(resolve(root, "src/story-music-picker.js"), "utf8")
  ]);
  assert.match(picker, /data-studio-music-query/);
  assert.match(picker, /data-studio-audio-file accept="audio\/\*"/);
  assert.match(studio, /accept="image\/jpeg,image\/png,image\/webp,video\/mp4,video\/webm"/);
  assert.match(studio, /const BUILTIN = Object\.freeze/);
  assert.match(studio, /await uploadResumable\(client, uploadedPath, normalized/);
  assert.match(stories, /storyStudioMarkup\(recipientOptions\)/);
  assert.doesNotMatch(studio, /spotify|supabase/i);
  assert.match(studio, /openStoryMusicPicker/);
});

test("community letters appear in the audited admin reader and imported archive cards credit Peixinho", async () => {
  const [admin, edge, archive] = await Promise.all([
    readFile(resolve(root, "src/admin.js"), "utf8"),
    readFile(resolve(root, "supabase/functions/looply-admin/index.ts"), "utf8"),
    readFile(resolve(root, "src/archived-cards.js"), "utf8")
  ]);
  assert.match(admin, /value="community_letters"/);
  assert.match(admin, /O texto cifrado atual não pode ser recuperado/);
  assert.match(admin, /data-content-type="community_letter"/);
  assert.match(admin, /Excluir esta carta permanentemente/);
  assert.match(admin, /data-edit-community-letter-form/);
  assert.match(admin, /action: "update_community_letter"/);
  assert.match(admin, /sealLetter\(body, password, subject\)/);
  assert.match(edge, /resourceType === "community_letters"/);
  assert.match(edge, /service\.from\("community_letters"\)[\s\S]*?\.range\(offset, offset \+ 99\)/);
  assert.doesNotMatch(edge, /select\([^\n]*password_ciphertext/);
  assert.match(edge, /action === "update_community_letter"[\s\S]*?passwordCiphertext[\s\S]*?\.update\(\{ subject, body, is_protected: isProtected/);
  assert.match(edge, /recordAccess\(service, authData\.user\.id, "write_completed", "community_letters"/);
  assert.match(archive, /Enviada por Peixinho · ADM/);
});

test("ADM can edit imported cards through the existing transactional import RPC without a schema change", async () => {
  const [admin, edge, importer] = await Promise.all([
    readFile(resolve(root, "src/admin.js"), "utf8"),
    readFile(resolve(root, "supabase/functions/looply-admin/index.ts"), "utf8"),
    readFile(resolve(root, "src/archive-import.js"), "utf8")
  ]);
  assert.match(admin, /data-edit-archived-card-form/);
  assert.match(admin, /hashArchivePassword\(password\)/);
  assert.match(admin, /action: "update_archived_card", resourceType: "archived_cards"/);
  assert.match(edge, /action === "update_archived_card"[\s\S]*?is_private !== \/cartaPrivada/);
  assert.match(edge, /service\.rpc\("import_looply_archived_cards"[\s\S]*?p_cards: \[card\]/);
  assert.match(edge, /recordAccess\(service, authData\.user\.id, "write_completed", "archived_cards"/);
  assert.match(importer, /export async function hashArchivePassword/);
  assert.match(importer, /PBKDF2[\s\S]*?iterations: passwordIterations[\s\S]*?hash: "SHA-256"/);
  assert.match(admin, /Excluir permanentemente esta carta importada[\s\S]*?Esta ação não pode ser desfeita/);
  assert.match(admin, /action: "delete_archived_card", resourceType: "archived_cards"/);
  assert.match(edge, /action === "delete_archived_card"[\s\S]*?\.from\("archived_cards"\)\.delete\(\)[\s\S]*?"write_completed", "archived_cards"/);
});

test("ADM can page through the entire imported-card collection and protected pages still use the secret RPC", async () => {
  const [admin, edge] = await Promise.all([
    readFile(resolve(root, "src/admin.js"), "utf8"),
    readFile(resolve(root, "supabase/functions/looply-admin/index.ts"), "utf8")
  ]);
  assert.match(admin, /data-admin-page="previous"/);
  assert.match(admin, /data-admin-page="next"/);
  assert.match(admin, /\["archive_media", "archived_cards", "audit", "community_letters", "letters"\]/);
  assert.match(admin, /offset\.value = String\(adminPage\.dataset\.adminPage === "next"[\s\S]*?requestSubmit\(\)/);
  assert.match(edge, /resourceType === "archived_cards"[\s\S]*?\.range\(offset, offset \+ 99\)/);
  assert.match(edge, /protectedCards\.map[\s\S]*?read_looply_admin_archived_cards/);
  assert.match(edge, /if \(resourceType === "letters"\)[\s\S]*?\.range\(offset, offset \+ 99\)/);
  assert.match(admin, /"community_letters", "letters"\]\.includes\(event\.target\.value\)/);
});

test("letters page keeps the archived collection and reversible read controls without the redundant conversation shortcut", async () => {
  const [page, community, archive, migration, css] = await Promise.all([
    readFile(resolve(root, "assets/js/letters.js"), "utf8"),
    readFile(resolve(root, "src/letters-community.js"), "utf8"),
    readFile(resolve(root, "src/archived-cards.js"), "utf8"),
    readFile(resolve(root, "supabase/migrations/20261018130000_letters_read_state_toggle.sql"), "utf8"),
    readFile(resolve(root, "assets/css/pages/letters.css"), "utf8")
  ]);
  assert.doesNotMatch(page, /Cartas enviadas e recebidas|written-letters-panel/);
  assert.match(page, /archivedCardsMarkup/);
  assert.match(community, /data-community-letter-compose hidden/);
  assert.match(community, /data-toggle-community-compose/);
  assert.ok(community.includes("crypto.subtle.encrypt"));
  assert.match(archive, /data-card-toggle-read/);
  assert.ok(archive.includes('.from("archived_card_reads").delete()'));
  assert.match(migration, /archived_card_reads_owner_delete/);
  assert.match(css, /community-letter-password-field/);
});

test("protected-letter SQL avoids PostgreSQL repetition counts above its regex limit", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const migration = await readFile(resolve(process.cwd(), "supabase/migrations/20261018222201_fix_community_letter_password_regex.sql"), "utf8");
  assert.match(migration, /char_length\(password_ciphertext\) between 22 and 7000/i);
  assert.match(migration, /password_ciphertext ~ '\^\[A-Za-z0-9_-\]\+\$'/i);
  assert.doesNotMatch(migration, /\{22,7000\}/);
});

test("letters use the authenticated server-verified administrator role, never a hard-coded profile ID", async () => {
  const [page, runtime] = await Promise.all([
    readFile(resolve(root, "assets/js/letters.js"), "utf8"),
    readFile(resolve(root, "src/page-runtime.js"), "utf8")
  ]);
  assert.match(page, /render: async \(\{ root, client, user, isAdmin \}\)/);
  assert.doesNotMatch(page, /user\.id\s*===\s*["'][0-9a-f-]{36}["']/i);
  assert.match(runtime, /supabase\.rpc\("v3_self_is_admin"\)/);
  assert.match(runtime, /adminResult\.value\?\.data === true/);
});
