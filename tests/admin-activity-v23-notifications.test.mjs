import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {startAdminPresenceTracking,clearAdminPresenceSession} from "../src/admin-presence.js";
import {deliverNotifications} from "../backend/cloudflare/android-push-worker.mjs";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test("A real browser session registers only once, regardless of focus or elapsed time",async()=>{
  const listeners=new Map(),values=new Map(),calls=[];
  const doc={visibilityState:"visible",addEventListener:(event,fn)=>listeners.set(event,fn),
    removeEventListener:(event,fn)=>{if(listeners.get(event)===fn)listeners.delete(event);}};
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),
    removeItem:key=>values.delete(key)};
  const createSessionId=()=>"550e8400-e29b-41d4-a716-446655440000";
  const client={rpc:async(name,args)=>{
    calls.push({name,args});return {data:true,error:null};
  }};
  const start=()=>startAdminPresenceTracking(client,"valid-user-id",
    {documentRef:doc,storage,createSessionId});
  const stop=start();
  await flush();
  assert.deepEqual(calls,[{name:"v28_register_app_open",
    args:{p_session_id:"550e8400-e29b-41d4-a716-446655440000"}}]);
  stop();
  // Switching to a different page or reopening a menu is not a new session.
  const stopSecondPage=start();
  await flush();
  assert.equal(calls.length,1);
  doc.visibilityState="hidden";
  await flush();
  doc.visibilityState="visible";
  listeners.get("visibilitychange")?.();
  await flush();
  assert.equal(calls.length,1);
  stopSecondPage();
  // Actual sign-out clears that session; next authenticated visit is new.
  clearAdminPresenceSession("valid-user-id",{storage});
  const stopNewLogin=start();
  await flush();
  assert.equal(calls.length,2);
  stopNewLogin();
});

test("Server deduplicates app-open events by session UUID and disables obsolete heartbeat RPC",async()=>{
  const sql=await read("migration/20261031_v28_unique_admin_app_sessions.sql");
  assert.match(sql,/UNIQUE INDEX IF NOT EXISTS looply_v28_admin_online_session_once/);
  assert.match(sql,/actor_id,resource_id/);
  assert.match(sql,/v28_register_app_open\(p_session_id uuid\)/);
  assert.match(sql,/ON CONFLICT DO NOTHING/);
  assert.match(sql,/v23_register_app_open\(\)/);
  assert.match(sql,/SELECT \(public\.looply_legacy_uid\(\) IS NOT NULL\)/);
});
test("Admin-only notices are grounded by authenticated SQL and recipient RLS",async()=>{
  const sql=await read("migration/20261031_v23_peixinho_admin_alerts_and_announcement_ack.sql");
  for(const type of ["admin_online","admin_letter_read","admin_private_unlock"])
    assert.ok(sql.includes(type),type);
  for(const trigger of ["looply_v23_archived_card_read_notice",
      "looply_v23_community_letter_read_notice","looply_v23_community_private_unlock_notice"])
    assert.ok(sql.includes(trigger),trigger);
  assert.match(sql,/lower\(p\.username\)='peixinho'/);
  assert.match(sql,/public\.v3_self_is_admin\(\)/);
  assert.match(sql,/admin_id=public\.looply_legacy_uid\(\)/);
  assert.match(sql,/AFTER INSERT\s+ON public\.archived_card_reads/);
  assert.match(sql,/AFTER INSERT ON public\.looply_community_letter_reads/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.v23_mark_global_announcement_read\(uuid\) TO authenticated/);
  assert.match(sql,/ON CONFLICT DO NOTHING/);
  assert.match(sql,/public\.v23_record_peixinho_event\(/);
  assert.match(sql,/FROM public\.looply_admin_activity_notifications n/);
  assert.doesNotMatch(sql,/DELETE FROM public\.community_letters|TRUNCATE/i);
});
test("Real letter view, private unlock and app runtime register only authenticated events",async()=>{
  const [letters,community,client,bridge,runtime,ann,notif]=await Promise.all([
    read("assets/js/letters.js"),read("src/letters-community.js"),
    read("src/neon-production-client.js"),read("src/neon-rest-bridge.js"),
    read("src/page-runtime.js"),read("src/global-announcements.js"),
    read("assets/js/notifications.js")
  ]);
  for(const code of [letters,community]){
    assert.match(code,/v23_mark_community_letter_read/);
    assert.match(code,/looply_register_recipient_unlock/);
  }
  assert.match(client,/v23_register_app_open/);
  assert.match(client,/v23_mark_global_announcement_read/);
  assert.match(client,/looply_register_recipient_unlock/);
  assert.match(bridge,/looply_admin_activity_notifications: \["read_at"\]/);
  assert.match(runtime,/startAdminPresenceTracking\(supabase, user\.id\)/);
  assert.match(runtime,/stopAdminPresence\(\)/);
  assert.match(ann,/client\.rpc\("v23_mark_global_announcement_read"/);
  assert.match(notif,/admin_private_unlock/);
  assert.match(notif,/America\/Fortaleza/);
});
test("Admin presence FCM uses verified person and timestamp only",async()=>{
  const id="32e31d8e-20cd-4273-8f35-91f1cce7bd99",sent=[];
  const sql=await read("backend/cloudflare/android-push-worker.mjs");
  assert.match(sql,/admin_event/);
  const row={source:"admin_event",event_id:id,resource_id:null,
    token_id:id,kind:"admin_online",actor_name:"MiSol",call_mode:null,
    created_at:"2026-10-31T03:00:00Z",fcm_token:"test-token"};
  const query=async (_env,queryString)=>{
    if(queryString.includes("FROM public.v22_android_fcm_named_candidates"))return [row];
    if(queryString.includes("INSERT INTO public.android_fcm_deliveries"))return [{event_id:id}];
    if(queryString.includes("UPDATE public.android_fcm_deliveries"))return [{event_id:id}];
    throw Error("query_not_expected");
  };
  const result=await deliverNotifications({FCM_PROJECT_ID:"looplyv3"},{
    query,accessTokenProvider:async()=>"synthetic-test-token",
    sendFetch:async(_url,init)=>{sent.push(JSON.parse(init.body).message);return {ok:true};}
  });
  assert.equal(result.sent,1);
  assert.equal(sent[0].data.title,"MiSol");
  assert.match(sent[0].data.body,/Entrou no aplicativo/);
  assert.match(sent[0].data.body,/31\/10\/2026/);
  assert.equal(sent[0].data.occurredAt,"2026-10-31T03:00:00.000Z");
  assert.equal(sent[0].notification,undefined);
});
