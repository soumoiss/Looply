import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("approved Ultra UI has no local-demo badge on either production entrypoint",async()=>{
  for(const page of ["chat.html","conversa.html"]){
    const html=await read(page);
    assert.match(html,/id="conv"/);
    assert.match(html,/chat-ultra-live-fixes\.css/);
    assert.doesNotMatch(html,/testChip\.textContent\s*=\s*"MODELO LOCAL"/);
    assert.match(html,/looply-chat-visual-v4:/);
    assert.match(html,/wallpaper:existing\?\.wallpaper\?\?pref\.wallpaper/);
    assert.match(html,/onlineNow\.has\(person\.id\)/);
    assert.match(html,/chat-live-dot/);
    assert.doesNotMatch(html,/Entregue \(simulado\)|Lida \(simulado\)/);
  }
});
test("real online presence uses secure server-authenticated heartbeats",async()=>{
  const [sql,auth,runtime,helper,live]=await Promise.all([
    read("migration/20261107_chat_ultra_presence.sql"),
    read("src/neon-production-client.js"),read("src/page-runtime.js"),
    read("src/chat-presence.js"),read("assets/js/chat-ultra-live.js")
  ]);
  assert.match(sql,/actor\s*:=\s*public\.looply_legacy_uid\(\)/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.chat_presence_sessions FROM authenticated/);
  assert.match(sql,/JOIN public\.conversation_participants other/);
  assert.match(sql,/last_seen_at>pg_catalog\.now\(\)-interval '85 seconds'/);
  assert.match(auth,/v37_chat_presence_heartbeat/);
  assert.match(auth,/v37_chat_presence_visible/);
  assert.match(runtime,/startChatPresenceHeartbeat\(supabase\)/);
  assert.match(runtime,/stopChatPresence\(\)/);
  assert.match(helper,/visibilityState==="hidden"/);
  assert.match(live,/client\.rpc\("v37_chat_presence_visible"/);
});
test("original ZIP stickers are published and all 535 Neon catalog items remain reachable",async()=>{
  const [builder,model,live,picker,css]=await Promise.all([
    read("scripts/build.mjs"),read("chat.html"),read("assets/js/chat-ultra-live.js"),
    read("assets/js/chat-ultra-stickers.js"),read("assets/css/pages/chat-ultra-live-fixes.css")
  ]);
  assert.match(builder,/path\.join\(projectRoot,"Stickers"\)/);
  assert.match(model,/class="sticker-actual"/);
  assert.match(live,/from\("chat_sticker_messages"\)/);
  assert.match(live,/signedMedia\("looply-stickers",row\.storage_path\)/);
  assert.match(picker,/bindStickerCatalog\(nativeHost,client,getUserId\)/);
  assert.match(picker,/games\.style\.display="none"/);
  assert.match(picker,/button\.id="bStickers"/);
  assert.match(picker,/data-chat-sticker-import-rights/);
  assert.match(css,/#pan:not\(\.open\)\{display:none!important\}/);
});
test("all new browser modules have valid JavaScript syntax",async()=>{
  for(const path of ["assets/js/chat-ultra-live.js","assets/js/chat-ultra-stickers.js","src/chat-presence.js","src/page-runtime.js","src/neon-production-client.js"]){
    const result=spawnSync(process.execPath,["--check",new URL("../"+path,import.meta.url).pathname],{encoding:"utf8"});
    assert.equal(result.status,0,path+": "+result.stderr);
  }
});
