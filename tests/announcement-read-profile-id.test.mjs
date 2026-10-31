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
test("announcement acknowledgment preserves existing insert semantics and duplicate handling",async()=>{
  const component=await read("src/global-announcements.js");
  assert.match(component,/client\.from\("global_announcement_reads"\)\.insert\(/);
  assert.match(component,/error && error\.code !== "23505"/);
  assert.match(component,/knownRead\.add\(announcement\.id\)/);
  assert.match(component,/status\.textContent = "Registrando leitura…"/);
  assert.match(component,/readButton\.disabled = false/);
});
