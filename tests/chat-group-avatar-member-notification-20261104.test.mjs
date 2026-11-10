import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('group cover reuses the exact profile photo chooser and crop engine',async()=>{
  const [group,avatar,chat,css,html]=await Promise.all([
    read('src/group-cover-editor.js'),read('src/avatar-crop-editor.js'),
    read('src/chat.js'),read('assets/css/pages/group-avatar-editor.css'),read('chat.html')]);
  assert.match(group,/mountProfileAvatarEditor/);
  assert.match(group,/contextLabel:"grupo"/);
  assert.match(avatar,/onOutput\(file\)/);
  assert.match(avatar,/return \{open:start,openFile:choose,dispose/);
  assert.match(avatar,/data-avatar-zoom/);
  assert.match(avatar,/data-avatar-rotate/);
  assert.match(avatar,/pointerdown/);
  assert.match(chat,/data-chat-create-cover-editor/);
  assert.match(chat,/looply:group-cover-ready/);
  assert.match(chat,/groupCoverDrafts\.get\(form\)/);
  assert.match(css,/\.pr-avatar-stage\{/);
  assert.match(css,/\.pr-avatar-crop::backdrop/);
  assert.match(html,/chat-ultra-live\.js/);
});

test('Neon group additions and removals use creator-authorized RPCs with a 50-member limit',async()=>{
  const [sql,ui]=await Promise.all([
    read('migration/20261104_group_membership_authenticated_rpc.sql'),
    read('src/chat-reference-complete.js')]);
  assert.match(sql,/SECURITY DEFINER SET search_path TO ''/);
  assert.match(sql,/c\.created_by=actor/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/COUNT\(\*\).*>= 50/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.v36_add_group_member/);
  assert.match(ui,/client\.rpc\('v36_add_group_member'/);
  assert.match(ui,/client\.rpc\('v36_remove_group_member'/);
  assert.doesNotMatch(ui,/from\('conversation_participants'\)\.insert/);
  assert.match(ui,/data-ref-member-query/);
  assert.match(ui,/searchGroupCandidates/);
});

test('Android message notifications include text previews, avatar caching and a real reply destination',async()=>{
  const [worker,service,cache,activity,chat]=await Promise.all([
    read('backend/cloudflare/android-push-worker.mjs'),
    read('android/app/src/main/java/com/soumoiss/looply/LooplyMessagingService.kt'),
    read('android/app/src/main/java/com/soumoiss/looply/ChatAvatarCache.kt'),
    read('android/app/src/main/java/com/soumoiss/looply/MainActivity.kt'),
    read('src/chat.js')]);
  assert.match(worker,/public\.v27_fcm_safe_chat_preview/);
  assert.match(worker,/public\.v36_fcm_safe_chat_actor\(events\.event_id,events\.token_id\)/);
  assert.match(await read('migration/20261104_fcm_safe_chat_actor.sql'),/m\.sender_id/);
  assert.match(worker,/data\.actorId=String\(item\.actor_id\)/);
  assert.match(service,/NotificationCompat\.MessagingStyle/);
  assert.match(service,/data\["body"\]/);
  assert.match(service,/ChatAvatarCache\.load\(this,data\["actorId"\]\)/);
  assert.match(service,/\.setVisibility\(NotificationCompat\.VISIBILITY_PRIVATE\)/);
  // The Android action is now an actual RemoteInput reply broadcast, not a
  // label that only opens MainActivity.
  assert.match(service,/RemoteInput\.Builder/);
  assert.match(service,/NativeInlineReplyReceiver::class\.java/);
  assert.match(service,/addRemoteInput\(remoteInput\)/);
  assert.doesNotMatch(service,/"Responder",pending/);
  assert.match(cache,/WEB_MESSAGE_LISTENER/);
  assert.match(cache,/isMainFrame/);
  assert.match(cache,/https:\/\/soumoiss\.github\.io/);
  assert.match(activity,/ChatAvatarCache\.register\(this, webView\)/);
  assert.match(chat,/LooplyAvatarCache\.postMessage/);
});
