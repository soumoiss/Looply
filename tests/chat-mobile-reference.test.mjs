import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chatMarkup } from "../src/chat.js";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("both Chat pages render one existing global header without a second mock header", async () => {
  for (const path of ["chat.html","conversa.html"]) {
    const html = await read(path);
    assert.equal((html.match(/data-site-header/g)||[]).length,1,path);
    assert.doesNotMatch(html,/class="global-header"|class="global-nav"|keyboard-mockup|id="callModal"/);
    assert.match(html,/chat-mobile-reference\.css\?v=20261027/);
  }
});
test("Chat CSS is loaded AFTER desktop legacy Chat CSS and conversation CSS", async () => {
  for (const path of ["chat.html","conversa.html"]) {
    const html=await read(path);
    assert.ok(html.indexOf("chat-mobile-reference.css")>html.indexOf("pages/chat.css"),path);
    if (path==="conversa.html") assert.ok(html.indexOf("chat-mobile-reference.css")>html.indexOf("pages/conversation.css"));
  }
});
test("only global page-runtime renders the six real bottom navigation links", async () => {
  const [runtime,html]=await Promise.all([read("src/page-runtime.js"),read("chat.html")]);
  assert.match(runtime,/page-navigation/);
  for(const route of ["home.html","chat.html","notificacoes.html"]) assert.match(runtime,new RegExp(route.replace(".","\\.")));
  assert.doesNotMatch(html,/<nav class="global-nav"/);
});
test("reference stylesheet forces mobile width to one column with the desktop rule overridden",async()=>{
  const css=await read("assets/css/pages/chat-mobile-reference.css");
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/\.page-chat:not\(\.page-conversation\) \.chat-thread-panel \{ display:none!important; \}/);
  assert.match(css,/\.chat-area\.is-conversation-open \.chat-sidebar \{ display:none!important; \}/);
  assert.match(css,/\.page-conversation \.chat-sidebar \{ display:none!important; \}/);
  assert.match(css,/@media \(max-width:760px\)/);
});
test("visual keyboard support uses native Android keyboard, never a simulated HTML keyboard",async()=>{
  const [css,source]=await Promise.all([read("assets/css/pages/chat-mobile-reference.css"),read("src/chat.js")]);
  assert.match(css,/--looply-visible-height/);
  assert.match(css,/textarea:focus/);
  assert.match(source,/window\.visualViewport/);
  assert.doesNotMatch(css,/keyboard-mockup|kb-row|kb-key/);
});
test("reference gradients and cards preserve Looply purple and white tokens",async()=>{
  const css=await read("assets/css/pages/chat-mobile-reference.css");
  assert.match(css,/#7c3aed/);
  assert.match(css,/#f8f6ff/);
  assert.match(css,/\.chat-conversation \{/);
  assert.match(css,/\.chat-message-row\.is-mine \.chat-message/);
  assert.match(css,/\.chat-thread-heading \{/);
  assert.match(css,/\.chat-message-form \{/);
});
test("conversation list renders real authorized data without hard-coded sample contacts",()=>{
  const markup=chatMarkup({conversations:[],profiles:[],notifications:[]}, "viewer");
  assert.match(markup,/data-chat-conversations/);
  assert.match(markup,/data-chat-conversation-search/);
  assert.match(markup,/data-chat-filter="groups"/);
  assert.match(markup,/data-chat-filter="unread"/);
  assert.doesNotMatch(markup,/Bielzinho|Kizuna forever|Yarinhaa|images\.unsplash/);
});
test("stories, real group creation and user search remain wired in Chat",async()=>{
  const [entry,markup]=await Promise.all([read("assets/js/chat.js"),read("src/chat.js")]);
  assert.match(entry,/loadStories\(client\)/);
  assert.match(entry,/bindStories\(root, client/);
  assert.match(markup,/data-chat-group-create/);
  assert.match(markup,/data-chat-search/);
  assert.match(markup,/data-chat-start/);
});
test("favorite button does not also select/open a conversation",async()=>{
  const source=await read("src/chat.js");
  assert.match(source,/if \(event\.target\.closest\("\[data-v2-favorite\]"\)\) return/);
  assert.match(source,/const openButton = event\.target\.closest\("\[data-chat-open\]"\)/);
});
test("message composing, edits, replies, attachments and voice notes preserve real handlers",async()=>{
  const source=await read("src/chat.js");
  for(const attr of ["data-chat-send","data-chat-edit-message","data-chat-delete","data-chat-reply","data-chat-choose-files","data-chat-choose-sticker","data-chat-emoji","data-chat-record-start"])assert.ok(source.includes(attr),attr);
  assert.match(source,/uploadResumable/);
  assert.match(source,/chat_messages/);
});
test("global incoming voice/video calls remain real and available outside chat",async()=>{
  const [runtime,listener]=await Promise.all([read("src/page-runtime.js"),read("src/global-call-listener.js")]);
  assert.match(runtime,/setupGlobalCallListener\(supabase, user\.id, null\)/);
  assert.match(listener,/client\.channel/);
  assert.match(listener,/data-global-call-accept/);
  assert.match(listener,/looply:pending-call:/);
});
test("both entrypoints mount actual real-time WebRTC call setup",async()=>{
  for(const file of ["assets/js/chat.js","assets/js/conversation.js"]) {
    const source=await read(file);
    assert.match(source,/setupChatCalls\(root, client, user\.id\)/);
    assert.match(source,/chat-calls\.js\?v=chat-mobile-webrtc-20261027/);
    assert.match(source,/(chat-mobile-20261027|avatar-sync-20261028)/);
  }
});
test("voice calling uses real microphone + RTCPeerConnection + private signaling",async()=>{
  const source=await read("src/chat-calls.js");
  assert.match(source,/getUserMedia\(\{ audio: true, video: mode === "video" \}\)/);
  assert.match(source,/new RTCPeerConnection/);
  assert.match(source,/await pc\.createOffer\(\)/);
  assert.match(source,/await pc\.createAnswer\(\)/);
  assert.match(source,/send\("offer", offerPayload\)/);
  assert.match(source,/send\("answer"/);
  assert.match(source,/client\.channel\(\`looply-call-\$\{id\}\`/);
});
test("video call buttons remain attached to real direct chat, no fake call modal handlers",async()=>{
  const source=await read("src/chat-calls.js");
  assert.match(source,/data-call-audio/);
  assert.match(source,/data-call-video/);
  assert.match(source,/startCall\("audio"\)/);
  assert.match(source,/startCall\("video"\)/);
  assert.match(source,/data-call-hangup/);
  assert.doesNotMatch(source,/triggerCall\(|document\.getElementById\("callModal"\)/);
});
test("voice call shows actual peer identity while preserving live remote media playback",async()=>{
  const [calls,css]=await Promise.all([read("src/chat-calls.js"),read("assets/css/pages/chat-mobile-reference.css")]);
  assert.match(calls,/modal\.classList\.toggle\("is-audio-call", callMode === "audio"\)/);
  assert.match(calls,/chat-thread-heading \.chat-thread-avatar/);
  assert.match(calls,/videos\?\.prepend\(avatarFrame\)/);
  assert.match(calls,/remote\.srcObject = remoteStream/);
  assert.match(calls,/remote\.play\(\)/);
  assert.match(css,/\.is-audio-call \.chat-call-videos video/);
});
test("video calling can switch cameras and correctly releases microphone and camera on hangup",async()=>{
  const calls=await read("src/chat-calls.js");
  assert.match(calls,/sender\.replaceTrack\(nextTrack\)/);
  assert.match(calls,/localStream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(calls,/data-call-toggle-mic/);
  assert.match(calls,/data-call-toggle-camera/);
  assert.match(calls,/data-call-flip-camera/);
});
test("styles preserve one fullscreen real video call, no second fake stage",async()=>{
  const [css,legacy]=await Promise.all([read("assets/css/pages/chat-mobile-reference.css"),read("assets/css/pages/chat.css")]);
  assert.match(css,/\.chat-call-backdrop/);
  assert.match(legacy,/\.is-video-call \.chat-call-videos video\[data-call-remote\]/);
  assert.doesNotMatch(css,/class="modal-overlay"/);
});
