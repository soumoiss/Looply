import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {emailOf} from "../src/neon-login-identity.js";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("all newly created usernames resolve to their private technical Neon alias",()=>{
  assert.equal(emailOf("kelry"),"kelry@loooply.app");
  assert.equal(emailOf("@nova_conta_2026"),"nova_conta_2026@loooply.app");
  assert.equal(emailOf("  PEIXINHO "),"peixinho@loooply.app");
  assert.equal(emailOf("eukeiliane"),"keilageo@loooply.app");
  assert.equal(emailOf("someone@example.com"),"someone@example.com");
  for(const bad of ["","a","../../secret","user name","nome@","nome@evil","a".repeat(50)])
    assert.equal(emailOf(bad),null);
});
test("admin creation uses a canonical alias, never an unlinked contact email",async()=>{
  const [admin,bridge,login]=await Promise.all([read("src/admin.js"),read("src/neon-production-client.js"),read("src/neon-production-login.js")]);
  assert.doesNotMatch(admin,/name="email"/);
  assert.match(admin,/const email = `\$\{username\}@loooply\.app`/);
  assert.match(bridge,/const email=.*username\+"@loooply\.app"/);
  assert.match(bridge,/adminApi\.createUser/);
  assert.match(login,/emailOf\(input\.get\("username"\)\)/);
});
test("admin Sticker.zip is shared without exposing future private uploads",async()=>{
  const sql=await read("migration/20261030_shared_admin_sticker_pack.sql");
  assert.match(sql,/ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false/);
  assert.match(sql,/source_name='Sticker\.zip'/);
  assert.match(sql,/username='peixinho'/);
  assert.match(sql,/is_shared\s+OR owner_id IS NULL/);
  assert.match(sql,/NOT is_shared/);
  const storage=await read("backend/neon-storage/index.mjs");
  assert.match(storage,/object\.type==="sticker"\?\{storage_path:"eq\."\+path\}/);
});
test("new chat messages create one queued notification per recipient, not the sender",async()=>{
  const sql=await read("migration/20261030_chat_message_notification_trigger.sql");
  assert.match(sql,/AFTER INSERT ON public\.chat_messages/);
  assert.match(sql,/cp\.user_id<>NEW\.sender_id/);
  assert.match(sql,/ON CONFLICT \(user_id,message_id\) DO NOTHING/);
  assert.doesNotMatch(sql,/UPDATE public\.chat_messages|DELETE FROM public\.chat_messages/);
});
test("calling requests capture in user gesture before any remote signaling",async()=>{
  const src=await read("src/chat-calls.js");
  const start=src.indexOf('const startCall = async (mode) =>');
  const end=src.indexOf('const acceptCall = async () =>',start);
  const block=src.slice(start,end);
  assert.ok(block.indexOf("navigator.mediaDevices.getUserMedia")<block.indexOf("await ensureChannel()"));
  assert.match(block,/if \(!liveChannel\) throw new Error\("signaling unavailable"\)/);
  assert.match(block,/await endCall\(false, detail\)/);
});
test("Android FCM route and token persist after background rotation",async()=>{
  const main=await read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  const service=await read("android/app/src/main/java/com/soumoiss/looply/LooplyMessagingService.kt");
  const bridge=await read("src/neon-production-client.js");
  const worker=await read("backend/cloudflare/android-push-worker.mjs");
  assert.match(service,/override fun onNewToken/);
  assert.match(service,/putString\("last_fcm_token", token\)/);
  assert.match(main,/preferences\.getString\("last_fcm_token"/);
  assert.match(main,/Regex\("""\(\?:conversa\\\.html\\\?id=\$id/);
  assert.match(bridge,/if\(!session\?\.access_token \|\| !session\.user\?\.id\)\{retry=true;return;\}/);
  assert.match(bridge,/key=deviceId\+":"\+token\+":"\+session\.user\.id/);
  assert.match(worker,/\["call","message","voice"\]/);
});
