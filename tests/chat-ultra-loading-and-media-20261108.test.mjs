import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createNeonRestQuery} from "../src/neon-rest-bridge.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("idempotent chat UUID is permitted while owner authorization remains in Neon",async()=>{
  const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const conversation_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let calls=0;
  const query=createNeonRestQuery("chat_messages",{
    dataApiUrl:"https://test.example/rest/v1",getAccessToken:async()=>"authenticated-token",
    fetchImpl:async(url,options)=>{
      calls++;
      const payload=JSON.parse(options.body);
      assert.equal(payload.id,id);
      assert.equal(payload.conversation_id,conversation_id);
      assert.equal(options.method,"POST");
      assert.ok(options.headers.authorization.startsWith("Bearer "));
      return {ok:true,status:201,headers:{get:()=>null},json:async()=>[{id}]};
    }
  });
  const response=await query.insert({id,conversation_id,sender_id:id,body:"Olá"}).select("id").single();
  assert.equal(response.error,null);
  assert.equal(response.data.id,id);
  assert.equal(calls,1);
});
test("upload parent lookup selects the composite key that actually exists",()=>{
  const source=read("backend/neon-storage/index.mjs");
  assert.match(source,/table==="conversation_participants"\?"conversation_id":"id"/);
  assert.match(source,/object\.owner===profileId/);
  assert.match(source,/conversation_id:"eq\."\+object\.conversation/);
  assert.match(source,/user_id:"eq\."\+profileId/);
  assert.match(source,/Math\.max\(2, Math\.min\(1800/);
});
test("first inbox paint does not await R2 signatures, receipts or history previews",()=>{
  const native=read("src/chat.js");
  const live=read("assets/js/chat-ultra-live.js");
  const quick=native.split("export async function loadChatOverview")[1]?.split("export async function loadChatData")[0];
  assert.ok(quick,"fast overview must be available");
  assert.match(quick,/conversation_participants/);
  assert.match(quick,/Promise\.all/);
  assert.doesNotMatch(quick,/cachedSignedUrl|mark_conversations_delivered|loadUnreadChatNotifications/);
  assert.match(live,/const initial=await loadChatOverview\(client,selfId\)/);
  assert.match(live,/document\.body\.removeAttribute\("data-ultra-loading"\)/);
  assert.match(live,/window\.setTimeout\(\(\)=>void refreshRooms\(\),0\)/);
});
test("approved chat and conversa prevent phantom panels and use real sticker catalog",()=>{
  for(const page of ["chat.html","conversa.html"]){
    const source=read(page);
    assert.match(source,/data-ultra-loading="true"/);
    assert.match(source,/#comp>#attachFan:not\(\.open\)/);
    assert.match(source,/body\[data-ultra-loading="true"\] #list>/);
    assert.match(source,/case "sticker": return \(\$u\("#bStickers"\)/);
  }
});
test("media and voice uploads create authorized parent before R2 and wait for persisted chat_media",()=>{
  const source=read("assets/js/chat-ultra-live.js");
  assert.match(source,/const \{data,error\}=await client\.from\("chat_messages"\)/);
  assert.match(source,/for\(let index=0;index<files\.length;index\+\+\)/);
  assert.match(source,/client\.storage\.from\("looply-chat"\)\.upload\(path,file/);
  assert.match(source,/client\.from\("chat_media"\)\.insert\(/);
  assert.match(source,/stored=true/);
  assert.match(source,/if\(stored\)\{say\("Arquivo enviado; atualize a conversa/);
});
test("all new modules use valid Node JavaScript syntax",()=>{
  for(const path of ["src/chat.js","src/neon-rest-bridge.js","backend/neon-storage/index.mjs",
    "assets/js/chat-ultra-live.js"]){
    const result=spawnSync(process.execPath,["--check",new URL("../"+path,import.meta.url).pathname],{encoding:"utf8"});
    assert.equal(result.status,0,path+": "+result.stderr);
  }
});
