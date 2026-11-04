import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {measureChatVisualViewport,threadMarkup,threadHeadingMarkup} from "../src/chat.js";
import {makePremiumNote} from "../src/chat-premium-cards.js";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const me="11111111-1111-4111-8111-111111111111",id="22222222-2222-4222-8222-222222222222";

test("Android visualViewport fills visible area, with no fake keyboard bottom gap",()=>{
  assert.deepEqual(measureChatVisualViewport({height:477,top:12,layoutHeight:800,baseline:800,typing:true}),{height:477,top:12,keyboardOpen:true});
  assert.deepEqual(measureChatVisualViewport({height:777,top:0,layoutHeight:800,baseline:800,typing:false}),{height:777,top:0,keyboardOpen:false});
  assert.deepEqual(measureChatVisualViewport({height:700,top:0,layoutHeight:700,baseline:700,typing:true}),{height:700,top:0,keyboardOpen:false});
});
test("mobile conversation picker scrolls as a document, never as a nested fixed list",()=>{
  const css=read("assets/css/pages/chat-fixes.css");
  assert.match(css,/body\.page-chat:not\(:has\(\.chat-area\.is-conversation-open\)\)/);
  assert.match(css,/overflow-y: auto !important/);
  assert.match(css,/\.chat-conversation-list[\s\S]*?max-height: none !important; overflow: visible !important/);
  assert.match(css,/height: var\(--looply-visible-height, 100dvh\) !important/);
  assert.match(css,/html\.chat-keyboard-open[\s\S]*?padding-bottom: 4px !important/);
});
test("Realtime reconciles Sidebar and preserves DOM rows, drafts and scroll",()=>{
  const source=read("src/chat.js");
  assert.match(source,/function reconcileChatSidebar\(currentSidebar, freshSidebar\)/);
  assert.match(source,/const scrollTop=currentSidebar\.scrollTop/);
  assert.match(source,/currentSidebar\.scrollTop=scrollTop/);
  assert.match(source,/reconcileChatSidebar\(currentSidebar,freshSidebar\)/);
  assert.doesNotMatch(source,/currentSidebar\.replaceWith\(freshSidebar\)/);
  assert.match(source,/if \(wasNearBottom && nextNodes\.some/);
});
test("group thread includes on-avatar camera connected to the existing Neon cover handler",()=>{
  const group=threadHeadingMarkup({},[{user_id:me,profile:{username:"user"}}],me,{id,kind:"group",subject:"Meu grupo"});
  assert.match(group,/data-chat-group-cover-choose/);
  assert.match(group,/data-chat-group-cover-input/);
  assert.match(group,/Trocar foto do grupo/);
  assert.match(read("src/chat.js"),/v10_set_group_cover/);
});
test("note, sticker, and voice are bare messages, with a 112px cap",()=>{
  const base={id:"m1",conversation_id:id,sender_id:me,body:"Mensagem de voz.",created_at:"2026-11-03T12:00:00Z"};
  const audio=threadMarkup([{...base,media:[{mime_type:"audio/ogg",signedUrl:"https://example.test/a.ogg",file_name:"a.ogg"}]}],me);
  assert.match(audio,/is-audio-only/);
  assert.match(audio,/is-bare/);
  assert.match(audio,/chat-voice-wave is-fill/);
  assert.match(audio,/data-chat-voice-seek/);
  assert.match(threadMarkup([{...base,body:makePremiumNote("Oi"),media:[]}],me),/is-note/);
  assert.match(read("assets/css/pages/chat-fixes.css"),/max-width: min\(112px, 32vw\) !important; max-height: 112px/);
});
test("long-press reaction palette has valid action buttons and uses screen-safe viewport",()=>{
  const source=read("src/chat-premium.js");
  assert.match(source,/pressTimer=setTimeout/);
  assert.match(source,/const button=document\.createElement\("button"\);\s*button\.type="button";button\.textContent=label/);
  assert.match(source,/const visual=window\.visualViewport/);
  assert.match(source,/root\.addEventListener\("pointerdown",onPress\)/);
});

test("back navigation uses thread → list → home, including the standalone conversation route",()=>{
  const source=read("src/chat.js");
  assert.match(source,/if \(root\.dataset\.conversationPage === "true"\) \{\s*window\.location\.replace\("chat\.html"\)/);
  assert.match(source,/window\.history\.back\(\)/);
  assert.match(source,/window\.location\.replace\(inConversationPage\?"chat\.html":"home\.html"\)/);
  assert.match(source,/root\.querySelector\("\[data-chat-area\]"\)\?\.classList\.remove\("is-conversation-open"\)/);
});
