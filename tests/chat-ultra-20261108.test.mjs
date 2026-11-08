import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {Script} from "node:vm";
import {fileURLToPath} from "node:url";
import {normalizeUltraPreference,wallpaperPathFor,createUltraPreferenceService} from "../src/chat-ultra-preferences.js";
import {mergeChatHistory,oldestChatTimestamp,hasChatHistoryPage} from "../src/chat-ultra-history.js";
const file=path=>readFileSync(fileURLToPath(new URL("../"+path,import.meta.url)),"utf8");
const uid="f589ba94-2875-4faa-a9f4-fbafcc9ee28c";
const cid="85870473-558d-4146-b0a9-ef50e12cb913";
test("conversation-specific history is sorted deterministically and deduplicated",()=>{
 const a={id:"b",created_at:"2026-11-08T00:00:01.000Z"};
 const b={id:"a",created_at:"2026-11-08T00:00:01.000Z"};
 const c={id:"c",created_at:"2026-11-08T00:00:02.000Z"};
 assert.deepEqual(mergeChatHistory([a,b],[a,c]).map(x=>x.id),["a","b","c"]);
 assert.equal(oldestChatTimestamp([a,b,c]),a.created_at);
 assert.equal(hasChatHistoryPage(Array(100).fill(a)),true);
 assert.equal(hasChatHistoryPage([]),false);
});
test("wallpaper paths cannot cross authenticated accounts",()=>{
 const path=wallpaperPathFor(uid,cid,"c04ec0c2-f742-40f7-a4d8-ae380f847aa1");
 assert.equal(path,"chat-wallpapers/"+uid+"/"+cid+"/c04ec0c2-f742-40f7-a4d8-ae380f847aa1.webp");
 assert.throws(()=>wallpaperPathFor("not-a-uuid",cid,"b65a78ae-4289-47a7-8831-0fda01369462"));
});
test("preferences normalize colors and tint safely",()=>{
 const r=normalizeUltraPreference({id:cid,color:"#f0e1d2",wallpaper:"gallery",wallpaperPath:"safe",wallpaperTint:3,pin:1,fav:0});
 assert.equal(r.color,"#f0e1d2");
 assert.equal(r.wallpaperTint,.7);
 assert.equal(r.pin,true);
 assert.equal(r.fav,false);
 assert.equal(normalizeUltraPreference({id:cid,color:"expression(alert(1))",wallpaper:"url(javascript:alert(1))",wallpaperTint:NaN}).wallpaper,"");
});
test("preferences use authenticated Neon API and update only the user's own row",async()=>{
 const writes=[],rows=[{conversation_id:cid,wallpaper:"#ffffff",wallpaper_tint:.18,bubble_color:"#7010b0",is_pinned:true,is_muted:false,is_archived:false,is_favorite:true}];
 const client={from(table){
   assert.equal(table,"chat_ultra_preferences");
   return {select:()=>({eq:(col,val)=>{
      assert.equal(col,"user_id");assert.equal(val,uid);
      return {order:()=>({limit:async()=>({data:rows,error:null})})};
   }}),upsert(value,{onConflict}){
     writes.push(value);assert.equal(onConflict,"user_id,conversation_id");
     return {select:()=>({maybeSingle:async()=>({data:{conversation_id:value.conversation_id},error:null})})};
   }};
 },storage:{}};
 const s=createUltraPreferenceService(client,uid);
 const loaded=await s.load();
 assert.equal(loaded[cid].wallpaper,"#ffffff");
 assert.equal(loaded[cid].pin,1);
 assert.equal(await s.write({id:cid,wallpaper:"#ffffff",color:"#7010b0",pin:true,wallpaperTint:.25}),true);
 assert.equal(writes[0].user_id,uid);
 assert.equal(writes[0].conversation_id,cid);
 assert.equal(writes[0].wallpaper_tint,.25);
 s.dispose();
});
test("HTML remains the approved Ultra UI and embedded scripts parse after integration",()=>{
 for(const path of ["chat.html","conversa.html"]){
   const html=file(path);
   assert.match(html,/class="conv" id="conv"/);
   assert.match(html,/data-ultra-history-more/);
   assert.match(html,/prefSnapshots=new Map/);
   assert.match(html,/wallpaperPath:original\?\.wallpaperPath/);
   assert.match(html,/draftPreview:id=>drafts\[id\]/);
   assert.doesNotMatch(html,/testChip\.textContent\s*=\s*"MODELO LOCAL"/);
   for(const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g))
     new Script(match[1],{filename:path});
 }
});
test("storage backend explicitly limits wallpaper reads and writes to owner and registered path",()=>{
 const server=file("backend/neon-storage/index.mjs");
 const migration=file("migration/20261108_chat_ultra_preferences.sql");
 assert.match(server,/object\.type==="wallpaper"\)return object\.owner===profileId/);
 assert.match(server,/chat_ultra_preferences/);
 assert.match(server,/wallpaper_path:"eq\."\+path/);
 assert.match(server,/mime==="image\/webp" && size<=3\*1024\*1024/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/user_id = public\.looply_legacy_uid\(\)/);
 assert.match(migration,/public\.v3_is_conversation_participant\(conversation_id\)/);
 assert.match(file("src/neon-rest-bridge.js"),/chat_ultra_preferences: \["user_id","conversation_id","wallpaper"/);
});
test("all new production scripts pass Node's syntax parser",()=>{
 for(const path of ["src/chat-ultra-preferences.js","src/chat-ultra-history.js","assets/js/chat-ultra-live.js","backend/neon-storage/index.mjs"]){
   const result=spawnSync(process.execPath,["--check",fileURLToPath(new URL("../"+path,import.meta.url))],{encoding:"utf8"});
   assert.equal(result.status,0,path+"\n"+result.stderr);
 }
});
