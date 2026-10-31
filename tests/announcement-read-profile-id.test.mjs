import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("announcement receipt uses the linked Looply profile UUID, never Neon Auth user UUID",async()=>{
  const [runtime,component]=await Promise.all([
    read("src/page-runtime.js"),read("src/global-announcements.js")
  ]);
  assert.match(runtime,/mountGlobalAnnouncements\(\{ client: supabase, user, profileId: profile\.id \}\)/);
  assert.match(component,/const receiptUserId = profileId;/);
  assert.match(component,/announcement_id: announcement\.id,\s*user_id: receiptUserId/);
  assert.match(component,/select\("announcement_id"\)\.eq\("user_id", receiptUserId\)/);
  assert.doesNotMatch(component,/announcement_id: announcement\.id,\s*user_id: user\.id/);
  assert.doesNotMatch(component,/select\("announcement_id"\)\.eq\("user_id", user\.id\)/);
});
test("announcement acknowledgment is verified in Neon RPC and stays idempotent",async()=>{
  const component=await read("src/global-announcements.js");
  assert.match(component,/client\.rpc\("v23_mark_global_announcement_read"/);
  assert.match(component,/p_announcement_id: announcement\.id/);
  assert.match(component,/data !== true/);
  assert.doesNotMatch(component,/client\.from\("global_announcement_reads"\)\.insert\(/);
  assert.match(component,/knownRead\.add\(announcement\.id\)/);
  assert.match(component,/status\.textContent = "Registrando leitura…"/);
  assert.match(component,/readButton\.disabled = false/);
});
