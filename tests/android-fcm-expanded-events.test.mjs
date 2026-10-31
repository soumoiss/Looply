import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {deliverNotifications} from "../backend/cloudflare/android-push-worker.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const sample=(kind,source)=>({
  source,kind,
  event_id:"7b90d719-a460-47d8-94d6-88b884682230",
  token_id:"6375def5-23d0-4c4b-a844-f7da38c927a9",
  fcm_token:"unit-test-device-token-only",
  resource_id:"1c46ffb7-6cd9-46ef-9615-df529682483a",
  conversation_id:source==="incoming-call"?"d584c7df-237b-405f-98cc-c3f27a326b20":null
});
const run=async row=>{
  const messages=[];
  const query=async (_env,sql)=>{
    if(sql.includes("FROM public.v22_android_fcm_named_candidates()"))return [row];
    if(sql.includes("INSERT INTO public.android_fcm_deliveries"))return [{event_id:row.event_id}];
    if(sql.includes("UPDATE public.android_fcm_deliveries"))return [{event_id:row.event_id}];
    throw Error("unexpected SQL");
  };
  const result=await deliverNotifications({FCM_PROJECT_ID:"looplyv3"},{
    query,accessTokenProvider:async()=>"test-token",
    sendFetch:async(_url,opts)=>{messages.push(JSON.parse(opts.body).message);return {ok:true};}
  });
  return {result,message:messages[0]};
};
test("all supported event types are queued through least-privilege candidate function",async()=>{
  const worker=await read("backend/cloudflare/android-push-worker.mjs");
  const migration=await read("migration/20261031_fcm_comprehensive_activity_candidates.sql");
  assert.match(worker,/public\.v22_android_fcm_named_candidates\(\)/);
  for(const source of ["feed","feed-comment","gallery","gallery-comment",
    "post-mention","story-mention","gallery-mention","gallery-tag",
    "post-like","story-like","gallery-like","community-letter","music-dedication","incoming-call"]){
    assert.ok(migration.includes("'"+source+"'"),source);
  }
  assert.match(migration,/SECURITY DEFINER SET search_path=''/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.v20_android_fcm_activity_candidates\(\) FROM PUBLIC,anonymous,authenticated/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.v20_android_fcm_activity_candidates\(\)/);
  assert.match(migration,/m\.publication_state='published' AND m\.private_owner_id IS NULL/);
  assert.match(migration,/c\.payload->>'type'='offer'/);
  assert.doesNotMatch(migration,/\b(?:DELETE|TRUNCATE)\b/i);
});
test("background call carries validated conversation and high priority FCM data",async()=>{
  const {result,message}=await run(sample("call","incoming-call"));
  assert.equal(result.sent,1);
  assert.equal(message.data.kind,"call");
  assert.equal(message.data.conversationId,"d584c7df-237b-405f-98cc-c3f27a326b20");
  assert.equal(message.android.priority,"HIGH");
  assert.equal(message.android.ttl,"30s");
  assert.equal(message.notification,undefined);
});
test("feed and gallery interactions generate generic private-by-default notification metadata",async()=>{
  for(const [kind,source,expected] of [
    ["post","feed","post"],["comment","feed-comment","comment"],
    ["gallery","gallery","gallery"],["gallery_comment","gallery-comment","gallery"],
    ["gallery_mention","gallery-mention","gallery"],["story_mention","story-mention","mention"],
    ["mention","post-mention","post"],["letter","community-letter","letter"],
    ["dedication","music-dedication","dedication"]]){
    const {message}=await run(sample(kind,source));
    assert.equal(message.data.kind,expected,source);
    assert.ok(message.data.body.length>5);
    assert.equal(message.data.body.includes("private_key"),false);
    assert.equal(message.notification,undefined);
  }
});
