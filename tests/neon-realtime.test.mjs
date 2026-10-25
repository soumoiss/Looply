import test from "node:test";
import assert from "node:assert/strict";
import realtime, { LooplyConversationRoom } from "../backend/neon-cloudflare/realtime-worker.mjs";

const UUID = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const origin = "https://soumoiss.github.io";
const route = "https://looply-staging.example/api/realtime-ticket";
function request(path=route, {body, authorization, method="POST", originValue=origin}={}) {
  return new Request(path, {
    method,
    headers: {
      origin: originValue,
      ...(authorization ? {authorization} : {}),
      ...(body ? {"content-type":"application/json"} : {})
    },
    ...(body ? {body:JSON.stringify(body)} : {})
  });
}
function roomEnv(events=[]) {
  return {LOOPLY_ROOMS: {
    idFromName: name => name,
    get: name => ({
      issueTicket: async userId => {
        events.push({name,userId});
        return "a".repeat(64);
      }
    })
  }};
}
test("Only authorized origins and valid Neon tokens can request tickets", async () => {
  const env=roomEnv();
  let response=await realtime.fetch(request(route,{body:{conversation_id:CONV},originValue:"https://evil.example",authorization:"Bearer test.jwt.signature"}),env);
  assert.equal(response.status,403);
  response=await realtime.fetch(request(route,{body:{conversation_id:CONV}}),env);
  assert.equal(response.status,401);
  response=await realtime.fetch(request(route,{body:{conversation_id:"bad"},authorization:"Bearer test.jwt.signature"}),env);
  assert.equal(response.status,400);
});
test("Neon checks both profile and membership before a one-time ticket is issued", async () => {
  const before=globalThis.fetch;
  const events=[]; let n=0;
  globalThis.fetch=async (url,opts) => {
    assert.equal(opts.headers.authorization,"Bearer allowed.jwt.signature");
    n++;
    if(String(url).includes("v3_self_profile")) return new Response(JSON.stringify([{id:UUID}]),{status:200});
    assert.match(String(url),/v3_is_conversation_member/);
    assert.equal(JSON.parse(opts.body).p_conversation_id,CONV);
    return new Response("true",{status:200});
  };
  try {
    const response=await realtime.fetch(request(route,{body:{conversation_id:CONV},authorization:"Bearer allowed.jwt.signature"}),roomEnv(events));
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ticket:"a".repeat(64),expires_in:30});
    assert.equal(events.length,1);assert.equal(events[0].userId,UUID);assert.equal(n,2);
  } finally {globalThis.fetch=before}
});
test("Unauthorized room membership cannot mint a ticket", async () => {
  const prev=globalThis.fetch;const calls=[];
  globalThis.fetch=async url => String(url).includes("v3_self_profile")
    ? new Response(JSON.stringify([{id:UUID}]),{status:200})
    : new Response("false",{status:200});
  try {
    const r=await realtime.fetch(request(route,{body:{conversation_id:CONV},authorization:"Bearer not.allowed.jwt"}),roomEnv(calls));
    assert.equal(r.status,403); assert.equal(calls.length,0);
  }finally{globalThis.fetch=prev}
});
test("An authenticated membership is never inferred from an error", async()=>{
  const prev=globalThis.fetch;
  globalThis.fetch=async()=>new Response("server unavailable",{status:503});
  try{
    const r=await realtime.fetch(request(route,{body:{conversation_id:CONV},authorization:"Bearer not.allowed.jwt"}),roomEnv());
    assert.equal(r.status,403);
  }finally{globalThis.fetch=prev}
});
test("WebSocket upgrades require an unguessable one-time ticket", async()=>{
  const r=await realtime.fetch(new Request("https://looply-staging.example/api/realtime?conversation_id="+CONV,{
    headers:{origin,upgrade:"websocket"}
  }),roomEnv());
  assert.equal(r.status,401);
});
test("Durable Object stores one-use random ticket for 30 seconds",async()=>{
  const db=new Map(),ctx={storage:{kv:{
    put(k,v){db.set(k,v)},get(k){return db.get(k)},delete(k){db.delete(k)}
  }},getWebSockets:()=>[],acceptWebSocket(){}};
  const room=new LooplyConversationRoom(ctx,{});
  const ticket=await room.issueTicket(UUID);
  assert.match(ticket,/^[0-9a-f]{64}$/);
  assert.equal(db.get("ticket:"+ticket).userId,UUID);
  assert.equal(db.size,1);
  const failed=await room.connect("b".repeat(64),"looply.ticket."+"b".repeat(64));
  assert.equal(failed.status,401);
  await room.connect("c".repeat(64),"looply.ticket."+"c".repeat(64));
  assert.equal(db.has("ticket:"+"b".repeat(64)),false);
});
