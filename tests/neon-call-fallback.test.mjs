import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createNeonSignalFallback } from "../src/neon-call-fallback.js";
import { createNeonRealtimeBridge } from "../src/neon-realtime-bridge.js";

const ROOM="2f3e4d5c-1111-4111-8111-222233334444";
const PEER="ba38fc13-1234-4aaa-8123-1234567890ab";
const API="https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1";
const actions=[];
const json = data=>({ok:true,status:200,json:async()=>data});
function createHarness({deny=false,workerDenied=true}={}) {
  const calls=[];
  const scheduled=[];
  const queue=[];
  let id=0;
  let timer=0;
  const fallback=createNeonSignalFallback({
    dataApiUrl:API,getSession:async()=>({access_token:"test.neon.access.token"}),
    schedule:(fn,ms)=>{scheduled.push(fn);return ++timer;},
    cancel:()=>{},
    fetcher:async(url,opts)=>{
      calls.push({url,opts});
      if(deny)return {ok:false,status:403,json:async()=>({code:"42501"})};
      const args=JSON.parse(opts.body);
      if(url.endsWith("/rpc/v3_call_signal_send")){
        queue.push({id:++id,sender_id:PEER,kind:args.p_kind,payload:args.p_payload});
        return json(id);
      }
      if(url.endsWith("/rpc/v3_call_signal_list"))return json(
        queue.filter(x=>x.id>args.p_after));
      throw Error("unexpected_rpc");
    }
  });
  const bridge=createNeonRealtimeBridge({
    endpoint:"https://worker.example.workers.dev",
    getSession:async()=>({access_token:"test.neon.access.token"}),
    fetcher:async()=>workerDenied
      ? {ok:false,status:403,json:async()=>({error:"forbidden"})}
      : {ok:false,status:503,json:async()=>({error:"unavailable"})},
    fallback
  });
  return {bridge,calls,queue,scheduled};
}
async function subscribed(bridge,kind="call") {
  const ch=bridge.channel("looply-"+kind+"-"+ROOM);
  await new Promise((resolve,reject)=>{
    ch.subscribe((status,error)=>{
      if(status==="SUBSCRIBED")resolve();
      if(status==="CHANNEL_ERROR")reject(error);
    });
  });
  return ch;
}
test("When Worker rejects a valid member, authenticated Neon fallback subscribes without Supabase",async()=>{
  const h=createHarness();
  const channel=await subscribed(h.bridge);
  assert.ok(h.calls.some(x=>x.url.endsWith("/rpc/v3_call_signal_list")));
  assert.equal(h.calls[0].opts.headers.authorization,"Bearer test.neon.access.token");
  assert.deepEqual(JSON.parse(h.calls[0].opts.body).p_conversation_id,ROOM);
  await channel.unsubscribe();
});
test("Old WebRTC event contract sends offer, answer, ICE, hangup through real Neon RPC",async()=>{
  const h=createHarness();
  const channel=await subscribed(h.bridge);
  for(const type of ["offer","answer","ice","hangup","decline","failed"]){
    const result=await channel.send({type:"broadcast",event:"signal",payload:{type,conversationId:ROOM,description:{sdp:"real SDP placeholder"}}});
    assert.equal(result,"ok");
  }
  assert.deepEqual(h.calls.filter(x=>x.url.endsWith("_send")).map(x=>JSON.parse(x.opts.body).p_payload.type),
    ["offer","answer","ice","hangup","decline","failed"]);
  await channel.unsubscribe();
});
test("Received fallback WebRTC signal has membership-authenticated sender and room",async()=>{
  const h=createHarness();
  const channel=h.bridge.channel("looply-call-"+ROOM);
  const messages=[];
  channel.on("broadcast",{event:"signal"},({payload})=>messages.push(payload));
  const ready=new Promise((resolve,reject)=>channel.subscribe((state,error)=>state==="SUBSCRIBED"?resolve():state==="CHANNEL_ERROR"?reject(error):null));
  await ready;
  h.queue.push({id:500,sender_id:PEER,kind:"signal",
    payload:{type:"offer",senderId:"forged",conversationId:"forged",description:{type:"offer",sdp:"v=0"}}});
  await h.scheduled.shift()();
  assert.equal(messages.length,1);
  assert.equal(messages[0].senderId,PEER);
  assert.equal(messages[0].conversationId,ROOM);
  assert.equal(messages[0].type,"offer");
  await channel.unsubscribe();
});
test("Game invitations fall back to same authorized conversation signal path",async()=>{
  const h=createHarness();
  const channel=await subscribed(h.bridge,"game");
  assert.equal(await channel.send({type:"broadcast",event:"ttt",payload:{type:"invite",senderName:"Teste"}}),"ok");
  assert.equal(JSON.parse(h.calls.at(-1).opts.body).p_kind,"ttt");
  await channel.unsubscribe();
});
test("Unauthorized user on Worker AND Neon does not report a successful subscription",async()=>{
  const h=createHarness({deny:true});
  const channel=h.bridge.channel("looply-call-"+ROOM);
  const statuses=[];
  const failed=new Promise(resolve=>channel.subscribe((s,error)=>{
    statuses.push(s);
    if(s==="CHANNEL_ERROR")resolve(error);
  }));
  const error=await failed;
  assert.ok(error.message.includes("neon_signal_http_403_42501"));
  assert.ok(!statuses.includes("SUBSCRIBED"));
  await channel.unsubscribe();
});
test("No raw Supabase infrastructure or client APIs are used by the fallback",async()=>{
  const s=await readFile(new URL("../src/neon-call-fallback.js",import.meta.url),"utf8");
  assert.doesNotMatch(s,/supabase\.co|supabase-js|supabase\.from|createClient\(/i);
  assert.match(s,/v3_call_signal_list/);
  assert.match(s,/v3_call_signal_send/);
  const m=await readFile(new URL("../migration/neon-call-signaling-fallback-20261027.sql",import.meta.url),"utf8");
  assert.match(m,/SECURITY DEFINER/);
  assert.match(m,/public\.v3_is_conversation_member/);
  assert.match(m,/REVOKE ALL ON looply_migration\.call_signal_events FROM authenticated/);
  assert.match(m,/expires_at/);
});

test("two independent signed-in peers exchange offer, answer, ICE, hangup, and game invitations",async()=>{
  const server={rows:[],id:0};
  const ids={
    first:"ba38fc13-1234-4aaa-8123-1234567890ab",
    second:"ca38fc13-1234-4aaa-8123-1234567890ab"
  };
  const makePeer=(name)=>{
    const callbacks=[];
    const fallback=createNeonSignalFallback({
      dataApiUrl:API,
      getSession:async()=>({access_token:name}),
      schedule:fn=>{callbacks.push(fn);return callbacks.length;},
      cancel:()=>{},
      fetcher:async(url,opts)=>{
        const args=JSON.parse(opts.body);
        if(url.endsWith("_list")){
          const rows=server.rows.filter(row=>row.id>args.p_after&&row.sender_id!==ids[name]);
          return json(rows);
        }
        if(url.endsWith("_send")){
          server.rows.push({id:++server.id,sender_id:ids[name],kind:args.p_kind,payload:args.p_payload});
          return json(server.id);
        }
        throw Error("unexpected RPC");
      }
    });
    const bridge=createNeonRealtimeBridge({
      endpoint:"https://worker.example.workers.dev",
      getSession:async()=>({access_token:name}),
      fetcher:async()=>({ok:false,status:503,json:async()=>({error:"backend_unavailable"})}),
      fallback
    });
    return {bridge,callbacks,inbox:[]};
  };
  const alice=makePeer("first"),bob=makePeer("second");
  const a=alice.bridge.channel("looply-call-"+ROOM), b=bob.bridge.channel("looply-call-"+ROOM);
  for(const [channel,peer] of [[a,alice],[b,bob]]){
    channel.on("broadcast",{event:"signal"},({payload})=>peer.inbox.push(payload));
    await new Promise((resolve,reject)=>channel.subscribe((state,error)=>{
      if(state==="SUBSCRIBED")resolve();
      if(state==="CHANNEL_ERROR")reject(error);
    }));
  }
  const poll=async peer=>{const fn=peer.callbacks.shift();assert.ok(fn);await fn();};
  assert.equal(await a.send({type:"broadcast",event:"signal",payload:{type:"offer",description:{type:"offer",sdp:"v=0"}}}),"ok");
  await poll(bob);
  assert.equal(bob.inbox[0].type,"offer");
  assert.equal(bob.inbox[0].senderId,ids.first);
  assert.equal(await b.send({type:"broadcast",event:"signal",payload:{type:"answer",description:{type:"answer",sdp:"v=0"}}}),"ok");
  await poll(alice);
  assert.equal(alice.inbox[0].type,"answer");
  assert.equal(alice.inbox[0].senderId,ids.second);
  assert.equal(await a.send({type:"broadcast",event:"signal",payload:{type:"ice",candidate:{candidate:"candidate:1"}}}),"ok");
  await poll(bob);
  assert.equal(bob.inbox.at(-1).type,"ice");
  assert.equal(await b.send({type:"broadcast",event:"signal",payload:{type:"hangup"}}),"ok");
  await poll(alice);
  assert.equal(alice.inbox.at(-1).type,"hangup");
  await a.unsubscribe();await b.unsubscribe();
  const gameA=alice.bridge.channel("looply-game-"+ROOM);
  const gameB=bob.bridge.channel("looply-game-"+ROOM);
  const invites=[];
  for(const ch of [gameA,gameB]){
    ch.on("broadcast",{event:"ttt"},({payload})=>invites.push(payload));
    await new Promise((resolve,reject)=>ch.subscribe((state,error)=>state==="SUBSCRIBED"?resolve():state==="CHANNEL_ERROR"?reject(error):null));
  }
  assert.equal(await gameA.send({type:"broadcast",event:"ttt",payload:{type:"invite",gameId:"hello"}}),"ok");
  await poll(bob);
  assert.equal(invites.at(-1).type,"invite");
  assert.equal(invites.at(-1).senderId,ids.first);
  await gameA.unsubscribe();await gameB.unsubscribe();
});
