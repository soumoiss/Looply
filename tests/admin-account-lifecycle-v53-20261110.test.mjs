import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const sql=read("migration/20261110_v53_admin_account_lifecycle.sql");
const bridge=read("src/neon-production-client.js");
const ui=read("src/admin-model-live.js");
const gate=read("src/maintenance-gate.js");
const extended=read("src/admin-model-extensions.js");

test("v53 only permits Peixinho's verified administrator session",()=>{
  assert.match(sql,/auth\.uid\(\) IS NULL OR NOT public\.v3_self_is_admin\(\)/);
  assert.match(sql,/WHERE id=actor AND username='peixinho'/);
  assert.match(sql,/IF target_id=actor THEN/);
  assert.match(sql,/IF target_role='admin' OR target_username='peixinho' THEN/);
  assert.match(sql,/RAISE EXCEPTION 'cannot_change_administrator'/);
  assert.match(sql,/FOR UPDATE OF p,u/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.v53_admin_account_action/);
  assert.match(sql,/TO authenticated/);
});

test("suspension atomically bans, revokes sessions and push, and denies RLS",()=>{
  assert.match(sql,/UPDATE neon_auth\."user" SET banned=true/);
  assert.match(sql,/DELETE FROM neon_auth\.session WHERE "userId"=neon_user_id/);
  assert.match(sql,/DELETE FROM public\.android_fcm_tokens WHERE user_id=target_id/);
  assert.match(sql,/DELETE FROM public\.chat_presence_sessions WHERE user_id=target_id/);
  assert.match(sql,/JOIN neon_auth\."user" u ON u\.id=l\.neon_user_id/);
  assert.match(sql,/AND coalesce\(u\.banned,false\)=false/);
  assert.match(sql,/looply_user_suspended/);
  assert.match(sql,/v48_block_new_auth_session/);
  assert.match(sql,/UPDATE neon_auth\."user" SET banned=false/);
});

test("permanent account deletion has explicit confirmation and anonymizes shared history",()=>{
  assert.match(sql,/IF p_action='user_delete_permanently'/);
  assert.match(sql,/p_payload->>'confirmUsername' IS DISTINCT FROM target_username/);
  assert.match(sql,/p_payload->>'confirmDelete'/);
  assert.match(sql,/p_payload->>'preserveSharedContent'/);
  assert.match(sql,/username=tombstone,display_name='Conta excluída'/);
  assert.match(sql,/DELETE FROM looply_migration\.verified_identity_links/);
  assert.match(sql,/DELETE FROM neon_auth\."user" WHERE id=neon_user_id/);
  assert.doesNotMatch(sql,/DELETE FROM public\.(?:letters|community_letters|chat_messages|posts|stories|conversations)\b/i);
  assert.match(sql,/profileAnonymized',true/);
  assert.match(sql,/account_deletion_not_confirmed/);
});
test("frontend routes management actions to safe RPC and verifies server responses",()=>{
  assert.match(bridge,/v53_admin_account_action/);
  for(const action of ["user_set_suspended","user_restore_access","user_delete_preview","user_delete_permanently"])
    assert.ok(bridge.includes('"'+action+'"'),action);
  assert.match(ui,/confirmUsername:input\.value\.trim\(\)/);
  assert.match(ui,/preserveSharedContent:true/);
  assert.match(ui,/result\?\.deleted!==true\|\|result\?\.authDeleted!==true/);
  assert.match(ui,/check\?\.suspended!==nextSuspended/);
  assert.match(ui,/user_create_with_password/);
  assert.match(ui,/result\?\.created!==true/);
  assert.match(ui,/if\(!Array\.isArray\(payload\?\.users\)\)/);
});

test("all page controllers check the suspension independently of maintenance",()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.v54_self_account_access/);
  assert.match(sql,/\x27allowed\x27, EXISTS/);
  assert.match(sql,/\x27suspended\x27, EXISTS/);
  assert.match(gate,/\/rpc\/v54_self_account_access/);
  assert.match(gate,/access\?\.suspended === true/);
  assert.match(gate,/maintenanceScreen\(suspended \? "suspended" : "maintenance"\)/);
  assert.match(gate,/title\.textContent = reason === "suspended" \? "Acesso suspenso"/);
  assert.match(gate,/looplyClient\.auth\.signOut\(\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.v54_self_account_access/);
});
test("extended admin modules reject server errors and unconfirmed writes",()=>{
  assert.match(extended,/data\?\.error\|\|data\?\.success===false/);
  for(const action of ["vip_set","features_set","sessions_revoke","stickers_set","groups_rename","games_finish"])
    assert.ok(extended.includes(action+":()=>"),action);
  assert.match(extended,/O Neon não confirmou a alteração administrativa/);
});

test("account provisioning uses a verified availability RPC and the active Better Auth admin client",()=>{
  assert.match(bridge,/\/rpc\/v12_admin_action/);
  assert.match(bridge,/p_action:"user_check_availability"/);
  assert.match(bridge,/available\.usernameAvailable/);
  assert.match(bridge,/available\.emailAvailable/);
  assert.match(bridge,/getBetterAuthInstance\?\.\(\)\?\.admin/);
  assert.doesNotMatch(bridge,/const alternateAuth=createClient\(/);
  assert.match(bridge,/adminApi\.createUser\(/);
  assert.match(bridge,/\/rpc\/v12_admin_finish_signup/);
  assert.match(bridge,/linkedData\?\.created!==true/);
  assert.match(read("src/admin-model-extensions.js"),/getBetterAuthInstance\?\.\(\)\?\.admin/);
});
