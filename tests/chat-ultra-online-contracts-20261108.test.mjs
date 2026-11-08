import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {setupUltraTyping} from "../src/chat-ultra-typing.js";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const sleep=()=>new Promise(resolve=>setImmediate(resolve));

test("SQL restricts typing to an authenticated conversation member and expires it",()=>{
  const sql=read("migration/20261108_chat_ultra_typing_and_hide.sql");
  assert.match(sql,/actor:=public\.looply_legacy_uid\(\)/);
  assert.match(sql,/conversation_id=p_conversation_id AND user_id=actor/);
  assert.match(sql,/last_typed_at>pg_catalog\.now\(\)-interval '9 seconds'/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.chat_typing_state FROM PUBLIC,authenticated/);
  assert.match(sql,/state\.user_id<>actor\.id/);
  assert.match(sql,/REVOKE ALL ON public\.chat_message_hidden FROM PUBLIC,authenticated/);
  assert.match(sql,/hidden\.user_id=actor\.id/);
  assert.doesNotMatch(sql,/DELETE FROM public\.chat_messages/i);
});

test("typing is sent to the server, never synthesized as a chat message",async()=>{
  const room="33333333-3333-4333-8333-333333333333";
  const peer="44444444-4444-4444-8444-444444444444";
  const calls=[], updates=[];
  const input=new EventTarget();input.value="";
  const doc=new EventTarget();doc.visibilityState="visible";
  const win={setInterval(){return 1;},clearInterval(){},
    setTimeout(fn){fn();return 2;},clearTimeout(){}};
  const client={rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==="v41_chat_typing_visible")return {data:[{user_id:peer}],error:null};
    if(name==="v41_chat_typing_update")return {data:true,error:null};
    return {data:null,error:new Error("unknown RPC")};
  }};
  const state=setupUltraTyping({client,input,getConversationId:()=>room,
    onUpdate:(id,users)=>updates.push({id,users}),doc,win});
  await sleep();
  assert.ok(updates.some(x=>x.id===room&&x.users.includes(peer)));
  input.value="Digitando uma mensagem";
  input.dispatchEvent(new Event("input"));
  await sleep();
  assert.ok(calls.some(x=>x.name==="v41_chat_typing_update"&&x.args.p_typing===true));
  input.value="";
  input.dispatchEvent(new Event("input"));
  await sleep();
  assert.ok(calls.some(x=>x.name==="v41_chat_typing_update"&&x.args.p_typing===false));
  state.dispose();
});

test("both Ultra routes parse cleanly and preserve rejected edits",()=>{
  for(const path of ["chat.html","conversa.html"]){
    const html=read(path);
    const blocks=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    assert.ok(blocks.length>=2,path+": should keep model and runtime script");
    blocks.forEach((match,i)=>assert.doesNotThrow(()=>new Script(match[1],{filename:path+"#script"+i})));
    assert.match(html,/nativeSchedule/);
    assert.match(html,/startAuthenticatedVoice/);
    assert.match(html,/uploadAudio/);
    assert.match(html,/ultraEditBusy/);
    assert.match(html,/showTyping\(id,users=\[\]\)/);
  }
});

test("real thread honors the per-account hidden-message tombstone",()=>{
  const js=read("assets/js/chat-ultra-live.js");
  assert.match(js,/v41_hidden_chat_messages/);
  assert.match(js,/filter\(message=>!hidden\.has\(message\.id\)\)/);
  assert.match(js,/v41_hide_chat_message/);
  assert.match(js,/destructive\.dataset\.d==="me"/);
  assert.match(js,/setupUltraTyping/);
  assert.match(js,/uploadAudio:\(conversationId,file\)=>uploadFiles/);
  assert.doesNotMatch(js,/push\(conversation.*kind:"audio"/);
});
