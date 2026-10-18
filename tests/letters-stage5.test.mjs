import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sealLetter, openProtectedLetter } from "../src/letters-community.js";

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

test("letters page keeps the archived collection and reversible read controls without the redundant conversation shortcut", async () => {
  const [page, community, archive, migration, css] = await Promise.all([
    readFile(resolve(root, "assets/js/letters.js"), "utf8"),
    readFile(resolve(root, "src/letters-community.js"), "utf8"),
    readFile(resolve(root, "src/archived-cards.js"), "utf8"),
    readFile(resolve(root, "supabase/migrations/20261019130000_letters_read_state_toggle.sql"), "utf8"),
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
