import test from "node:test";
import assert from "node:assert/strict";
import {makePremiumLetter,parsePremiumLetter,parsePremiumChatBody,premiumChatCardMarkup,makePremiumNote,makePremiumPoll,makePremiumContact,makePremiumLocation} from "../src/chat-premium-cards.js";

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
test("enquete autoritativa mostra contagens das reações persistidas",()=>{
  const payload=makePremiumPoll({question:"Qual horário?",options:["Manhã","Tarde","Noite"]});
  const messageId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",uid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const reactions=[{user_id:uid,emoji:"❤️"},{user_id:"outro",emoji:"😂"}];
  const html=premiumChatCardMarkup(payload,reactions,messageId,uid);
  assert.equal(parsePremiumChatBody(payload).type,"poll");
  assert.ok(html.includes("Qual horário?"));
  assert.ok(html.includes('data-chat-premium-message-id="'+messageId+'"'));
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes('50%'));
});
test("alternativas repetidas não podem criar enquete",()=>{
  assert.throws(()=>makePremiumPoll({question:"Qual?",options:["Sim","sim"]}),/diferentes/i);
  assert.throws(()=>makePremiumPoll({question:"Qual?",options:["Um"]}),/2 a 8/i);
});
test("contato e localização só aceitam payloads de tipos válidos",()=>{
  const c=makePremiumContact({id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Yara",username:"yara"});
  const l=makePremiumLocation("Parnaíba, PI");
  assert.equal(parsePremiumChatBody(c).type,"contact");
  assert.equal(parsePremiumChatBody(l).type,"location");
  assert.ok(premiumChatCardMarkup(c).includes("perfil.html?usuario="));
  assert.ok(premiumChatCardMarkup(l).includes("google.com/maps/search"));
  assert.throws(()=>makePremiumContact({id:"forged",name:"a",username:"b"}),/perfil válido/);
});

test("backend sanitiza notificações de cartas e enquetes sem apagar dados",async()=>{
  const {readFile}=await import("node:fs/promises");
  const {fileURLToPath}=await import("node:url");
  const sql=await readFile(fileURLToPath(new URL("../migration/20261107_chat_ultra_safe_previews.sql",import.meta.url)),"utf8");
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.v19_queue_chat_notifications/);
  assert.match(sql,/Você recebeu uma carta selada/);
  assert.match(sql,/Nova enquete na conversa/);
  assert.match(sql,/ON CONFLICT \(user_id,message_id\) DO NOTHING/);
  assert.doesNotMatch(sql,/DELETE FROM public\./i);
});
