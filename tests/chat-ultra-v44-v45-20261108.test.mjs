import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {createUltraRoomService} from "../src/chat-ultra-room-service.js";
import {createUltraDraftSync} from "../src/chat-ultra-drafts.js";
import {createStoreZip,exportUltraHistory} from "../src/chat-ultra-export.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const room="11111111-1111-4111-8111-111111111111";
const member="22222222-2222-4222-8222-222222222222";

test("v44-v45 rules preserve historical rows and enforce room membership",()=>{
  const roomSql=read("migration/20261108_chat_ultra_room_controls_v44.sql");
  const draftSql=read("migration/20261108_chat_ultra_private_drafts_v45.sql");
  assert.match(roomSql,/v44_chat_clear_history/);
  assert.match(roomSql,/cleared_before/);
  assert.match(roomSql,/public\.looply_legacy_uid\(\)/);
  assert.match(roomSql,/CREATE POLICY chat_ultra_expiry_visibility.*AS RESTRICTIVE/s);
  assert.match(roomSql,/CREATE POLICY chat_ultra_media_visibility.*AS RESTRICTIVE/s);
  assert.match(roomSql,/CREATE POLICY chat_ultra_owner_update.*AS RESTRICTIVE/s);
  assert.match(roomSql,/BEFORE INSERT ON public\.chat_messages/);
  assert.match(roomSql,/NEW\.expires_at:=pg_catalog\.now\(\)/);
  assert.match(roomSql,/room\.kind='group' AND room\.created_by IS DISTINCT FROM actor/);
  assert.match(roomSql,/owner=actor AND EXISTS/);
  assert.doesNotMatch(roomSql,/DELETE FROM public\.chat_messages/i);
  assert.match(draftSql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(draftSql,/REVOKE ALL ON public\.chat_ultra_drafts FROM PUBLIC,authenticated/);
  assert.match(draftSql,/char_length\(p_body\)>12000/);
});

test("per-user clear, mark-unread and hide never alter other participants",async()=>{
  const calls=[];
  const client={rpc:async(name,args={})=>{
    calls.push({name,args});
    if(name==="v44_chat_room_state")return {data:[{
      conversation_id:room,ttl_seconds:0,cleared_before:null,hidden_at:null,unread_reminder:false
    }],error:null};
    return {data:true,error:null};
  }};
  const service=createUltraRoomService(client);
  await service.load([room]);
  assert.equal(service.get(room).ttl,0);
  assert.equal(await service.unread(room,true),true);
  assert.equal(await service.clear(room),true);
  assert.equal(await service.hide(room,true),true);
  assert.equal(await service.expiry(room,86400),true);
  assert.equal(await service.leave(room),true);
  assert.equal(await service.transfer(room,member),true);
  const names=calls.map(x=>x.name);
  for(const name of ["v44_chat_mark_unread","v44_chat_clear_history","v44_chat_hide_room",
    "v44_chat_set_expiry","v44_chat_leave_group","v44_chat_transfer_group_owner"])
    assert.ok(names.includes(name),name);
  assert.equal(await service.expiry(room,1234),false);
  assert.equal(service.isHidden({id:room,lastMessage:{created_at:"2026-11-08T00:00:00Z"}}),false);
});

test("drafts only sync to JWT-scoped RPCs and never become chat messages",async()=>{
  const calls=[];
  const client={rpc:async(name,args={})=>{
    calls.push({name,args});
    if(name==="v45_chat_read_drafts")return {data:[{conversation_id:room,body:"Meu rascunho",
      updated_at:"2026-11-08T00:00:00Z"}],error:null};
    return {data:true,error:null};
  }};
  const service=createUltraDraftSync(client,{delay:30000});
  const rows=await service.load();
  assert.equal(rows.length,1);
  assert.equal(rows[0].body,"Meu rascunho");
  service.queue(room,"Uma mensagem que ainda não enviei");
  await service.flush();
  assert.equal(calls.at(-1).name,"v45_chat_save_draft");
  assert.equal(calls.at(-1).args.p_body,"Uma mensagem que ainda não enviei");
  assert.ok(!calls.some(c=>c.name==="insertChatMessage"));
  service.dispose();
});

test("ZIP has valid local and central signatures and authorized JSON metadata",async()=>{
  const blob=createStoreZip([{name:"historico.json",content:'{"count":1}'},{name:"media/foto.webp",content:new Uint8Array([1,2,3])}]);
  const buffer=await blob.arrayBuffer(), view=new DataView(buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);
  assert.equal(view.getUint32(buffer.byteLength-22,true),0x06054b50);
  assert.equal(view.getUint16(buffer.byteLength-12,true),2);
  assert.ok(new TextDecoder().decode(buffer).includes("historico.json"));
});
test("remote export pages through Neon; it never exports the rendered local array",async()=>{
  const data=[{id:member,sender_id:member,body:"Mensagem do servidor",created_at:"2026-11-08T00:00:00Z",
    updated_at:null,expires_at:null,reply_to:null,media:[]}];
  const queries=[];
  const client={from(table){
    assert.equal(table,"chat_messages");
    const q={select(){return q;},eq(){return q;},order(){return q;},gte(){return q;},
      range(start,end){queries.push([start,end]);q.start=start;q.end=end;return q;},
      then(ok,fail){return Promise.resolve({data:data.slice(q.start,q.end+1),error:null}).then(ok,fail);}};
    return q;
  }};
  let exported=null;
  const result=await exportUltraHistory({client,conversationId:room,format:"json",
    save:(blob,filename)=>{exported={blob,filename};}});
  assert.equal(result.count,1);
  assert.equal(queries.length,1);
  assert.match(exported.filename,/\.json$/);
  const text=await exported.blob.text(),parsed=JSON.parse(text);
  assert.equal(parsed.messages[0].body,"Mensagem do servidor");
  assert.equal(parsed.messages[0].expiresAt,null);
});

test("both mobile HTML routes parse and intercept simulated lifecycle actions",()=>{
  for(const path of ["chat.html","conversa.html"]){
    const html=read(path);
    const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length>=2);
    scripts.forEach((match,i)=>assert.doesNotThrow(()=>new Script(match[1],{filename:path+"#"+i})));
    assert.match(html,/data-ultra-room-choice/);
    assert.match(html,/data-ultra-transfer/);
    assert.match(html,/data-feature="export"/);
    assert.match(html,/hooks\?\.roomAction\?\./);
    assert.match(html,/applyRemoteDrafts/);
  }
  const adapter=read("assets/js/chat-ultra-live.js"),auth=read("src/neon-production-client.js");
  for(const rpc of ["v44_chat_room_state","v44_chat_set_expiry","v45_chat_read_drafts"])
    assert.ok(auth.includes(rpc),rpc);
  assert.match(adapter,/createUltraRoomService/);
  assert.match(adapter,/exportUltraHistory/);
  assert.match(adapter,/data-ultra-export-go/);
  assert.match(adapter,/createUltraDraftSync/);
});
