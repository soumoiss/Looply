import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sealLetter, openProtectedLetter, matchesLetterDate, communityLettersMarkup } from "../src/letters-community.js";

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

test("received and sent letters can be filtered by their local calendar date and cleared", () => {
  const createdAt = new Date(2026, 9, 22, 12).toISOString();
  const letter = { created_at: createdAt, sender_id: "sender", recipient_id: "recipient" };
  assert.equal(matchesLetterDate(letter, "2026-10-22"), true);
  assert.equal(matchesLetterDate(letter, "2026-10-21"), false);
  assert.equal(matchesLetterDate(letter, ""), true);
  assert.equal(matchesLetterDate({ created_at: "invalid" }, "2026-10-22"), false);
  const markup = communityLettersMarkup([letter], [], "recipient");
  assert.match(markup, /type="date" data-letter-date-filter="received"/);
  assert.match(markup, /type="date" data-letter-date-filter="sent"/);
  assert.match(markup, /data-clear-letter-date="received"/);
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
