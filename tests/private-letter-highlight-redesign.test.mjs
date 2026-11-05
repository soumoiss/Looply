import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deliverNotifications} from '../backend/cloudflare/android-push-worker.mjs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('private-letter activity is limited to the ADM panel and excluded from inbox and FCM',async()=>{
  const sql=read('migration/20261105_private_letters_silent_audit_and_passwords.sql');
  const admin=read('src/admin.js');
  const inbox=read('assets/js/notifications.js');
  const runtime=read('src/page-runtime.js');
  assert.match(sql,/event_type='new_received' AND recipient_id=public\.looply_legacy_uid\(\)/);
  assert.match(sql,/IF COALESCE\(v_protected,false\) THEN/);
  assert.match(admin,/data-letter-activity-list/);
  assert.doesNotMatch(inbox,/looply_admin_activity_notifications/);
  assert.doesNotMatch(runtime,/adminNotices/);
  let called=false;
  const result=await deliverNotifications({}, {
    query:async()=>[{source:'admin_event',kind:'admin_private_unlock',event_id:'00000000-0000-4000-8000-000000000001'}],
    accessTokenProvider:async()=>{called=true;throw Error('FCM must not be called');}
  });
  assert.deepEqual(result,{eligible:0,sent:0,failed:0});
  assert.equal(called,false);
});

test('highlight viewing is owner-scoped and notices are deduplicated by viewer and story',()=>{
  const sql=read('migration/20261105_private_letters_silent_audit_and_passwords.sql');
  assert.match(sql,/s\.author_id=v_owner AND s\.expires_at>now\(\)/);
  assert.match(sql,/NEW\.viewer_id='?never'?|v_owner=NEW\.viewer_id/);
  assert.match(sql,/ON CONFLICT\(recipient_id,kind,event_id\) DO NOTHING/);
  assert.match(sql,/NOT EXISTS\(SELECT 1 FROM public\.story_highlights h WHERE h\.story_id=s\.id\)/);
  assert.match(read('src/why-now-integration.js'),/"keep-highlight":keepHighlight/);
});

test('private-letter passwords have no character count bounds in the active paths',()=>{
  const sql=read('migration/20261105_private_letters_silent_audit_and_passwords.sql');
  const scheduled=read('src/scheduled-letters.js');
  assert.match(sql,/coalesce\(p_new_password,''\) = ''/);
  assert.doesNotMatch(sql,/length\(p_password\) > 256|NOT BETWEEN 7 AND 256|NOT BETWEEN 1 AND 256/);
  assert.match(scheduled,/protectedLetter && !password/);
  assert.doesNotMatch(read('src/admin.js'),/name="password" type="password" maxlength="256"/);
});
