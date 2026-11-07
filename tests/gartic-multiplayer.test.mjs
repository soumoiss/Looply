import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {normalizeGarticAnswer,invokeGarticAction} from "../src/chat-gartic.js";

const get = path => readFile(new URL("../"+path,import.meta.url),"utf8");

test("Gartic accepts answers without case, punctuation, accents, hyphens or spaces",()=>{
 for(const [a,b] of [
  ["Scooby-Doo","scoobydoo"],["SCOOBY DOO","Scooby-Doo"],
  ["ação","ACAO"],["Pão de queijo","PAODEQUEIJO"],
  ["Homem-Aranha","homemaranha"],["Pousando no Amor","pousandonoamor"]
 ]) assert.equal(normalizeGarticAnswer(a),normalizeGarticAnswer(b),a);
 assert.notEqual(normalizeGarticAnswer("gato"),normalizeGarticAnswer("cachorro"));
});

test("Twelve playable categories each have more than 200 distinct terms",async()=>{
 const sql=await get("migration/20261102_gartic_multiplayer.sql");
 const match=sql.match(/jsonb_to_recordset\('(\[.*\])'::jsonb\)/s);
 assert.ok(match,"seed payload should be present");
 const words=JSON.parse(match[1].replaceAll("''","'"));
 const byCategory=new Map();
 for(const row of words){
  assert.equal(typeof row.term,"string");
  assert.ok(row.term.length>=2);
  if(!byCategory.has(row.category))byCategory.set(row.category,new Set());
  byCategory.get(row.category).add(row.term.toLowerCase());
 }
 assert.equal(byCategory.size,12);
 for(const [name,terms] of byCategory)assert.ok(terms.size>200,name+": "+terms.size);
 assert.ok([...byCategory.get("desenhos")].includes("scooby doo"));
});

test("Neon alone validates secrets, guesses, manual hint positions and winning score",async()=>{
 const sql=await get("migration/20261102_gartic_multiplayer.sql");
 assert.match(sql,/p_action='hint'/);
 assert.match(sql,/ORDER BY random\(\) LIMIT 1/);
 assert.match(sql,/p_action='guess'/);
 assert.match(sql,/v26_gartic_normalize\(p_value\)=public\.v26_gartic_normalize\(answer\)/);
 assert.match(sql,/actor=g\.drawer_id OR g\.status='finished'/);
 assert.match(sql,/REVOKE ALL ON public\.looply_gartic_words/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/IF count_correct>=count_players-1 THEN/);
});

test("Games is available in the shared composer attachment menu, preserving tic tac toe",async()=>{
 const [enh,icons,ttt,chat,conversation,composer]=await Promise.all([
  get("src/chat-enhancements.js"),get("src/icons.js"),get("src/chat-ttt.js"),
  get("chat.html"),get("conversa.html"),get("src/chat.js")
 ]);
 assert.match(composer,/data-chat-premium-menu hidden[\s\S]*data-v2-game data-chat-premium-game[^\n]*icon\("gamepad"\)/);
 assert.doesNotMatch(enh,/heading\.insertAdjacentHTML[^\n]*data-v2-game/);
 assert.match(enh,/setupChatGartic/);
 assert.match(icons,/gamepad:/);
 assert.match(ttt,/v25_ttt_move/);
 assert.match(chat,/\["games","🎮","Games"\]/);
 assert.match(conversation,/\["games","🎮","Games"\]/);
});

test("Audio is opt-in, room scoped, with negotiated WebRTC peers",async()=>{
 const game=await get("src/chat-gartic.js");
 assert.match(game,/navigator\.mediaDevices\.getUserMedia/);
 assert.match(game,/new RTCPeerConnection/);
 assert.match(game,/voice-join/);
 assert.match(game,/voice-signal/);
 assert.match(game,/voice-leave/);
 assert.match(game,/voiceStream\?\.getTracks\(\)\.forEach\(t=>t\.stop\(\)\)/);
});

test("Production Neon client forwards Gartic actions through authenticated RPC",async()=>{
 const client=await get("src/neon-production-client.js");
 assert.match(client,/const garticRpcNames = new Set\(\["v26_gartic_action"\]\)/);
 assert.match(client,/garticRpcNames\.has\(name\) \? garticRpc\(name,args\)/);
 assert.match(client,/config\.data\+"\/rpc\/"\+name/);
 assert.match(client,/authorization:"Bearer "\+session\.access_token/);
 assert.match(client,/gartic_invalid_state/);
});

test("Gartic recovers from outdated client RPC allowlists using a direct Neon route",async()=>{
 const calls=[];
 const id="e3a64c5f-73e6-4b5d-9c31-122222222222";
 const client={
  dataApiUrl:"https://ep-example.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1",
  rpc(){throw Error("obsolete client RPC must not run");},
  auth:{getSession:async()=>({data:{session:{access_token:"test.access.token.123456789"}}})}
 };
 const response=await invokeGarticAction({
  client,conversationId:id,action:"create",
  fetchImpl:async(url,options)=>{
   calls.push({url,options});
   return {ok:true,json:async()=>({gameId:id,players:[],status:"waiting"})};
  }
 });
 assert.equal(response.status,"waiting");
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,client.dataApiUrl+"/rpc/v26_gartic_action");
 assert.equal(calls[0].options.method,"POST");
 assert.equal(calls[0].options.cache,"no-store");
 assert.equal(calls[0].options.credentials,"omit");
 assert.equal(calls[0].options.headers.authorization,"Bearer test.access.token.123456789");
 assert.deepEqual(JSON.parse(calls[0].options.body),{
  p_conversation_id:id,p_action:"create",p_value:null,p_number:null
 });
});

test("Gartic denies anonymous or untrusted RPC endpoints before contacting the server",async()=>{
 const id="e3a64c5f-73e6-4b5d-9c31-122222222222";
 let requests=0;
 const fetchImpl=async()=>{requests++;throw Error("never fetch");};
 await assert.rejects(()=>invokeGarticAction({
  client:{dataApiUrl:"https://evil.example/rest/v1",auth:{getSession:async()=>({data:{session:{access_token:"secret.secret.token"}}})}},
  conversationId:id,action:"create",fetchImpl
 }),/gartic_backend_not_configured/);
 await assert.rejects(()=>invokeGarticAction({
  client:{dataApiUrl:"https://ep-example.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1",auth:{getSession:async()=>({data:{session:null}})}},
  conversationId:id,action:"create",fetchImpl
 }),/neon_session_required/);
 assert.equal(requests,0);
});

test("Gartic UI no longer depends on the legacy client RPC allowlist",async()=>{
 const source=await get("src/chat-gartic.js");
 assert.match(source,/invokeGarticAction\(\{client,conversationId,action,value,number\}\)/);
 assert.doesNotMatch(source,/client\.rpc\("v26_gartic_action"/);
});

test("Service worker fetches HTML, JS and CSS network-first, retains offline fallback",async()=>{
 const sw=await get("sw.js");
 assert.match(sw,/event\.request\.mode === "navigate"/);
 assert.ok(sw.includes('const critical = event.request.mode === "navigate"'));
 assert.ok(sw.includes('fetch(event.request, { cache: "no-cache" })'));
 assert.ok(sw.includes('return cached || Response.error()'));
 const register=await get("src/service-worker.js");
 assert.match(register,/updateViaCache: "none"/);
 assert.match(register,/registration\.update\(\)/);
});
