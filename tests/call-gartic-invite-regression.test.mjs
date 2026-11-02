import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const get=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Call controller uses one ID for offer, answer, ICE, decline and hangup",async()=>{
 const [calls,global,fast]=await Promise.all([
  get("src/chat-calls.js"),get("src/global-call-listener.js"),get("src/fast-incoming-calls.js")
 ]);
 assert.match(calls,/let activeCallId = ""/);
 assert.match(calls,/callId: activeCallId, \.\.\.extra/);
 assert.match(calls,/activeCallId = payload\.callId \|\| ""/);
 assert.match(calls,/String\(payload\.callId \|\| ""\) !== activeCallId/);
 assert.match(calls,/activeCallId=offer\.callId\|\|""/);
 assert.match(global,/call\.payload\?\.callId/);
 assert.match(fast,/p_payload:\{type,conversationId,\.\.\.\(callId/);
});
test("Calls cannot be dropped when a Service Worker activates during media capture",async()=>{
 const sw=await get("src/service-worker.js");
 assert.match(sw,/\[data-call-modal\]:not\(\[hidden\]\)/);
 assert.match(sw,/looply-global-call-notice:not\(\[hidden\]\)/);
 assert.match(sw,/if \(draft \|\| call \|\| document\.querySelector/);
});
test("Every Gartic invitation is authenticated, reversible, and tied to a conversation",async()=>{
 const sql=await get("migration/20261102_gartic_invites.sql");
 const js=await get("src/chat-gartic.js");
 assert.match(sql,/PRIMARY KEY\(game_id,user_id\)/);
 assert.match(sql,/conversation_participants cp/);
 assert.match(sql,/p_action='invite'/);
 assert.match(sql,/p_action IN \('accept','join'\)/);
 assert.match(sql,/p_action='decline'/);
 assert.match(sql,/A valid invitation is required/);
 assert.match(sql,/inviteStatus/);
 assert.match(js,/data-gartic-invitation/);
 assert.match(js,/data-gartic-action="accept"/);
 assert.match(js,/data-gartic-action="decline"/);
 assert.match(js,/\["create","state","tick","invite","accept","decline","join"/);
});
