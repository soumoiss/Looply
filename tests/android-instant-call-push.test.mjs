import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dispatchImmediateCall,deliverNotifications} from "../backend/cloudflare/android-push-worker.mjs";
import {requestImmediateCallPush} from "../src/call-push-alert.js";
const id="77777777-7777-4777-8777-777777777777";
const request=(token,origin="https://soumoiss.github.io")=>new Request(
 "https://looply-android-push.s0upoetamoiss.workers.dev/call-ring",{
 method:"POST",headers:{"content-type":"application/json",origin,authorization:token},
 body:JSON.stringify({conversationId:id})});
const valid="Bearer eyJ"+("a".repeat(60))+".eyJ"+("a".repeat(60))+"."+("c".repeat(64));
test("unauthenticated and cross-site requests cannot cause a phone to ring",async()=>{
 let called=0;
 for(const r of [request(""),request(valid,"https://evil.example")]){
   const response=await dispatchImmediateCall({},{
     request:r,authFetch:async()=>{called++;throw Error("should not be reached");},
     deliver:async()=>{called++;return {sent:1,failed:0};}
   });
   assert.ok([401,403].includes(response.status));
 }
 assert.equal(called,0);
});
test("only an authenticated Neon RPC-confirmed, recent offer triggers immediate high-priority push",async()=>{
 const response=await dispatchImmediateCall({},{
   request:request(valid),authFetch:async(url,opts)=>{
     assert.match(url,/\/rpc\/v22_fcm_authorize_call_ring$/);
     assert.equal(opts.headers.authorization,valid);
     assert.equal(JSON.parse(opts.body).p_conversation_id,id);
     return {ok:true,json:async()=>456};
   },
   deliver:async(_env,args)=>{
     assert.match(args.pendingQuerySql,/events\.source='incoming-call'/);
     assert.match(args.pendingQuerySql,/event_id=md5\('cs:'/);
     assert.deepEqual(args.pendingQueryParams,[id,"456"]);
     return {sent:2,failed:0};
   }
 });
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{accepted:2,failed:0});
});
test("validated identity without a currently ringing offer may not wake Android",async()=>{
 let delivered=false;
 const response=await dispatchImmediateCall({},{
   request:request(valid),authFetch:async()=>({ok:true,json:async()=>null}),
   deliver:async()=>{delivered=true;return {sent:1};}
 });
 assert.equal(response.status,409);
 assert.equal(delivered,false);
});
test("web caller posts only conversation ID after Neon offer, without name or private SDP",async()=>{
 let invoked;
 const client={auth:{getSession:async()=>({data:{session:{access_token:"user-jwt"}},error:null})}};
 assert.equal(await requestImmediateCallPush(client,id,{fetcher:async(url,opts)=>{
   invoked={url,opts};return {ok:true};
 }}),true);
 assert.deepEqual(JSON.parse(invoked.opts.body),{conversationId:id});
 assert.equal(invoked.opts.headers.authorization,"Bearer user-jwt");
});
test("native Android provides CallStyle answer/decline, fullscreen permission and real WebRTC handoff",async()=>{
 const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
 const [k,manifest,native,chat]=await Promise.all([
   read("android/app/src/main/java/com/soumoiss/looply/LooplyMessagingService.kt"),
   read("android/app/src/main/AndroidManifest.xml"),
   read("android/app/src/main/java/com/soumoiss/looply/IncomingCallActivity.kt"),
   read("src/chat-calls.js")
 ]);
 assert.match(k,/NotificationCompat\.CallStyle\.forIncomingCall/);
 assert.match(k,/setFullScreenIntent\(fullScreen,true\)/);
 assert.match(k,/looply_calls_v2/);
 assert.match(manifest,/android\.permission\.USE_FULL_SCREEN_INTENT/);
 assert.match(native,/Chamada de vídeo/);
 assert.match(chat,/rpc\/v23_fcm_pending_incoming_offer/);
 assert.match(chat,/await acceptCall\(\)/);
 assert.match(chat,/p_payload:\{type:"decline",conversationId\}/);
});
test("database only exposes names of recipients that qualify and verifies sender membership",async()=>{
 const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
 const migration=await read("migration/20261031_fcm_named_fast_call.sql");
 assert.match(migration,/FROM public\.v20_android_fcm_activity_candidates\(\)/);
 assert.match(migration,/public\.v3_is_conversation_member/);
 assert.match(migration,/e\.sender_id=public\.looply_legacy_uid\(\)/);
 assert.match(migration,/auth\.uid\(\) IS NOT NULL/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.v22_android_fcm_named_candidates\(\) FROM PUBLIC,anonymous,authenticated/);
 const worker=await read("backend/cloudflare/android-push-worker.mjs");
 assert.match(worker,/data\.callerName=actor/);
 assert.match(worker,/data\.callMode=callMode/);
});
