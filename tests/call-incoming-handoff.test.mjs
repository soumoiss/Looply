import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { routeIncomingCallToOpenChat } from "../src/call-incoming-router.js";

class IncomingEvent extends Event {
  constructor(name,{cancelable,detail}) {super(name,{cancelable});this.detail=detail;}
}
const room="2f3e4d5c-1111-4111-8111-222233334444";
const offer={type:"offer",mode:"audio",description:{type:"offer",sdp:"v=0"}};
const root=(conversationId=room,installed=true)=>{
  const target=new EventTarget();
  target.dataset={chatCalls:installed?"true":"false"};
  target.querySelector=selector=>selector===".chat-thread-heading"
    ? {dataset:{conversationId}} : null;
  return target;
};
test("authenticated inbox offer reaches the currently open chat even during room connection",()=>{
  const target=root();let offered=null;
  target.addEventListener("looply:incoming-call",e=>{offered=e.detail;e.preventDefault();});
  assert.equal(routeIncomingCallToOpenChat(target,room,offer,IncomingEvent),true);
  assert.deepEqual(offered,{conversationId:room,payload:offer});
});
test("without a ready chat controller or for another conversation, global ring overlay is retained",()=>{
  assert.equal(routeIncomingCallToOpenChat(root(room,false),room,offer,IncomingEvent),false);
  assert.equal(routeIncomingCallToOpenChat(root("3f3e4d5c-1111-4111-8111-222233334444"),room,offer,IncomingEvent),false);
  assert.equal(routeIncomingCallToOpenChat(root(),room,offer,IncomingEvent),false);
});
test("production global listener no longer suppresses an inbox offer for the active conversation",async()=>{
  const global=await readFile(new URL("../src/global-call-listener.js",import.meta.url),"utf8");
  const calls=await readFile(new URL("../src/chat-calls.js",import.meta.url),"utf8");
  assert.match(global,/routeIncomingCallToOpenChat/);
  assert.doesNotMatch(global,/activeConversationId\(\) === conversationId\) return/);
  assert.doesNotMatch(global,/activeConversationId\(\) === conversation\.id\) return/);
  assert.match(calls,/addEventListener\("looply:incoming-call"/);
  assert.match(calls,/event\.preventDefault\(\)/);
  assert.match(calls,/receiveOffer\(payload\)/);
  assert.ok(calls.indexOf("const receiveOffer =") < calls.indexOf("const ensureChannel ="),"offer handler must be in shared scope, not nested inside ensureChannel");
});
