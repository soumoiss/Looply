import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { CALL_STATES, canTransitionCall, createCallId, hasCallScope, isSignalForCall } from "../src/call-protocol.js";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");

test("Realtime refresh preserves the existing composer DOM node", async () => {
  const source = await read("src/chat.js");
  assert.match(source, /function updateThreadMarkup\(thread, markup, conversationId\)/);
  assert.match(source, /const currentForm = thread\.querySelector\("\[data-chat-send\]"\)/);
  assert.match(source, /child !== currentForm/);
  assert.match(source, /thread\.insertBefore\(child, currentForm\)/);
});

test("background refresh updates the sidebar instead of replacing the whole chat area", async () => {
  const source = await read("src/chat.js");
  const start = source.indexOf("async function refreshChat(");
  const end = source.indexOf("\nfunction scheduleRefresh", start);
  assert.ok(start >= 0 && end > start, "refreshChat function must exist");
  const refresh = source.slice(start, end);
  assert.match(refresh, /currentSidebar\.replaceWith\(freshSidebar\)/);
  assert.doesNotMatch(refresh, /area\.replaceWith\(freshArea\)/);
  assert.doesNotMatch(refresh, /area\.innerHTML\s*=/);
  assert.match(refresh, /requestId !== refreshSequence/);
});

test("opening a conversation invalidates stale background requests and does not clear a same-chat draft", async () => {
  const source = await read("src/chat.js");
  const start = source.indexOf("async function openConversation(");
  const end = source.indexOf("\nasync function refreshChat", start);
  const open = source.slice(start, end);
  assert.match(open, /refreshSequence \+= 1/);
  assert.match(open, /const hasSameComposer = thread\.querySelector\("\[data-chat-send\]"\)\?\.dataset\.conversationId === conversationId/);
  assert.match(open, /if \(hasSameComposer\) updateThreadMarkup\(thread, markup, conversationId\)/);
  assert.match(open, /requestId !== activeThreadRequest/);
});

