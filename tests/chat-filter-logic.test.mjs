import test from "node:test";
import assert from "node:assert/strict";
import { matchesConversationFilter } from "../src/chat-filter-logic.js";

test("Todas inclui conversas individuais, grupos e cartas", () => {
  for (const kind of ["direct", "group", "letter"]) {
    assert.equal(matchesConversationFilter({ kind, unreadCount: 0 }, "all"), true);
  }
});

test("Grupos inclui somente conversas cujo tipo é group", () => {
  assert.equal(matchesConversationFilter({ kind: "group" }, "groups"), true);
  assert.equal(matchesConversationFilter({ kind: "direct", label: "Grupo da família" }, "groups"), false);
  assert.equal(matchesConversationFilter({ kind: "letter" }, "groups"), false);
});

test("Não lidas exige contador positivo e ignora badge/texto decorativo", () => {
  assert.equal(matchesConversationFilter({ kind: "direct", unreadCount: "2" }, "unread"), true);
  assert.equal(matchesConversationFilter({ kind: "group", unreadCount: "0" }, "unread"), false);
  assert.equal(matchesConversationFilter({ kind: "direct", unreadCount: "" }, "unread"), false);
  assert.equal(matchesConversationFilter({ kind: "direct", unreadCount: "invalid" }, "unread"), false);
});

test("Favoritas compara IDs persistidos como texto", () => {
  const favorites = new Set(["conversation-2"]);
  assert.equal(matchesConversationFilter({ id: "conversation-2" }, "favorites", favorites), true);
  assert.equal(matchesConversationFilter({ id: "conversation-3" }, "favorites", favorites), false);
});
