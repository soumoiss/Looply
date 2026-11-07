import test from "node:test";
import assert from "node:assert/strict";
import {makePremiumLetter,parsePremiumLetter,parsePremiumChatBody,premiumChatCardMarkup,makePremiumNote} from "../src/chat-premium-cards.js";

test("carta Ultra mantém título, papel, selo e assinatura entre dispositivos",()=>{
  const payload=makePremiumLetter({title:"Uma promessa",body:"Primeira linha\nSegunda linha",paper:"rose",seal:"🦋",signature:"Amizade"});
  assert.ok(payload.length<=5000);
  const record=parsePremiumLetter(payload);
  assert.equal(record.title,"Uma promessa");
  assert.equal(record.body,"Primeira linha\nSegunda linha");
  assert.equal(record.paper,"rose");
  assert.equal(record.seal,"🦋");
  assert.equal(record.signature,"Amizade");
  assert.equal(parsePremiumChatBody(payload).type,"letter");
  assert.ok(premiumChatCardMarkup(payload).includes("chat-ultra-letter-card"));
});
test("carta não pode ser enviada vazia ou acima do limite de armazenamento",()=>{
  assert.throws(()=>makePremiumLetter({title:"t",body:" "}),/4.200/);
  assert.throws(()=>makePremiumLetter({title:"t",body:"x".repeat(4201)}),/4.200/);
  assert.throws(()=>makePremiumLetter({title:"",body:"texto"}),/título/i);
});
test("renderização de carta não injeta HTML de usuário",()=>{
  const html=premiumChatCardMarkup(makePremiumLetter({title:"<img src=x onerror=alert(1)>",body:"<script>bad</script>",signature:"<svg onload=alert(2)>"}));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<svg onload"));
  assert.ok(html.includes("&lt;script&gt;"));
});
test("bilhetes antigos continuam abrindo normalmente",()=>{
  const note=makePremiumNote("Uma lembrança");
  assert.equal(parsePremiumChatBody(note).type,"note");
  assert.ok(premiumChatCardMarkup(note).includes("chat-premium-note-card"));
});
test("payload inválido não é interpretado como envelope seguro",()=>{
  assert.equal(parsePremiumLetter('💌 Carta Looply/1\n{"v":1,"title":"a","body":"b"}'),null);
  assert.equal(parsePremiumLetter("outra coisa"),null);
});