import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startGlobalCallInbox } from "../src/global-call-inbox.js";

const API="https://example.apirest.us-east-1.aws.neon.tech/neondb/rest/v1";
const ROOM="2f3e4d5c-1111-4111-8111-222233334444";
const PEER="ba38fc13-1234-4aaa-8123-1234567890ab";
const getSession=async()=>({access_token:"valid.neon.auth.token"});
const read=file=>readFile(new URL("../"+file,import.meta.url),"utf8");

function makeInbox(rows=[],opts={}) {
  const calls=[], timers=[], received=[], errors=[];
  let cursor=0;
  const worker=startGlobalCallInbox({
    dataApiUrl:API,getSession,
    onEvent:item=>received.push(item),
    onError:error=>errors.push(error?.message),
    fetcher:async(url,init)=>{
      calls.push({url,init});
      if(opts.forbidden) return {ok:false,status:403,json:async()=>({code:"42501"})};
      const p=JSON.parse(init.body);
      if(!url.endsWith("/rpc/v3_call_signal_inbox")) throw Error("unexpected RPC");
      return {ok:true,json:async()=>rows.filter(row=>row.id>p.p_after)};
    },
    scheduler:(fn,delay)=>{timers.push({fn,delay,id:++cursor});return cursor;},
    unschedule:id=>{const i=timers.findIndex(t=>t.id===id);if(i>=0)timers.splice(i,1);},
    visible:()=>opts.visible??true,
    now:()=>Date.parse("2026-10-27T12:00:00Z")
  });
  return {worker,calls,timers,received,errors};
}
const signal=(id,type,extra={})=>({
  id,conversation_id:ROOM,sender_id:PEER,kind:"signal",
  payload:{type,mode:"video",description:{type:"offer",sdp:"v=0"},...extra}
});

test("Global call inbox reads ALL direct conversations with ONE authenticated Neon RPC",async()=>{
  const h=makeInbox([signal(1,"offer")]);
  await h.worker.ready;
  assert.equal(h.calls.length,1);
  assert.equal(h.received.length,1);
  assert.equal(h.received[0].type,"offer");
  assert.equal(h.received[0].senderId,PEER);
  assert.equal(h.received[0].conversationId,ROOM);
  assert.equal(h.calls[0].init.headers.authorization,"Bearer valid.neon.auth.token");
  assert.deepEqual(JSON.parse(h.calls[0].init.body).p_after,0);
  h.worker.stop();
});
test("Visible Home/Letters/Music tab polls promptly and avoids replaying the same offer",async()=>{
  const h=makeInbox([signal(8,"offer")]);
  await h.worker.ready;
  assert.equal(h.timers[0].delay,1100);
  await h.timers.shift().fn();
  assert.equal(h.received.length,1);
  assert.equal(JSON.parse(h.calls[1].init.body).p_after,8);
  h.worker.stop();
});
test("Background tabs slow down polling without claiming impossible wakeup latency",async()=>{
  const h=makeInbox([], {visible:false});
  await h.worker.ready;
  assert.equal(h.timers[0].delay,3500);
  h.worker.stop();
});
test("Hangup and decline close incoming call promptly, invalid sender IDs are dropped",async()=>{
  const h=makeInbox([signal(1,"offer"),signal(2,"hangup"),signal(3,"decline"),{...signal(4,"offer"),sender_id:"not-a-uuid"}]);
  await h.worker.ready;
  assert.deepEqual(h.received.map(x=>x.type),["offer","hangup","decline"]);
  h.worker.stop();
});
test("Neon failure does not fabricate successful incoming calls",async()=>{
  const h=makeInbox([signal(1,"offer")],{forbidden:true});
  await h.worker.ready;
  assert.equal(h.received.length,0);
  assert.match(h.errors[0],/neon_inbox_http_403_42501/);
  assert.ok(h.timers[0].delay>=2000);
  h.worker.stop();
});
test("Global listener is initialized BEFORE slow data rendering in every page runtime",async()=>{
  const src=await read("src/page-runtime.js");
  const start=src.indexOf("setupGlobalCallListener(supabase, user.id, profile)");
  const render=src.indexOf("await render({ root, client: supabase, user, profile, isAdmin })");
  assert.ok(start>0);
  assert.ok(start<render);
  assert.equal(src.split("setupGlobalCallListener(supabase, user.id, profile)").length-1,1);
});
test("WebSockets stay fast but no longer create separate Neon polling loops per room",async()=>{
  const [listener,bridge]=await Promise.all([read("src/global-call-listener.js"),read("src/neon-realtime-bridge.js")]);
  assert.match(listener,/fallback: false/);
  assert.match(listener,/startGlobalCallInbox/);
  assert.match(bridge,/const allowFallback = options\?\.config\?\.fallback !== false/);
  assert.match(listener,/onEvent: \(\{ conversationId, senderId, type, payload \}\)/);
});
test("Incoming call has audible ringtone, phone vibration, and existing accept/decline navigation",async()=>{
  const [listener,ring]=await Promise.all([read("src/global-call-listener.js"),read("src/global-call-ringtone.js")]);
  assert.match(listener,/startIncomingCallAlert/);
  assert.match(listener,/data-global-call-decline/);
  assert.match(listener,/data-global-call-accept/);
  assert.match(listener,/conversa\.html\?id=/);
  assert.match(ring,/AudioContext/);
  assert.match(ring,/vibrate/);
  assert.match(ring,/stopRepeat\(timer\)/);
});
test("Both local selfie and received remote video are mirrored, with controls unaffected",async()=>{
  const css=await read("assets/css/pages/chat-mobile-reference.css");
  assert.match(css,/\.is-video-call \.chat-call-videos video\[data-call-local\]/);
  assert.match(css,/\.is-video-call \.chat-call-videos video\[data-call-remote\]/);
  assert.match(css,/transform:scaleX\(-1\) !important/);
  assert.doesNotMatch(css,/\.chat-call-heading\s*\{\s*transform:scaleX\(-1\)/);
});
test("Incoming call notice stays on top of Home's global bottom navigation",async()=>{
  const css=await read("assets/css/app.css");
  assert.match(css,/\.looply-global-call-notice \{ z-index:40000; \}/);
});
test("Neon migration exposes membership-only direct call inbox, not raw signal table",async()=>{
  const sql=await read("migration/neon-global-call-inbox-20261027.sql");
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/verified_identity_links/);
  assert.match(sql,/JOIN public\.conversation_participants/);
  assert.match(sql,/c\.kind = 'direct'/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.v3_call_signal_inbox/);
  assert.doesNotMatch(sql,/GRANT SELECT ON looply_migration\.call_signal_events/);
});
