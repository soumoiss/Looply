import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createFastIncomingPoller } from "../src/fast-incoming-calls.js";

const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
const room="2f3e4d5c-1111-4111-8111-222233334444";
const peer="ba38fc13-1234-4aaa-8123-1234567890ab";
const base="https://ep-an-example.us-east-1.aws.neon.tech/neondb/rest/v1";
const drain=()=>new Promise(resolve=>setImmediate(resolve));
const row=(id,type="offer")=>({
 id, conversation_id:room, sender_id:peer,kind:"signal",
 payload:{type,mode:"video",description:{type:"offer",sdp:"v=0"},senderName:"Contato"}
});
function create({api=base,reply=()=>[row(1)],authToken="test.neon.token",visibility=()=> "visible"}={}) {
 const req=[],scheduled=[],received=[],errors=[];
 const timers = new Map();
 let seq=0;
 const client={
  dataApiUrl:api,
  auth:{getSession:async()=>({data:{session:{access_token:authToken}},error:null})}
 };
 const poller=createFastIncomingPoller({
  client,onSignal:msg=>received.push(msg),
  fetcher:async (url,options)=>{
   req.push({url,options});
   return {ok:true,status:200,json:async()=>reply(req.length,url,JSON.parse(options.body))};
  },
  schedule:(fn,ms)=>{timers.set(++seq,{fn,ms});scheduled.push({fn,ms});return seq;},
  cancel:id=>timers.delete(id),
  visibility,onError:e=>errors.push(e)
 });
 return {poller,req,scheduled,received,errors};
}
test("both local and remote video are mirrored in the actual call stylesheet",async()=>{
 const css=await read("assets/css/pages/chat.css");
 assert.match(css,/is-video-call \.chat-call-videos video\[data-call-local\],[\s\S]*is-video-call \.chat-call-videos video\[data-call-remote\]/);
 assert.match(css,/transform:scaleX\(-1\) !important/);
 const calls=await read("src/chat-calls.js");
 assert.match(calls,/<video data-call-remote autoplay playsinline/);
 assert.match(calls,/<video data-call-local autoplay playsinline muted/);
 assert.match(calls,/sender\.replaceTrack\(nextTrack\)/);
});
test("incoming monitoring starts BEFORE all page rendering on every authenticated page",async()=>{
 const runtime=await read("src/page-runtime.js");
 const start=runtime.indexOf("setupGlobalCallListener(supabase, user.id, null)");
 const render=runtime.indexOf("await render({ root, client:");
 assert.ok(start>0 && render>start, "global listener must start before render");
 assert.equal(runtime.split("setupGlobalCallListener(supabase, user.id,").length-1,1);
 const global=await read("src/global-call-listener.js");
 assert.match(global,/createFastIncomingPoller/);
 assert.match(global,/fastInbox\.start\(\)/);
 assert.match(global,/visibilitychange/);
 assert.match(global,/window\.addEventListener\("pageshow",wake\)/);
});
test("one Neon RPC delivers inbound calls across all memberships, without polling N conversation IDs",async()=>{
 const h=create();
 h.poller.start();
 await drain();
 assert.equal(h.req.length,1);
 assert.ok(h.req[0].url.endsWith("/rpc/v3_call_signal_inbox"));
 assert.equal(h.req[0].options.headers.authorization,"Bearer test.neon.token");
 assert.equal(h.received.length,1);
 assert.equal(h.received[0].conversationId,room);
 assert.equal(h.received[0].senderId,peer);
 assert.equal(h.received[0].payload.type,"offer");
 h.poller.stop();
});
test("browser-visible inbox targets subsecond 750ms polling and resumes immediately on focus",async()=>{
 const h=create({reply:()=>[]});
 h.poller.start();await drain();
 assert.equal(h.scheduled.at(-1).ms,750);
 await h.poller.refresh();
 assert.equal(h.req.length,2);
 h.poller.stop();
});
test("hidden tab reduces unnecessary database traffic and can restart on visibility",async()=>{
 const h=create({visibility:()=> "hidden", reply:()=>[]});
 h.poller.start();await drain();
 assert.equal(h.scheduled.at(-1).ms,2500);
 h.poller.stop();
});
test("inbox rejects malformed and forged messages, only trusted database sender IDs are used",async()=>{
 const h=create({reply:()=>[
  {id:1,conversation_id:"fake",sender_id:peer,kind:"signal",payload:{type:"offer"}},
  {id:2,conversation_id:room,sender_id:"fake",kind:"signal",payload:{type:"offer"}},
  {id:3,conversation_id:room,sender_id:peer,kind:"signal",payload:{type:"script"}},
  {id:4,conversation_id:room,sender_id:peer,kind:"signal",payload:{type:"offer",senderId:"forged"}},
 ]});
 h.poller.start(); await drain();
 assert.equal(h.received.length,1);
 assert.equal(h.received[0].senderId,peer);
 assert.equal(h.received[0].payload.senderId,peer);
 h.poller.stop();
});
test("declining an incoming call uses authenticated Neon RPC without requiring a WebSocket",async()=>{
 const h=create({reply:()=>[]});
 const ok=await h.poller.send({conversationId:room,type:"decline"});
 assert.equal(ok,true);
 assert.ok(h.req[0].url.endsWith("/rpc/v3_call_signal_send"));
 assert.deepEqual(JSON.parse(h.req[0].options.body),{
   p_conversation_id:room,p_kind:"signal",p_payload:{type:"decline",conversationId:room}
 });
 assert.equal(await h.poller.send({conversationId:"invalid",type:"decline"}),false);
 h.poller.stop();
});
test("channel level Cloudflare failures do not create multiple global Neon pollers",async()=>{
 const global=await read("src/global-call-listener.js");
 const bridge=await read("src/neon-realtime-bridge.js");
 assert.match(global,/disableFallback: true/);
 assert.match(bridge,/options\?\.config\?\.disableFallback !== true/);
 assert.match(bridge,/useFallback && conversationId/);
 assert.match(bridge,/roomKind === "call" \? 700/);
 assert.match(bridge,/AbortSignal\.timeout\(useFallback \? 850 : 1400\)/);
});
test("Neon inbox SQL restricts results to direct conversations and authorized participants",async()=>{
 const sql=await read("migration/neon-fast-incoming-calls-20261027.sql");
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/verified_identity_links/);
 assert.match(sql,/conversation_participants/);
 assert.match(sql,/AND c\.kind = 'direct'/);
 assert.match(sql,/e\.sender_id <> v_legacy_user_id/);
 assert.match(sql,/GRANT EXECUTE.*TO authenticated/);
 assert.doesNotMatch(sql,/TO anon/);
});
