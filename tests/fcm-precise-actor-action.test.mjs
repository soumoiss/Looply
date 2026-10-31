import test from "node:test";
import assert from "node:assert/strict";
import {deliverNotifications} from "../backend/cloudflare/android-push-worker.mjs";

const id="3bd03d78-19d8-40c0-b58d-0c7c9c5d92e3";
const query=async (_env,sql,params)=>{
  if(sql.includes("v22_android_fcm_named_candidates"))return [{source:"gallery-comment",kind:"gallery_comment",
    actor_name:"Keiliane",event_id:id,resource_id:id,token_id:id,fcm_token:"test-token"}];
  if(sql.includes("INSERT INTO public.android_fcm_deliveries"))return [{event_id:id}];
  if(sql.includes("UPDATE public.android_fcm_deliveries"))return [{event_id:id}];
  throw Error("unexpected query");
};
test("FCM names the author and precise activity without leaking private content",async()=>{
  let sent;
  const result=await deliverNotifications({FCM_PROJECT_ID:"looplyv3"},{query,
    accessTokenProvider:async()=>"test-token",
    sendFetch:async(_url,opts)=>{sent=JSON.parse(opts.body).message;return {ok:true};}});
  assert.equal(result.sent,1);
  assert.equal(sent.data.title,"Keiliane");
  assert.equal(sent.data.body,"Comentou uma mídia da galeria");
  assert.equal(sent.notification,undefined);
});
