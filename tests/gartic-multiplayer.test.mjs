import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {normalizeGarticAnswer} from "../src/chat-gartic.js";

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

test("Games icon appears for both group and direct chats, preserving tic tac toe",async()=>{
 const [enh,icons,ttt,chat,conversation]=await Promise.all([
  get("src/chat-enhancements.js"),get("src/icons.js"),get("src/chat-ttt.js"),
  get("chat.html"),get("conversa.html")
 ]);
 assert.match(enh,/icon\("gamepad"\)/);
 assert.doesNotMatch(enh,/if \(!isGroup\(\) && !heading\.querySelector\("\[data-v2-game\]"\)\)/);
 assert.match(enh,/setupChatGartic/);
 assert.match(icons,/gamepad:/);
 assert.match(ttt,/v25_ttt_move/);
 assert.match(chat,/chat-gartic\.css/);
 assert.match(conversation,/chat-gartic\.css/);
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
