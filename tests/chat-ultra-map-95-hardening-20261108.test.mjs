import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {browseUltraPage} from "../src/chat-ultra-browse.js";
import {makePremiumLocation,parsePremiumChatBody} from "../src/chat-premium-cards.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const room="11111111-1111-4111-8111-111111111111";
const messageId="22222222-2222-4222-8222-222222222222";

test("v46 and v47 keep privileges in JWT-scoped backend functions",()=>{
 const v46=read("migration/20261108_chat_ultra_auth_actions_v46.sql");
 const v47=read("migration/20261108_chat_ultra_browse_v47.sql");
 for(const name of ["v46_chat_rename_group","v46_chat_mark_all_activity_seen",
   "v46_chat_unread_activity_count","v46_chat_message_receipts"])assert.ok(v46.includes(name),name);
 assert.match(v46,/room\.kind='group' AND room\.created_by=actor/);
 assert.match(v46,/notifications\.user_id=actor\.id/);
 assert.match(v46,/m\.sender_id=actor\.id/);
 assert.match(v47,/SECURITY DEFINER SET search_path TO ''/);
 assert.match(v47,/public\.v44_chat_message_visible/);
 assert.match(v47,/flags\.user_id=actor\.id/);
 assert.match(v47,/media\.conversation_id=msg\.conversation_id/);
 assert.match(v47,/REVOKE ALL ON FUNCTION public\.v47_chat_saved/);
 const auth=read("src/neon-production-client.js");
 for(const rpc of ["v46_chat_rename_group","v46_chat_unread_activity_count",
   "v47_chat_search","v47_chat_media","v47_chat_saved"])assert.ok(auth.includes(rpc),rpc);
});

test("paginated private browsing does not trust an exposed arbitrary room",async()=>{
 const calls=[];
 const records=Array.from({length:51},(_,i)=>({
   message_id:i?messageId:room,body:"Só texto autorizado",
   created_at:"2026-11-08T00:00:00Z"
 }));
 const client={rpc:async(name,args)=>{
   calls.push({name,args});return {data:records,error:null};
 }};
 const page=await browseUltraPage({client,conversationId:room,mode:"search",search:"texto"});
 assert.equal(page.items.length,50);
 assert.equal(page.hasMore,true);
 assert.equal(calls[0].name,"v47_chat_search");
 assert.equal(calls[0].args.p_conversation_id,room);
 assert.ok(page.cursor.at);
 assert.ok(page.cursor.id);
 const second=await browseUltraPage({client,conversationId:room,mode:"media",cursor:page.cursor});
 assert.equal(second.mode,"media");
 assert.equal(calls[1].args.p_before_id,messageId);
 await assert.rejects(()=>browseUltraPage({client,conversationId:"invalid",mode:"saved"}));
});

test("forward markers preserve a valid structured location payload",()=>{
 const location=makePremiumLocation("Praça",{
   latitude:-2.903456,longitude:-41.773242
 });
 const direct=parsePremiumChatBody(location);
 assert.equal(direct.latitude,-2.90346);
 assert.equal(direct.longitude,-41.77324);
 const forwarded=parsePremiumChatBody("↪ Encaminhada/1\n"+location);
 assert.equal(forwarded.type,"location");
 assert.equal(forwarded.forwarded,true);
 const plain=parsePremiumChatBody("↪ Encaminhada/1\nMensagem normal");
 assert.equal(plain.type,"forwarded-text");
 assert.equal(plain.body,"Mensagem normal");
 assert.throws(()=>makePremiumLocation("Praça",{latitude:100,longitude:0}));
});

test("voice/file upload cannot signal success on form submit alone",()=>{
 const native=read("src/chat.js");
 const ultra=read("assets/js/chat-ultra-live.js");
 assert.match(native,/looply:chat-message-failed/);
 assert.match(native,/detail: \{ conversationId, messageId \}/);
 assert.match(ultra,/const confirmed=await completed/);
 assert.match(ultra,/runtime\.addEventListener\("looply:chat-message-saved",onSaved\)/);
 assert.match(ultra,/source\.expires_at\|\|parsePremiumChatBody/);
 assert.match(ultra,/forwardRealMessage/);
 assert.match(ultra,/browseUltraPage/);
 assert.match(ultra,/v46_chat_rename_group/);
});

test("storage signing bounds ephemeral URL by authoritative Neon expires_at",()=>{
 const worker=read("backend/neon-storage/index.mjs");
 assert.match(worker,/expires_at/);
 assert.match(worker,/Math\.floor\(\(Date\.parse\(expires\)-Date\.now\(\)\)\/1000\)/);
 assert.match(worker,/seconds=Math\.min\(seconds,remaining\)/);
 assert.match(worker,/message_not_visible/);
 assert.match(worker,/object\.type==="chat"/);
});

test("both approved Ultra routes contain live search and custom letter seals without parse errors",()=>{
 for(const path of ["chat.html","conversa.html"]){
   const html=read(path);
   const inline=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
   for(const [index,s] of inline.entries())assert.doesNotThrow(()=>new Script(s[1],{filename:path+"#"+index}));
   assert.match(html,/data-ultra-music-pick/);
   assert.match(html,/data-letter-emoji-search/);
   assert.match(html,/data-ultra-forward-target/);
   assert.match(html,/searchMusic:/);
   assert.match(html,/remoteNicknames/);
 }
});
