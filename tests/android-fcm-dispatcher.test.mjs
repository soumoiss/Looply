import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");

test("FCM dispatcher requires Neon secret, not account tokens in client bundles",async()=>{
 const worker=await read("backend/cloudflare/android-push-worker.mjs");
 const client=await read("src/neon-production-client.js");
 assert.match(worker,/env\.NEON_PUSH_DATABASE_URL/);
 assert.match(worker,/env\.FCM_SERVICE_ACCOUNT_JSON/);
 assert.match(worker,/oauth2\.googleapis\.com\/token/);
 assert.match(worker,/fcm\.googleapis\.com\/v1\/projects/);
 assert.doesNotMatch(client,/FCM_SERVICE_ACCOUNT_JSON|NEON_PUSH_DATABASE_URL/);
});
test("Worker dispatch is based on real events and keeps data only FCM payload",async()=>{
 const worker=await read("backend/cloudflare/android-push-worker.mjs");
 const named=await read("migration/20261031_fcm_named_fast_call.sql");
 for(const table of ["notifications","chat_notifications","letter_event_notifications","android_fcm_story_events","android_fcm_tokens"])
  assert.ok(named.includes("public."+table),table);
 assert.match(worker,/public\\.v22_android_fcm_named_candidates\\(\\)/);
 assert.match(worker,/public\\.android_fcm_deliveries/);
 assert.match(worker,/ON CONFLICT\(source,event_id,token_id\)/);
 assert.match(worker,/WHERE created_at > now\(\)-interval '2 hours'/);
 assert.match(worker,/android:\{priority:/);
 assert.doesNotMatch(worker,/message=\{token:.*notification:/);
});
test("Private Stories are never enqueued as general public Story push",async()=>{
 const sql=await read("migration/20261030_fcm_public_story_events.sql");
 assert.match(sql,/IF NEW\.visibility='public' THEN/);
 assert.match(sql,/p\.id<>NEW\.author_id/);
 assert.match(sql,/ON CONFLICT \(story_id,recipient_id\) DO NOTHING/);
 assert.match(sql,/REVOKE ALL ON public\.android_fcm_story_events FROM PUBLIC/);
});

test("production FCM workflow verifies the private key before secret synchronization", async () => {
 const workflow=await read(".github/workflows/android-fcm-deploy.yml");
 assert.match(workflow,/branches: \[main\]/);
 assert.match(workflow,/backend\/cloudflare\/android-push-worker\.mjs/);
 assert.match(workflow,/parseFcmServiceAccount/);
 assert.match(workflow,/decodeFcmPrivateKey/);
 assert.match(workflow,/subtle\.importKey\('pkcs8'/);
 assert.match(workflow,/wrangler@4 secret put FCM_SERVICE_ACCOUNT_JSON/);
});