test("a newly opened conversation scrolls to the latest rendered message without changing history refresh behavior", async () => {
  const source = await read("src/chat.js");
  assert.match(source, /function scrollInitialThreadToLatest\(thread\)/);
  assert.match(source, /requestAnimationFrame\(\(\) => \{\s*scrollToLatest\(\);\s*requestAnimationFrame\(scrollToLatest\)/);
  assert.match(source, /media\.addEventListener\(eventName, scrollToLatest, \{ once: true \}\)/);
  assert.match(source, /scrollInitialThreadToLatest\(thread\)/);
  assert.match(source, /if \(wasNearBottom\) thread\.scrollTop = thread\.scrollHeight/);
});

test("mobile chat uses list-first navigation and keeps the composer controls available", async () => {
  const css = await read("assets/css/pages/chat.css");
  const source = await read("src/chat.js");
  assert.match(css, /\.chat-area\.is-conversation-open \.chat-sidebar\s*\{\s*display:none/);
  assert.match(css, /\.chat-area\.is-conversation-open \.chat-thread-panel\s*\{\s*display:flex/);
  assert.match(source, /data-chat-back/);
  assert.match(source, /data-chat-emoji/);
  assert.match(source, /Anexar mídia/);
});

test("Stories remain in the conversation list and survive Realtime sidebar refreshes", async () => {
  const [page, controller] = await Promise.all([
    read("assets/js/chat.js"),
    read("src/chat.js")
  ]);
  assert.match(page, /storyArea && chatSidebar\) chatSidebar\.prepend\(storyArea\)/);
  assert.match(controller, /const currentStories = currentSidebar\?\.querySelector\("\.story-area"\)/);
  assert.match(controller, /if \(currentStories\) freshSidebar\.prepend\(currentStories\)/);
});


test("emoji picker offers multiple choices and inserts the selected emoji at the cursor", async () => {
  const source = await read("src/chat.js");
  const css = await read("assets/css/pages/chat.css");
  assert.match(source, /data-chat-emoji-picker/);
  assert.match(source, /data-chat-emoji-choice/);
  assert.match(source, /input\.setRangeText\(emojiChoice\.dataset\.chatEmojiChoice, start, end, "end"\)/);
  assert.match(source, /"😀","😃","😄"/);
  assert.match(css, /\.chat-emoji-picker/);
});

test("chat avatars fall back only after an image fails to load", async () => {
  const source = await read("src/chat.js");
  assert.match(source, /root\.addEventListener\("error", \(event\) =>/);
  assert.match(source, /chat-conversation-avatar, \.chat-person-avatar/);
  assert.match(source, /image\.replaceWith\(fallback\)/);
});

test("WebRTC call controls distinguish microphone, speaker, camera, and camera switching", async () => {
  const source = await read("src/chat-calls.js");
  const css = await read("assets/css/pages/chat.css");
  assert.match(source, /data-call-toggle-mic/);
  assert.match(source, /data-call-toggle-speaker/);
  assert.match(source, /data-call-flip-camera/);
  assert.match(source, /sender\.replaceTrack\(nextTrack\)/);
  assert.match(css, /\.chat-call-backdrop\s*\{\s*position:\s*fixed/);
});

test("tic-tac-toe randomizes the first starter, gives the previous winner the next start, and records results idempotently", async () => {
  const source = await read("src/chat-enhancements.js");
  const migration = await read("supabase/migrations/20261018191500_chat_ttt_persistent_scores.sql");
  const indexes = await read("supabase/migrations/20261018194500_chat_ttt_score_indexes.sql");
  assert.match(source, /Math\.random\(\) < 0\.5 \? gameInvite\.senderId : userId/);
  assert.match(source, /gameState\.winnerId \|\|/);
  assert.match(source, /record_chat_ttt_result/);
  assert.match(migration, /game_id uuid primary key/);
  assert.match(migration, /on conflict \(game_id\) do nothing/);
  assert.match(migration, /conversation_participants/);
  assert.match(indexes, /chat_ttt_results_conversation_created_idx/);
});

test("incoming direct calls are listened for on authenticated pages outside the active chat", async () => {
  const [runtime, globalListener, callController] = await Promise.all([
    read("src/page-runtime.js"), read("src/global-call-listener.js"), read("src/chat-calls.js")
  ]);
  assert.match(runtime, /setupGlobalCallListener\(supabase, user\.id, profile\)/);
  assert.match(globalListener, /from\("conversation_participants"\)/);
  assert.match(globalListener, /config: \{ private: true/);
  assert.match(globalListener, /conversation\.kind !== "direct"/);
  assert.match(globalListener, /participants\.some\(\(participant\) => participant\.user_id === payload\.senderId\)/);
  assert.match(globalListener, /looply:pending-call:/);
  assert.match(callController, /restorePendingIncomingCall\(id\)/);
  assert.match(callController, /offerRetryTimer/);
  assert.match(globalListener, /callId: call\.id/);
});

test("private call signaling authorization is limited to direct conversation members", async () => {
  const migration = await read("supabase/migrations/20261018215518_direct_call_signaling_hardening.sql");
  assert.match(migration, /for select\s+to authenticated/i);
  assert.match(migration, /for insert\s+to authenticated/i);
  assert.match(migration, /c\.kind = 'direct'/i);
  assert.match(migration, /cp\.user_id = \(select auth\.uid\(\)\)/i);
});

test("a handed-off call requires an explicit media gesture and never turns a permission block into decline", async () => {
  const source = await read("src/chat-calls.js");
  const start = source.indexOf("const restorePendingIncomingCall =");
  const end = source.indexOf("\n  const handleSignal =", start);
  assert.ok(start >= 0 && end > start, "pending call restoration helper must exist");
  const restore = source.slice(start, end);
  assert.match(restore, /pending\.accepted !== true/);
  assert.match(restore, /renderIncoming\(\)/);
  assert.match(restore, /explicit tap/);
  assert.doesNotMatch(restore, /void acceptCall\(\)/);
  assert.match(source, /PermissionDeniedError/);
  assert.match(source, /data-call-accept/);
  assert.match(source, /Permita o acesso ao microfone/);
});

test("tic-tac-toe shows actual player names and resolves the winner from the winning player ID", async () => {
  const source = await read("src/chat-enhancements.js");
  assert.match(source, /const ownDisplayName = \(\) => root\.querySelector\("\.looply-account strong"\)/);
  assert.match(source, /senderName: ownDisplayName\(\)/);
  assert.match(source, /oName: ownDisplayName\(\)/);
  assert.match(source, /const winnerId = gameState\.winnerId \|\|/);
  assert.doesNotMatch(source, /senderName: root\.querySelector\("\[data-site-header\]"\)\?\.textContent/);
});

test("remote audio/video tracks are captured before answer negotiation and audio playback has an explicit fallback", async () => {
  const source = await read("src/chat-calls.js");
  assert.match(source, /let remoteStream = null/);
  assert.match(source, /if \(!remoteStream\) remoteStream = new MediaStream\(\)/);
  assert.match(source, /pc\.ontrack = \(event\) =>/);
  assert.match(source, /data-call-enable-audio/);
  assert.match(source, /remote\.muted = false/);
});

test("call protocol scopes every lifecycle event to one call and rejects invalid state transitions", () => {
  const callId = createCallId();
  const call = { id: callId, conversationId: "conversation-1" };
  const signal = { callId, conversationId: "conversation-1", senderId: "user-2" };
  assert.ok(hasCallScope(signal));
  assert.ok(isSignalForCall(signal, call));
  assert.equal(isSignalForCall({ ...signal, callId: createCallId() }, call), false);
  assert.ok(canTransitionCall(CALL_STATES.IDLE, CALL_STATES.DIALING));
  assert.ok(canTransitionCall(CALL_STATES.RINGING, CALL_STATES.ACCEPTING));
  assert.equal(canTransitionCall(CALL_STATES.CONNECTED, CALL_STATES.RINGING), false);
});

test("call controller ignores stale events and uses distinct cancel, decline, busy, and failure states", async () => {
  const source = await read("src/chat-calls.js");
  assert.match(source, /isSignalForCall\(payload, activeCall\)/);
  assert.match(source, /Never let an old call control a new one/);
  assert.match(source, /send\("busy"/);
  assert.match(source, /signal: "cancel"/);
  assert.match(source, /signal: "failed"/);
  assert.match(source, /connectionState === "disconnected"/);
});
