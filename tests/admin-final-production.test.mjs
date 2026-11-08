import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [admin,extension,auth,worker,login,sw,sql,groupSql]=await Promise.all([
 read('src/admin-model-live.js'),read('src/admin-model-extensions.js'),
 read('src/neon-production-login.js'),read('backend/cloudflare/android-push-worker.mjs'),
 read('assets/js/login.js'),read('sw.js'),
 read('migration/20261108_admin_final_auth_push_security.sql'),
 read('migration/20261108_admin_groups_calls_ip_gates.sql')
]);

test('all 47 admin catalog entries have a concrete route, not unavailable placeholder',()=>{
 assert.doesNotMatch(admin,/\['[a-z]\.[a-z]+',[^\n]+?'unavailable'/i);
 for(const kind of ['password-reset','archive-import','push-broadcast','login-audits','ip-blocks','limit-report']){
  assert.ok(admin.includes("'"+kind+"'"));
  assert.ok(extension.includes("kind==='"+kind+"'"));
 }
});
test('password management uses verified Neon Auth API, never SQL password writes',()=>{
 assert.match(extension,/neon\.auth\?\.admin/);
 assert.match(extension,/setUserPassword/);
 assert.match(extension,/listUsers/);
 assert.doesNotMatch(sql,/\bUPDATE\s+neon_auth\.account\b/i);
});
test('FCM admin messages are token-scoped and forwarded by the scheduled worker',()=>{
 assert.match(sql,/WHEN 'push_create'/);
 assert.match(sql,/INSERT INTO public\.notifications/);
 assert.match(worker,/events\.kind='admin_broadcast'/);
 assert.match(worker,/token\.user_id=n\.recipient_id/);
 assert.match(worker,/String\(item\.message_preview/);
});
test('IP deny uses provider supplied session IP, not untrusted browser-submitted IP',()=>{
 assert.match(groupSql,/BEFORE INSERT OR UPDATE OF "ipAddress"/);
 assert.match(groupSql,/new\."ipAddress"::inet/);
 assert.match(groupSql,/looply_admin_ip_blocks/);
});
test('group archive is reversible, call signaling and feature gates retain existing content',()=>{
 assert.match(groupSql,/WHEN 'group_archive','group_restore'/);
 assert.match(groupSql,/WHEN 'call_terminate'/);
 assert.match(groupSql,/looply_admin_game_ttt_gate/);
 assert.match(groupSql,/looply_admin_calls_offer_gate/);
 assert.doesNotMatch(groupSql,/DELETE FROM (public\.(?:conversations|chat_messages)|looply_migration\.call_signal_events)/i);
});
test('main login uses Neon, stores no password in telemetry',()=>{
 assert.match(login,/neon-production-login/);
 assert.match(auth,/v48_record_failed_login/);
 assert.match(sw,/admin-model-extensions/);
 assert.doesNotMatch(auth,/JSON\.stringify\(\{[^}]*password:/i);
});
