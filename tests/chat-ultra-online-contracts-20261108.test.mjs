import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {setupUltraTyping} from "../src/chat-ultra-typing.js";
import {createUltraSendIds} from "../src/chat-ultra-send-ids.js";

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

test("message UUID stays the same across retry and rotates only after confirmation",()=>{
  let n=0;
  const ids=createUltraSendIds({createId:()=>{
    n++;
    return "aaaaaaaa-aaaa-4aaa-8aaa-"+String(n).padStart(12,"0");
  }});
  const c="33333333-3333-4333-8333-333333333333";
  const first=ids.get(c,"Olá","");const retry=ids.get(c,"Olá","");
  assert.equal(first,retry);
  assert.equal(ids.count(),1);
  const other=ids.get(c,"Uma nova mensagem","");
  assert.notEqual(first,other);
  ids.confirm(c,"Olá","");
  assert.equal(ids.count(),1);
  assert.notEqual(ids.get(c,"Olá",""),first);
});

test("saved and pinned messages are JWT-scoped, and only three can be pinned",()=>{
  const sql=read("migration/20261108_chat_ultra_message_flags.sql");
  const adapter=read("assets/js/chat-ultra-live.js");
  assert.match(sql,/public\.looply_legacy_uid\(\)/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/ORDER BY older\.pinned_at DESC,older\.message_id DESC OFFSET 3/);
  assert.match(sql,/flags\.user_id=actor\.id/);
  assert.match(adapter,/v42_set_chat_message_flag/);
  assert.match(adapter,/v42_chat_message_flags/);
  assert.match(adapter,/pendingSendIds\.get\(conversationId,body,replyTo\)/);
  assert.match(adapter,/existing\.body!==body/);
});

test("blocking is scoped to private conversations and enforced before message insert",()=>{
  const sql=read("migration/20261108_chat_ultra_server_blocks.sql");
  const adapter=read("assets/js/chat-ultra-live.js");
  assert.match(sql,/public\.looply_legacy_uid\(\)/);
  assert.match(sql,/room\.kind IN \('direct','letter'\)/);
  assert.match(sql,/BEFORE INSERT ON public\.chat_messages/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.chat_user_blocks FROM PUBLIC,authenticated/);
  assert.match(adapter,/v43_set_chat_block/);
  assert.match(adapter,/v43_chat_block_states/);
  assert.match(adapter,/room\?\.canChat===false/);
  for(const html of ["chat.html","conversa.html"]){
    const source=read(html);
    assert.match(source,/#cfg \[data-cfg='block'\]/);
    assert.match(source,/hooks\?\.block\?\.\(id,true\)/);
  }
});
