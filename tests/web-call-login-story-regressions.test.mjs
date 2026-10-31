import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createNeonRealtimeBridge } from "../src/neon-realtime-bridge.js";
import { fetchLinkedNeonProfile } from "../src/neon-identity.js";
import { emailOf } from "../src/neon-login-identity.js";
const room="2f3e4d5c-1111-4111-8111-222233334444";
const alice="ba38fc13-1234-4aaa-8123-1234567890ab";
const bob="aa38fc13-1234-4aaa-8123-1234567890ac";
const source = name => readFile(new URL("../src/"+name,import.meta.url),"utf8");

test("two independent callers use the same authenticated Neon signaling transport for all call messages",async()=>{
  const subs=[];
  let cloudflareRequests=0;
  const create = (identity) => createNeonRealtimeBridge({
    endpoint:"https://example.workers.dev",
    getSession:async()=>({access_token:"signed."+identity+".token"}),
    fetcher:async()=>{cloudflareRequests++;throw Error("Cloudflare call ticket must not be requested");},
    fallback:{
      connect:async(conversationId,onWire,report,period)=>{
        assert.equal(conversationId,room);
        assert.equal(period,700);
        const self={identity,onWire};
        subs.push(self);
        return {
          kind:"neon",readyState:1,
          send:async({event,payload})=>{
            assert.equal(event,"signal");
            for(const other of subs) if(other!==self)
              queueMicrotask(()=>other.onWire({
                type:"signal",signal_type:payload.type==="ice"?"candidate":payload.type,
                value:JSON.stringify({...payload,senderId:"fake",conversationId:"fake"}),
                user_id:identity
              }));
            return "ok";
          },
          close:()=>{const i=subs.indexOf(self);if(i>=0)subs.splice(i,1);}
        };
      }
    }
  });
  const a=create(alice),b=create(bob);
  const chA=a.channel("looply-call-"+room,{config:{private:true,preferNeon:true}});
  const chB=b.channel("looply-call-"+room,{config:{private:true,preferNeon:true}});
  const on=(c)=>new Promise((ok,fail)=>c.subscribe((status,error)=>status==="SUBSCRIBED"?ok():status==="CHANNEL_ERROR"?fail(error):null));
  const messagesA=[],messagesB=[];
  chA.on("broadcast",{event:"signal"},({payload})=>messagesA.push(payload));
  chB.on("broadcast",{event:"signal"},({payload})=>messagesB.push(payload));
  await Promise.all([on(chA),on(chB)]);
  const send=(ch,type)=>ch.send({type:"broadcast",event:"signal",payload:{type,description:{type,sdp:"v=0"}}});
  assert.equal(await send(chA,"offer"),"ok");
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(messagesB.at(-1).type,"offer");
  assert.equal(messagesB.at(-1).senderId,alice);
  assert.equal(messagesB.at(-1).conversationId,room);
  for(const kind of ["answer","ice","hangup"])
    assert.equal(await send(chB,kind),"ok");
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(messagesA.map(m=>m.type),["answer","ice","hangup"]);
  assert.ok(messagesA.every(m=>m.senderId===bob&&m.conversationId===room));
  assert.equal(cloudflareRequests,0);
  await chA.unsubscribe();await chB.unsubscribe();
});

test("chat call controller opts into the single Neon signaling path",async()=>{
  const sourceText=await source("chat-calls.js");
  assert.match(sourceText,/preferNeon: true/);
  assert.match(sourceText,/getUserMedia/);
  assert.match(sourceText,/waitForIceGatheringComplete/);
});

test("Kelry and Angelo aliases resolve to the existing Neon Auth accounts without creating users",()=>{
  assert.equal(emailOf("kelry"),"kelry@loooply.app");
  assert.equal(emailOf("Angelo"),"angeloeng@loooply.app");
  assert.equal(emailOf("@Ângelo"),"angeloeng@loooply.app");
  assert.equal(emailOf("angel0v"),"angeloeng@loooply.app");
});

test("linked profile retrieval survives several temporarily empty Neon responses",async()=>{
  let n=0;
  const result=await fetchLinkedNeonProfile({
    dataApiUrl:"https://example.neon.tech/neondb/rest/v1",
    session:{access_token:"signed.jwt.token"},
    sleep:async()=>{},
    fetchImpl:async()=>new Response(JSON.stringify(++n===6?[{id:"linked-profile",username:"kelry"}]:[]),{status:200})
  });
  assert.equal(result.id,"linked-profile");
  assert.equal(n,6);
});

test("Story music picker never requests a local audio file as a substitute for a catalog preview",async()=>{
  const picker=await source("story-music-picker.js");
  assert.doesNotMatch(picker,/data-studio-audio-file|fileInput\\.click\\(\\)|Áudio próprio<input/);
  assert.match(picker,/track\\?\\.kind === "catalog"/);
  assert.match(picker,/track\\.kind==="openverse"/);
});
