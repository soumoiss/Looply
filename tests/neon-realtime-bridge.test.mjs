import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createNeonRealtimeBridge } from "../src/neon-realtime-bridge.js";
const read = file => readFile(new URL("../"+file, import.meta.url), "utf8");
const conv="2f3e4d5c-1111-4111-8111-222233334444";
const member="ba38fc13-1234-4aaa-8123-1234567890ab";
const ticket="a".repeat(64);
class MockSocket {
  static instances=[];
  constructor(url,protocol) {
    this.url=url;this.protocol=protocol;this.readyState=0;
    this.handlers=new Map();this.sent=[];
    MockSocket.instances.push(this);
    queueMicrotask(()=>{this.readyState=1;this.emit("open",{});});
  }
  addEventListener(event,fn){this.handlers.set(event,[...(this.handlers.get(event)||[]),fn]);}
  removeEventListener(event,fn){this.handlers.set(event,(this.handlers.get(event)||[]).filter(x=>x!==fn));}
  emit(event,payload){for(const fn of this.handlers.get(event)||[])fn(payload);}
  send(value){if(this.readyState!==1)throw Error("closed");this.sent.push(JSON.parse(value));}
  close(){this.readyState=3;this.emit("close",{});}
}
function harness(token="sample.neon.auth.token",fetchReply={ok:true,json:async()=>({ticket})}) {
  const calls=[];
  const bridge=createNeonRealtimeBridge({
    endpoint:"https://looply-original-realtime-staging.s0upoetamoiss.workers.dev",
    getSession:async()=>({access_token:token}),
    fetcher:async(url,init)=>{calls.push({url,init});return fetchReply;},
    Socket:MockSocket
  });
  return {bridge,calls};
}
async function active(bridge) {
  const channel=bridge.channel("looply-call-"+conv);
  const subscribed=new Promise((resolve,reject)=>{
    channel.subscribe((state,err)=>{
      if(state==="SUBSCRIBED")resolve();
      if(state==="CHANNEL_ERROR")reject(err);
    });
  });
  await subscribed;
  return channel;
}
test("direct call obtains a short-lived ticket with auth header, not URL/query secret",async()=>{
  const {bridge,calls}=harness();
  const c=await active(bridge);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://looply-original-realtime-staging.s0upoetamoiss.workers.dev/api/realtime-ticket");
  assert.equal(calls[0].init.headers.authorization,"Bearer sample.neon.auth.token");
  assert.deepEqual(JSON.parse(calls[0].init.body),{conversation_id:conv});
  const socket=MockSocket.instances.at(-1);
  assert.match(socket.url,/^wss:\/\/looply-original-realtime-staging\.s0upoetamoiss\.workers\.dev\/api\/realtime\?conversation_id=/);
  assert.doesNotMatch(socket.url,/token|Bearer|sample\.neon/);
  assert.equal(socket.protocol,"looply.ticket."+ticket);
  await c.unsubscribe();
});
test("outgoing call offer, answer, ice, decline and hangup use authenticated room wire",async()=>{
  const {bridge}=harness();
  const c=await active(bridge);
  const socket=MockSocket.instances.at(-1);
  for(const kind of ["offer","answer","ice","hangup","decline","failed"]){
    const result=await c.send({type:"broadcast",event:"signal",payload:{type:kind,conversationId:conv,senderId:member,description:{sdp:"demo"}}});
    assert.equal(result,"ok");
  }
  assert.deepEqual(socket.sent.map(x=>x.signal_type),["offer","answer","candidate","hangup","decline","failed"]);
  await c.unsubscribe();
});
test("incoming call identity is derived from WebSocket server, not fake senderId",async()=>{
  const {bridge}=harness();
  const c=bridge.channel("looply-call-"+conv);
  const received=[];
  c.on("broadcast",{event:"signal"},({payload})=>received.push(payload));
  await new Promise((resolve,reject)=>c.subscribe((state,err)=>state==="SUBSCRIBED"?resolve():state==="CHANNEL_ERROR"?reject(err):null));
  MockSocket.instances.at(-1).emit("message",{data:JSON.stringify({type:"signal",signal_type:"candidate",value:JSON.stringify({type:"ice",senderId:"forged",conversationId:"other",candidate:{candidate:"candidate:a"}}),user_id:member})});
  assert.equal(received.length,1);
  assert.equal(received[0].senderId,member);
  assert.equal(received[0].conversationId,conv);
  assert.equal(received[0].type,"ice");
  await c.unsubscribe();
});
test("game invitations use real authenticated room broadcasts, no fake local response",async()=>{
  const {bridge}=harness();
  const c=bridge.channel("looply-game-"+conv);
  const responses=[];
  c.on("broadcast",{event:"ttt"},({payload})=>responses.push(payload));
  await new Promise((resolve,reject)=>c.subscribe((status,error)=>status==="SUBSCRIBED"?resolve():status==="CHANNEL_ERROR"?reject(error):null));
  assert.equal(await c.send({type:"broadcast",event:"ttt",payload:{type:"invite",conversationId:conv,senderId:"forged",senderName:"Teste"}}),"ok");
  assert.equal(MockSocket.instances.at(-1).sent.at(-1).event,"ttt");
  MockSocket.instances.at(-1).emit("message",{data:JSON.stringify({type:"broadcast",event:"ttt",payload:{type:"invite",senderId:"forged"},user_id:member})});
  assert.equal(responses[0].senderId,member);
  await c.unsubscribe();
});
test("non-member/private undocumented channels never claim they subscribed",async()=>{
  const {bridge,calls}=harness();
  const statuses=[];
  const c=bridge.channel("looply-activity-invalid");
  c.subscribe(status=>statuses.push(status));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(statuses,["CHANNEL_ERROR"]);
  assert.equal(calls.length,0);
  await c.unsubscribe();
});
test("membership/ticket refusal does not invent successful call signaling",async()=>{
  const {bridge}=harness("valid-token",{ok:false,status:403});
  const c=bridge.channel("looply-call-"+conv);
  const states=[];
  c.subscribe(status=>states.push(status));
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(states.includes("CHANNEL_ERROR"));
  assert.equal(await c.send({type:"broadcast",event:"signal",payload:{type:"offer"}}),"error");
  await c.unsubscribe();
});
test("production Neon client references WebSocket bridge instead of a no-op realtime stub",async()=>{
  const source=await read("src/neon-production-client.js");
  assert.match(source,/createNeonRealtimeBridge/);
  assert.match(source,/channel: realtimeBridge\.channel/);
  assert.match(source,/supportsRealtime: realtimeBridge\.supportsRealtime/);
  assert.doesNotMatch(source,/channel: \(\) => \(\{ on\(\)/);
});
test("Cloudflare Durable Object enforces membership, one-time tickets and room-scoped WebRTC relay",async()=>{
  const source=await read("backend/neon-cloudflare/realtime-worker.mjs");
  assert.match(source,/v3_is_conversation_member/);
  assert.match(source,/ticket\.until < Date\.now\(\)/);
  assert.match(source,/this\.ctx\.storage\.kv\.delete\(key\)/);
  assert.match(source,/env\.LOOPLY_ROOMS\.idFromName\("conversation:"/);
  assert.match(source,/payload\.event === "ttt"/);
  assert.match(source,/\"candidate\", \"hangup\", \"decline\", \"failed\"/);
});
