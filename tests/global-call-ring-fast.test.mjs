import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startIncomingCallAlert } from "../src/global-call-ringtone.js";
import { startGlobalCallInbox } from "../src/global-call-inbox.js";
const read=file=>readFile(new URL("../"+file,import.meta.url),"utf8");
const room="2f3e4d5c-1111-4111-8111-222233334444";
const peer="ba38fc13-1234-4aaa-8123-1234567890ab";
const api="https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1";

test("caller emits the ring BEFORE getUserMedia and ICE gathering, preserving old WebRTC offer/answer",async()=>{
 const s=await read("src/chat-calls.js");
 const start=s.slice(s.indexOf('  const startCall = async (mode)'),s.indexOf('  const acceptCall = async ()'));
 assert.ok(start.includes('await send("ring"'));
 assert.ok(start.indexOf('await send("ring"')<start.indexOf("localStream = await navigator.mediaDevices.getUserMedia"));
 assert.ok(start.indexOf('await send("ring"')<start.indexOf('await waitForIceGatheringComplete(pc)'));
 assert.match(start,/send\("offer", offerPayload\)/);
 assert.match(start,/send\("failed", \{ reason:/);
});
test("active Chat rings immediately but enables Atender only after an actual SDP offer",async()=>{
 const s=await read("src/chat-calls.js");
 assert.match(s,/if \(payload\.type === "ring"\)/);
 assert.match(s,/pendingRing = payload/);
 assert.match(s,/startIncomingCallAlert\(\{ name: callPeerName, mode: callMode \}\)/);
 assert.match(s,/pendingRing = null;\s*incomingOffer = payload/);
 assert.match(s,/silenceIncoming\(\)/);
});
test("every other Looply tab shows a ringing overlay before the SDP, enabling answer after offer",async()=>{
 const s=await read("src/global-call-listener.js");
 assert.match(s,/payload\.type === "ring" && !payload\.description/);
 assert.match(s,/if \(payload\.type === "offer" && payload\.description && !incoming\.payload\?\.description\)/);
 assert.match(s,/modal\.querySelector\("\[data-global-call-accept\]"\)\.disabled = !payload\.description/);
 assert.match(s,/type === "ring" \|\| type === "offer"/);
});
test("Neon fallback and Cloudflare Durable Object both accept early ring signals",async()=>{
 const [a,b,c,d]=await Promise.all([
   read("src/neon-call-fallback.js"),read("src/neon-realtime-bridge.js"),
   read("backend/neon-cloudflare/realtime-worker.mjs"),read("migration/neon-call-signaling-fallback-20261027.sql")
 ]);
 assert.match(a,/new Set\(\["ring","offer"/);
 assert.match(b,/new Set\(\["ring","offer"/);
 assert.match(c,/\["ring", "offer", "answer"/);
 assert.match(d,/\('ring','offer','answer'/);
});
test("real authenticated inbox delivers ring and subsequent offer in order",async()=>{
 let rows=[{id:1,conversation_id:room,sender_id:peer,kind:"signal",payload:{type:"ring",mode:"video"}}];
 const alerts=[];
 const tick=[];
 const state=startGlobalCallInbox({
  dataApiUrl:api,getSession:async()=>({access_token:"test.auth.session"}),
  onEvent:entry=>alerts.push(entry),
  fetcher:async(u,o)=>({ok:true,json:async()=>rows.filter(r=>r.id>JSON.parse(o.body).p_after)}),
  scheduler:(fn,delay)=>{tick.push({fn,delay});return tick.length},
  unschedule:()=>{}
 });
 await state.ready;
 assert.equal(alerts.length,1);
 assert.equal(alerts[0].type,"ring");
 rows.push({id:2,conversation_id:room,sender_id:peer,kind:"signal",payload:{type:"offer",mode:"video",description:{type:"offer",sdp:"v=0"}}});
 await tick.shift().fn();
 assert.equal(alerts[1].type,"offer");
 assert.equal(alerts[1].payload.description.type,"offer");
 state.stop();
});
test("incoming phone alert restores document title, cancels vibration and audio on stop",()=>{
 const titles={title:"Cartas — Looply",hidden:false};
 const vibrations=[];
 let interval=0,stopped=false;
 const mockWin={navigator:{vibrate:a=>vibrations.push(a)},AudioContext:class {
  currentTime=0;state="running";destination={};
  createOscillator(){return{frequency:{value:0},connect(){},start(){},stop(){},type:""};}
  createGain(){return{gain:{value:0},connect(){}};}
  close(){return Promise.resolve();}
 }};
 const stop=startIncomingCallAlert({
  name:"Contato",mode:"video",globalWindow:mockWin,globalDocument:titles,
  repeat:()=>++interval,stopRepeat:()=>{stopped=true;}
 });
 assert.equal(titles.title,"☎ Chamada recebida — Looply");
 assert.ok(vibrations.length>=1);
 stop();
 assert.equal(titles.title,"Cartas — Looply");
 assert.equal(stopped,true);
 assert.equal(vibrations.at(-1),0);
});
