import test from "node:test";
import assert from "node:assert/strict";
import { selectOwnLetterRecords } from "../src/letter-ownership.js";

const letters = [
  {id:"a",sender_id:"peixinho",recipient_id:"yara"},
  {id:"b",sender_id:"yara",recipient_id:"peixinho"},
  {id:"c",sender_id:"yara",recipient_id:"misol"},
  {id:"d",sender_id:"misol",recipient_id:"yara"},
  {id:"e",sender_id:"yara",recipient_id:"yara"}
];
const originalCards = [{id:"original-y",recipient_id:"yara"},{id:"original-p",recipient_id:"peixinho"}];

test("cartas recebidas e enviadas pertencem à identidade autenticada", () => {
  const owned = selectOwnLetterRecords({letters,originalCards}, "yara");
  assert.deepEqual(owned.received.map(x=>x.id),["a","d","e"]);
  assert.deepEqual(owned.sent.map(x=>x.id),["b","c","e"]);
  assert.deepEqual(owned.originals.map(x=>x.id),["original-y"]);
});

test("ocultar enviada não altera recebida", () => {
  const owned=selectOwnLetterRecords({letters,originalCards,hiddenSent:new Set(["community:e"])}, "yara");
  assert.deepEqual(owned.sent.map(x=>x.id),["b","c"]);
  assert.ok(owned.received.some(x=>x.id==="e"));
});

test("sessão ausente não expõe cartas", () => {
  const owned=selectOwnLetterRecords({letters,originalCards}, "");
  assert.equal(owned.received.length+owned.sent.length+owned.originals.length,0);
});

test("seleção do ADM nunca muda o dono das abas pessoais", () => {
  const adminSelected="peixinho";
  const owned=selectOwnLetterRecords({letters,originalCards}, "yara");
  assert.notEqual(adminSelected,"yara");
  assert.ok(owned.received.every(x=>x.recipient_id==="yara"));
  assert.ok(owned.sent.every(x=>x.sender_id==="yara"));
});
