import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createGlobalCallInbox } from "../src/neon-global-call-inbox.js";

const source = path => readFile(new URL("../" + path, import.meta.url),"utf8");
const conversationId="2f3e4d5c-1111-4111-8111-222233334444";
const senderId="ba38fc13-1234-4aaa-8123-1234567890ab";
const endpoint="https://ep-test.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1";
const json=body=>({ok:true,status:200,json:async()=>body});
function harness(rows=[],options={}) {
  const calls=[], scheduled=[];
  const client=createGlobalCallInbox({
    dataApiUrl:endpoint,
    getSession:async()=>({access_token:"neon-auth-verified"}),
    fetcher:async(url,init)=>{
      calls.push({url,init});
      if(url.endsWith("/rpc/v3_call_signal_inbox"))return json(rows);
      if(url.endsWith("/rpc/v3_call_signal_send"))return json(1);
      throw Error("unknown_call_rpc");
    },
    schedule:(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;},
    cancel:()=>{},
    ...options
  });
  return {client,calls,scheduled};
}
const freshOffer=(overrides={})=>({
  id:1, conversation_id:conversationId, sender_id:senderId, kind:"signal",
  payload:{type:"offer", mode:"video", description:{type:"offer",sdp:"v=0"}, senderId:"forged", conversationId:"forged"},
  ...overrides
});
async function flush(){await new Promise(resolve=>setImmediate(resolve));}
test("single authenticated Neon inbox polls all direct conversations immediately",async()=>{
  const h=harness();
  const stop=h.client.subscribe(()=>{});
  await flush();
  assert.equal(h.calls.length,1);
  assert.match(h.calls[0].url,/\/rpc\/v3_call_signal_inbox$/);
  assert.equal(h.calls[0].init.headers.authorization,"Bearer neon-auth-verified");
  assert.equal(h.calls[0].init.credentials,"omit");
  assert.equal(h.scheduled.length,1);
  assert.equal(h.scheduled[0].ms,850);
  stop();
});
test("incoming call uses verified sender and room IDs, not untrusted SDP labels",async()=>{
  const h=harness([freshOffer()]);const received=[];
  const stop=h.client.subscribe(call=>received.push(call));
  await flush();
  assert.equal(received.length,1);
  assert.equal(received[0].senderId,senderId);
  assert.equal(received[0].payload.senderId,senderId);
  assert.equal(received[0].conversationId,conversationId);
  assert.equal(received[0].payload.conversationId,conversationId);
  assert.equal(received[0].payload.type,"offer");
  stop();
});
test("unauthorized or unrecognized payloads are never displayed as incoming calls",async()=>{
  const h=harness([
    freshOffer({id:1,sender_id:"fake"}),
    freshOffer({id:2,kind:"ttt"}),
    freshOffer({id:3,payload:{type:"unknown"}}),
    freshOffer({id:4,conversation_id:"broken"}),
    freshOffer({id:5,payload:{type:"hangup"}})
  ]);
  const received=[];
  const stop=h.client.subscribe(event=>received.push(event));
  await flush();
  assert.equal(received.length,1);
  assert.equal(received[0].payload.type,"hangup");
  stop();
});
test("one poll cursor advances and does not replay the same incoming offer",async()=>{
  const h=harness([freshOffer()]);const received=[];
  const stop=h.client.subscribe(event=>received.push(event));
  await flush();
  await h.scheduled[0].fn();
  await flush();
  assert.equal(h.calls.length,2);
  assert.equal(JSON.parse(h.calls[1].init.body).p_after,1);
  stop();
});
test("global decline is persisted through authenticated Neon RPC when Worker is absent",async()=>{
  const h=harness();
  assert.equal(await h.client.sendSignal(conversationId,"decline"),true);
  const req=h.calls.at(-1);
  assert.match(req.url,/\/rpc\/v3_call_signal_send$/);
  const body=JSON.parse(req.init.body);
  assert.equal(body.p_conversation_id,conversationId);
  assert.equal(body.p_payload.type,"decline");
  assert.equal(await h.client.sendSignal("invalid","decline"),false);
  assert.equal(await h.client.sendSignal(conversationId,"offer"),false);
});
test("global incoming-call listener starts before any page-specific render",async()=>{
  const runtime=await source("src/page-runtime.js");
  const marker="setupGlobalCallListener(supabase, user.id, null)";
  assert.equal(runtime.split(marker).length-1,1);
  assert.ok(runtime.indexOf(marker)<runtime.indexOf("const [profileResult, adminResult]"));
  assert.ok(runtime.indexOf(marker)<runtime.indexOf("await render({ root, client: supabase"));
  for(const file of ["assets/js/home.js","assets/js/chat.js","assets/js/conversation.js"]){
    const code=await source(file);
    assert.match(code,/mountAppPage/);
  }
});
test("global incoming listener uses one Neon inbox plus optional push and deduplicates offers",async()=>{
  const file=await source("src/global-call-listener.js");
  assert.match(file,/client\.subscribeCallInbox/);
  assert.match(file,/skipFallback: true/);
  assert.match(file,/incoming\?\.payload\?\.senderId === payload\.senderId/);
  assert.match(file,/stopInbox\(\)/);
  assert.match(file,/client\.sendIncomingCallSignal\?\./);
  assert.match(file,/looply:pending-call:/);
});
test("both parties see mirrored local AND remote video, audio stream is unchanged",async()=>{
  const css=await source("assets/css/pages/chat-mobile-reference.css");
  assert.match(css,/\.is-video-call \.chat-call-videos video\[data-call-local\],\s*\.page-chat \.is-video-call \.chat-call-videos video\[data-call-remote\]/);
  assert.match(css,/transform: scaleX\(-1\) !important/);
  const rtc=await source("src/chat-calls.js");
  assert.match(rtc,/data-call-local autoplay playsinline muted/);
  assert.match(rtc,/data-call-remote autoplay playsinline/);
  assert.match(rtc,/remote\.srcObject = remoteStream/);
});
test("ringing no longer waits five seconds for ICE gathering",async()=>{
  const code=await source("src/chat-calls.js");
  assert.match(code,/waitForIceGatheringComplete = \(peer, timeout = 750\)/);
  assert.match(code,/description: pc\?\.localDescription\?\.toJSON\(\) \|\| offerPayload\.description/);
  assert.match(code,/onicecandidate = \(event\) => \{ if \(event\.candidate\) send\("ice"/);
});
test("Android phone loads mirror styles using a new URL and new page entrypoint",async()=>{
  for(const path of ["chat.html","conversa.html"]){
    const html=await source(path);
    assert.match(html,/chat-mobile-reference\.css\?v=20261027-instant-mirror/);
    assert.match(html,/neon-call-fallback/);
  }
  const sw=await source("sw.js");
  assert.match(sw,/looply-shell-v7/);
});
test("database inbox only returns membership-authorized direct chat calls",async()=>{
  const sql=await source("migration/neon-global-call-inbox-20261027.sql");
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/verified_identity_links/);
  assert.match(sql,/JOIN public\.conversation_participants m/);
  assert.match(sql,/c\.kind = 'direct'/);
  assert.match(sql,/e\.sender_id <> v_self/);
  assert.match(sql,/REVOKE ALL ON FUNCTION.* FROM PUBLIC/);
  assert.match(sql,/GRANT EXECUTE.* TO authenticated/);
});

test("incoming calls are rendered in a real browser top-layer dialog, above Reels and Stories",async()=>{
  const js=await source("src/global-call-listener.js");
  const css=await source("assets/css/app.css");
  assert.match(js,/overlay = document\.createElement\("dialog"\)/);
  assert.match(js,/modal\.showModal\(\)/);
  assert.match(js,/overlay\.close\(\)/);
  assert.match(css,/\.looply-global-call-notice::backdrop/);
  assert.match(css,/height:100dvh/);
});
test("active direct call and game establish authorized Neon channels without waiting for Cloudflare",async()=>{
 const [bridge,calls,games]=await Promise.all([
  source("src/neon-realtime-bridge.js"),
  source("src/chat-calls.js"),
  source("src/chat-enhancements.js")
 ]);
 assert.match(bridge,/options\?\.fastFallback === true/);
 assert.match(bridge,/return open\(\)/);
 assert.match(calls,/fastFallback: true/);
 assert.match(games,/fastFallback: true/);
 assert.match(bridge,/report\("SUBSCRIBED"\)/);
});
