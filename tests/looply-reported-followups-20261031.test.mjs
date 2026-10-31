import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Call notification has an immediate high-priority FCM path with non-blocking fallback",()=>{
 const worker=file("backend/cloudflare/android-push-worker.mjs");
 const call=file("src/chat-calls.js");
 assert.match(worker,/dispatchImmediateCall/);
 assert.match(worker,/kind==="call"/);
 assert.match(worker,/"HIGH"/);
 assert.match(worker,/rows\.slice\(offset,offset\+5\)/);
 assert.match(call,/waitForIceGatheringComplete = \(peer, timeout = 1500\)/);
 assert.match(call,/void requestImmediateCallPush\(client,activeConversation\(\)\)/);
});
test("Story rings reflect persisted viewer receipts and X remains reachable",()=>{
 const source=file("src/stories.js");
 const css=file("assets/css/pages/stories-viewer-engagement.css");
 assert.match(source,/viewer_id",viewerId/);
 assert.match(source,/is-story-unseen/);
 assert.match(source,/is-story-seen/);
 assert.match(source,/data-story-close aria-label="Fechar stories">✕/);
 assert.match(css,/\.is-story-seen/);
 assert.match(css,/\.is-story-unseen/);
 assert.match(css,/visibility:visible!important/);
});
test("Scheduled recipient inbox returns metadata without premature body",()=>{
 const sql=file("migration/20261031_scheduled_recipient_metadata_only.sql");
 const ui=file("src/scheduled-letters.js");
 const recipientSql=sql.split("SELECT coalesce")[1].split("FROM public.scheduled_letters")[0];
 assert.doesNotMatch(recipientSql, /'body'|'password_ciphertext'|'password_salt'/);
 assert.match(sql,/s\.recipient_id=\(SELECT public\.looply_legacy_uid\(\)\)/);
 assert.match(ui,/v26_scheduled_recipient_inbox/);
 assert.match(ui,/data-scheduled-direction="received"/);
 assert.match(ui,/scheduled-lock-note/);
});
test("Sent letters are hidden only for sender; a queued scheduled letter is canceled before hide",()=>{
 const sql=file("migration/20261031_sender_safe_delete_letters.sql");
 const letters=file("assets/js/letters.js");
 assert.match(sql,/v24_cancel_scheduled_letter\(p_id\)/);
 assert.match(sql,/sender_id=actor/);
 assert.match(sql,/INSERT INTO public\.looply_sent_letter_hidden/);
 assert.match(letters,/v26_hide_sent_letter/);
 assert.match(letters,/A cópia recebida será preservada/);
});
test("Conversation ordering and group cover crop are both interactive",()=>{
 const chat=file("src/chat.js");
 const crop=file("src/group-cover-editor.js");
 assert.match(chat,/latestByConversation\.get\(conversation\.id\)\?\.created_at/);
 assert.match(chat,/contactActivity/);
 assert.match(chat,/editGroupCover\(file\)/);
 assert.match(crop,/pointermove/);
 assert.match(crop,/sourceSize=size\/\(base\*zoom\)/);
 assert.match(crop,/toBlob\(resolve,"image\/webp"/);
});
