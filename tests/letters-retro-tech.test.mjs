import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { communityLettersMarkup } from "../src/letters-community.js";

const root = process.cwd();
const read = path => readFile(resolve(root, path), "utf8");

test("Retro-Tech Letters UI exposes compact composition, file attachments, and audio recording", async () => {
  const [markup, css, page] = await Promise.all([
    read("src/letters-community.js"), read("assets/css/pages/letters.css"), read("assets/js/letters.js")
  ]);
  assert.match(markup, /data-community-letter-compose hidden/);
  assert.match(markup, /data-toggle-community-compose/);
  assert.match(markup, /data-letter-files/);
  assert.match(markup, /data-letter-record/);
  assert.match(markup, /data-letter-stop-record/);
  assert.match(markup, /createSignedUrl/);
  assert.match(css, /--letters-paper:\s*#f5f1e9/i);
  assert.match(css, /--letters-accent:\s*#20b99a/i);
  assert.match(css, /repeating-linear-gradient\(135deg/);
  assert.match(page, /shared-calendar-admin-edit-hints-20261022/);
});

test("admin collection reads all letters and can delete letters while RLS remains admin-backed", async () => {
  const [markup, page, migration] = await Promise.all([
    read("src/letters-community.js"), read("assets/js/letters.js"),
    read("supabase/migrations/20261022160000_letters_admin_access_and_private_attachments.sql")
  ]);
  assert.match(markup, /loadCommunityLetters\(client, userId, isAdmin = false\)/);
  assert.match(markup, /if \(!isAdmin\) query = query\.or/);
  assert.match(markup, /data-admin-delete-community-letter/);
  assert.match(page, /d218a499-e3ad-45c5-b115-26272a6f3e79/);
  assert.match(migration, /private\.is_admin\(\)/);
  assert.match(migration, /archived_cards_admin_update/);
  assert.match(migration, /community_letters_admin_delete/);
  assert.match(migration, /looply-letters/);
});

test("only administrators can edit or delete imported native cards in the collection UI", async () => {
  const [archive, page, migration] = await Promise.all([
    read("src/archived-cards.js"), read("assets/js/letters.js"),
    read("supabase/migrations/20261022160000_letters_admin_access_and_private_attachments.sql")
  ]);
  assert.match(archive, /loadArchivedCards\(client, userId, isAdmin = false\)/);
  assert.match(archive, /data-admin-edit-card/);
  assert.match(archive, /data-admin-delete-card/);
  assert.match(archive, /if \(!isAdmin\) cardsQuery = cardsQuery\.eq/);
  assert.match(page, /bindArchivedCards/);
  assert.match(migration, /archived_cards_admin_update/);
  assert.match(migration, /archived_cards_admin_delete/);
});

test("ordinary senders can update only attachment metadata, not recipient or letter body", async () => {
  const [migration, source] = await Promise.all([
    read("supabase/migrations/20261022160100_restrict_sender_letter_updates.sql"),
    read("src/letters-community.js")
  ]);
  assert.match(migration, /guard_community_letter_sender_update/);
  assert.match(migration, /new\.recipient_id is distinct from old\.recipient_id/);
  assert.match(migration, /new\.body is distinct from old\.body/);
  assert.match(source, /client\.storage\.from\("looply-letters"\)\.upload/);
  assert.match(source, /attachments: uploaded/);
});

test("administrator markup can list all private and public community letters", () => {
  const markup = communityLettersMarkup([
    { id: "1", sender_id: "s", recipient_id: "r", subject: "Teste", created_at: "2026-10-22T12:00:00Z", sender: { username: "sender" }, recipient: { username: "recipient" } }
  ], [], "admin", true);
  assert.match(markup, /De sender → Para recipient/);
  assert.match(markup, /data-admin-delete-community-letter/);
  assert.match(markup, /Cartas originais/);
});

test("letters share the original calendar, keep inbox/outbox personal, hide empty originals, and expose admin edit and protected-card hints", async () => {
  const [markup, archive, page, css, migration, cumulativeMigration] = await Promise.all([
    read("src/letters-community.js"), read("src/archived-cards.js"), read("assets/js/letters.js"),
    read("assets/css/app.css"), read("supabase/migrations/20261022194500_archived_card_password_hints.sql"),
    read("supabase/migrations/20261023150000_restore_cumulative_archived_card_hints.sql")
  ]);
  assert.match(markup, /shared-letter-calendar/);
  assert.match(markup, /data-calendar-grid/);
  assert.doesNotMatch(markup, /data-community-calendar-grid/);
  assert.match(markup, /letter\.recipient_id === userId/);
  assert.match(markup, /letter\.sender_id === userId/);
  assert.match(markup, /isAdmin \|\| hasOriginalCards/);
  assert.match(markup, /data-admin-edit-community-letter/);
  assert.match(markup, /data-community-letter-edit-form/);
  assert.match(markup, /Salvar alterações/);
  assert.match(archive, /data-card-hint-form/);
  assert.match(archive, /As dicas anteriores ficam guardadas/);
  assert.match(archive, /Adicionar dica/);
  assert.match(archive, /Nova dica adicionada ao histórico/);
  assert.match(archive, /data-calendar-date/);
  assert.doesNotMatch(archive, /id="archiveCalendar"/);
  assert.match(page, /archiveResult\.value\.cards/);
  assert.match(css, /calendar-card/);
  assert.match(migration, /guard_archived_card_hint_update/);
  assert.match(migration, /archived_cards_recipient_hint_update/);
  assert.match(cumulativeMigration, /old_hints \|\| jsonb_build_array\(trim\(new\.password_hint\)\)/);
  assert.match(cumulativeMigration, /jsonb_array_length\(new\.password_hints\) = jsonb_array_length\(old_hints\) \+ 1/);
});
