import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { emailOf } from "../src/neon-login-identity.js";
import { deliverNotifications } from "../backend/cloudflare/android-push-worker.mjs";
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

const sample = Object.freeze({
  source: "chat", event_id: "c11de18c-89c9-40d1-9d45-123456789abc",
  token_id: "c319403f-89c9-40d1-9d45-123456789abc",
  kind: "voice", conversation_id: "beab9cab-89c9-40d1-9d45-123456789abc",
  resource_id: "aba2108f-89c9-40d1-9d45-123456789abc",
  fcm_token: "test-device-token-fake-not-a-live-token"
});
function harness(rows, accepted=true, claimed=true) {
  const queries=[],sent=[];
  const query=async (_env,sql,params)=>{
    queries.push({sql,params});
    if(sql.includes("FROM public.v22_android_fcm_named_candidates()")) return rows;
    if(sql.includes("INSERT INTO public.android_fcm_deliveries")) return claimed?[{event_id:rows[0].event_id}]:[];
    if(sql.includes("UPDATE public.android_fcm_deliveries")) return [{event_id:rows[0].event_id}];
    throw Error("unexpected query");
  };
  const sendFetch=async(url,opts)=>{sent.push({url,opts});return {ok:accepted,status:accepted?200:503};};
  return {queries,sent,query,sendFetch,accessTokenProvider:async()=> "test-access-token"};
}

test("FCM worker issues data-only notification after database claim, never a fake success",async()=>{
  const h=harness([sample]);const env={FCM_PROJECT_ID:"looplyv3"};
  const result=await deliverNotifications(env,h);
  assert.deepEqual(result,{eligible:1,sent:1,failed:0});
  assert.equal(h.sent.length,1);
  assert.ok(h.queries[0].sql.includes("v22_android_fcm_named_candidates"));
  assert.equal(h.queries[1].params[1],sample.event_id);
  assert.equal(h.queries.at(-1).params[3],"sent");
  const {url,opts}=h.sent[0];
  assert.equal(url,"https://fcm.googleapis.com/v1/projects/looplyv3/messages:send");
  assert.equal(opts.headers.authorization,"Bearer test-access-token");
  const body=JSON.parse(opts.body);
  assert.equal(body.message.token,sample.fcm_token);
  assert.equal(body.message.data.kind,"voice");
  assert.equal(body.message.data.conversationId,sample.conversation_id);
  assert.equal(body.message.data.body,"Enviou uma mensagem de voz");
  assert.equal(body.message.android.priority,"HIGH");
  assert.equal(body.message.notification,undefined);
});
test("Duplicate delivery claim skips Firebase even when pending row was scanned",async()=>{
  const h=harness([sample],true,false);
  assert.deepEqual(await deliverNotifications({FCM_PROJECT_ID:"looplyv3"},h),{eligible:1,sent:0,failed:0});
  assert.equal(h.sent.length,0);
});
test("Firebase failure is recorded as failed instead of sent",async()=>{
  const h=harness([sample],false);
  const warn=console.warn;console.warn=()=>{};
  try{assert.deepEqual(await deliverNotifications({FCM_PROJECT_ID:"looplyv3"},h),{eligible:1,sent:0,failed:1});}
  finally{console.warn=warn;}
  assert.equal(h.queries.at(-1).params[3],"failed");
});
test("No queued events means no OAuth or FCM HTTP request",async()=>{
  let oauth=0;
  const h=harness([]);h.accessTokenProvider=async()=>{oauth++;throw Error("never");};
  assert.deepEqual(await deliverNotifications({FCM_PROJECT_ID:"looplyv3"},h),{eligible:0,sent:0,failed:0});
  assert.equal(oauth,0);assert.equal(h.sent.length,0);
});
test("Dispatch reads chat audio media before classifying a voice notification",async()=>{
  const worker=await read("backend/cloudflare/android-push-worker.mjs");
  const named=await read("migration/20261031_fcm_named_fast_call.sql");
  assert.match(named,/public\.chat_media cm/);
  assert.match(named,/cm\.mime_type LIKE 'audio\/%'/);
  assert.match(worker,/NOT EXISTS \(/);
  assert.match(worker,/d\.status IN \('sent','pending'\)/);
});
test("Android token registration tracks the auth user and unregisters during logout",async()=>{
  const client=await read("src/neon-production-client.js");
  assert.match(client,/key=deviceId\+":"\+token\+":"\+session\.user\.id/);
  assert.match(client,/v16_register_android_fcm_token/);
  assert.match(client,/v16_unregister_android_fcm_token/);
  assert.match(client,/signOut: async \(\) => \{/);
  assert.match(client,/await unregisterAndroidFcmDevice\(\)/);
});
test("Existing technical auth alias preserves original user's account",()=>{
  assert.equal(emailOf("@angel0v"),"angeloeng@loooply.app");
  assert.equal(emailOf("@peixinho"),"peixinho@loooply.app");
  assert.equal(emailOf("@new_member_2026"),"new_member_2026@loooply.app");
});
test("Admin prechecks existing username BEFORE creating Neon Auth identity",async()=>{
  const source=await read("src/neon-production-client.js");
  const func=source.slice(source.indexOf("async function adminCreateUser("),source.indexOf("async function adminFunctionInvoke("));
  assert.ok(func.indexOf("admin_username_preflight_unavailable") < func.indexOf("adminApi.createUser"));
  assert.match(func,/username_already_exists/);
  assert.match(func,/v12_admin_finish_signup/);
  assert.doesNotMatch(func,/neon\.auth\.signUp/);
});
test("Sticker policy binds each message to its real conversation and sender",async()=>{
  const sql=await read("migration/20261030_stage3_sticker_reference_integrity.sql");
  assert.match(sql,/m\.conversation_id = chat_sticker_messages\.conversation_id/);
  assert.match(sql,/m\.sender_id = chat_sticker_messages\.sender_id/);
  assert.match(sql,/s\.is_shared/);
  assert.match(sql,/s\.owner_id = public\.looply_legacy_uid\(\)/);
  assert.doesNotMatch(sql,/m\.conversation_id\s*=\s*m\.conversation_id/);
  assert.doesNotMatch(sql,/m\.sender_id\s*=\s*m\.sender_id/);
  assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE)\s+FROM\s+public\.sticker_catalog\b/i);
});
