import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {makePremiumPoll,parsePremiumChatBody} from "../src/chat-premium-cards.js";
const file=async path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("eight-option poll is one authenticated vote per participant, not mock emoji",async()=>{
  const payload=makePremiumPoll({question:"Qual a sua escolha?",options:["1","2","3","4","5","6","7","8"]});
  assert.equal(parsePremiumChatBody(payload).options.length,8);
  assert.throws(()=>makePremiumPoll({question:"Escolha?",options:Array.from({length:9},(_,i)=>String(i))}),/2 a 8/);
  const [client,live,migration]=await Promise.all([
    file("src/neon-production-client.js"),file("assets/js/chat-ultra-live.js"),
    file("migration/20261107_chat_ultra_poll_v38.sql")
  ]);
  assert.match(client,/v38_chat_poll_votes/);
  assert.match(live,/v38_vote_chat_poll/);
  assert.match(live,/storedPollVotes/);
  assert.match(migration,/PRIMARY KEY\(message_id,user_id\)/);
  assert.match(migration,/looply_legacy_uid\(\)/);
  assert.match(migration,/SELECT 1 FROM public\.conversation_participants/);
  assert.match(migration,/WHEN '👍' THEN 5/);
});

test("calls and both Games open existing authorized controllers, never model bot",async()=>{
  const [live,html,overlay,ttt,gartic,calls]=await Promise.all([
    file("assets/js/chat-ultra-live.js"),file("chat.html"),file("assets/js/chat-ultra-native-overlays.js"),
    file("src/chat-ttt.js"),file("src/chat-gartic.js"),file("src/chat-calls.js")
  ]);
  assert.match(live,/startRealCall/);
  assert.match(live,/\[data-call-video\]/);
  assert.match(live,/\[data-v2-game\]/);
  assert.match(overlay,/MutationObserver/);
  assert.match(html,/window\.LooplyVisual\?\.nativeGames/);
  assert.match(html,/window\.LooplyVisual\?\.nativeCall/);
  assert.match(ttt,/v25_ttt_/);
  assert.match(gartic,/v26_gartic_action/);
  assert.match(calls,/RTCPeerConnection/);
});

test("schedule is immutable, permission scoped, idempotent and dispatched by deployed cron source",async()=>{
  const [sql,worker,cli,ui,live,html]=await Promise.all([
    file("migration/20261107_chat_ultra_scheduled_messages_v39.sql"),
    file("backend/cloudflare/android-push-worker.mjs"),
    file("src/neon-production-client.js"),
    file("assets/js/chat-ultra-scheduled.js"),
    file("assets/js/chat-ultra-live.js"),file("chat.html")
  ]);
  assert.match(sql,/PRIMARY KEY/);
  assert.match(sql,/id=r\.id/);
  assert.match(sql,/FOR UPDATE SKIP LOCKED/);
  assert.match(sql,/ON CONFLICT \(id\) DO NOTHING/);
  assert.match(sql,/membership_revoked/);
  assert.match(sql,/looply_legacy_uid\(\)/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.v39_dispatch_scheduled_chat\(integer\) TO looply_push_relay_limited/);
  assert.match(worker,/export async function dispatchScheduledChat/);
  assert.match(worker,/await dispatchScheduledChat\(env\)/);
  assert.match(cli,/v39_schedule_chat_message/);
  assert.match(ui,/datetime-local/);
  assert.match(ui,/v39_cancel_chat_schedule/);
  assert.match(live,/setupUltraChatSchedules/);
  assert.match(html,/schedule=function serverOnlyChatSchedule/);
});

test("R2 signed voice and media is playable in Ultra without sending raw blob URIs",async()=>{
  const [media,live,html,css]=await Promise.all([
    file("assets/js/chat-ultra-media.js"),
    file("assets/js/chat-ultra-live.js"),
    file("chat.html"),
    file("assets/css/pages/chat-ultra-live-fixes.css")
  ]);
  assert.match(media,/protocol==="https:"/);
  assert.match(media,/video\.playsInline=true/);
  assert.match(media,/data-ultra-voice-seek/);
  assert.match(live,/signedMediaCache/);
  assert.match(live,/looply-chat/);
  assert.match(html,/mediaRenderer\(render\)/);
  assert.match(css,/chat-ultra-real-video/);
});

test("all newly introduced JavaScript is syntactically valid",async()=>{
  for(const path of ["assets/js/chat-ultra-live.js","assets/js/chat-ultra-native-overlays.js",
    "assets/js/chat-ultra-media.js","assets/js/chat-ultra-scheduled.js","src/chat-premium-cards.js",
    "src/neon-production-client.js","src/chat-premium.js","backend/cloudflare/android-push-worker.mjs"]){
    const checked=spawnSync(process.execPath,["--check",new URL("../"+path,import.meta.url).pathname],{encoding:"utf8"});
    assert.equal(checked.status,0,path+" "+checked.stderr);
  }
});
