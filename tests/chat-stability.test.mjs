import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { voiceRecordingElapsedMs } from "../src/chat.js";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");

test("Realtime refresh preserves the existing composer DOM node", async () => {
  const source = await read("src/chat.js");
  assert.match(source, /function updateThreadMarkup\(thread, markup, conversationId\)/);
  assert.match(source, /const currentForm = thread\.querySelector\("\[data-chat-send\]"\)/);
  assert.match(source, /child !== currentForm/);
  assert.match(source, /thread\.insertBefore\(child, currentForm\)/);
});

test("chat filters use explicit conversation data and keep required empty states", async () => {
  const [source, logic] = await Promise.all([
    read("src/chat.js"), read("src/chat-filter-logic.js")
  ]);
  assert.match(source, /data-chat-filter="all"/);
  assert.doesNotMatch(source, /data-chat-filter="groups"|data-chat-filter="unread"/);
  assert.match(source, /data-chat-kind=/);
  assert.match(source, /data-chat-unread-count=/);
  assert.match(source, /matchesConversationFilter\(/);
  assert.match(source, /Nenhum grupo encontrado\./);
  assert.match(source, /Nenhuma mensagem não lida\./);
  assert.match(source, /item\.hidden = !\(matchesQuery && matchesFilter\)/);
  assert.match(source, /mark_conversation_read[\s\S]*?refreshChat\(root, client, userId, \{ keepThread: true \}\)/);
  assert.match(logic, /filter === "groups"\) return kind === "group"/);
  assert.match(logic, /filter === "unread"\) return Number\.isFinite\(unreadCount\) && unreadCount > 0/);
});

test("chat message edits are limited in the UI to the sender and rely on existing owner RLS", async () => {
  const [source, schema] = await Promise.all([
    read("src/chat.js"), read("supabase/migrations/20261015234516_conversations_letters_chat_media.sql")
  ]);
  assert.match(source, /isMine \? `<button class="chat-reply-button" type="button" data-chat-edit-open=/);
  assert.match(source, /data-chat-edit-message/);
  assert.match(source, /\.update\(\{ body \}\)[\s\S]*?\.eq\("id", form\.dataset\.messageId\)\.eq\("conversation_id", form\.dataset\.conversationId\)/);
  assert.match(schema, /grant update \(body\) on public\.chat_messages to authenticated/);
  assert.match(schema, /create policy chat_messages_update_own[\s\S]*?sender_id = \(select auth\.uid\(\)\)/);
});

test("chat deletion requires confirmation and only exposes messages without attachments", async () => {
  const [source, schema] = await Promise.all([
    read("src/chat.js"), read("supabase/migrations/20261015234516_conversations_letters_chat_media.sql")
  ]);
  assert.match(source, /message\.media\?\.length \? "" : `<button[^`]*data-chat-delete=/);
  assert.match(source, /window\.confirm\("Excluir esta mensagem\?/);
  assert.match(source, /\.delete\(\)[\s\S]*?\.eq\("id", deleteMessageButton\.dataset\.chatDelete\)[\s\S]*?\.eq\("conversation_id", deleteMessageButton\.dataset\.conversationId\)/);
  assert.match(schema, /create policy chat_messages_delete_own[\s\S]*?sender_id = \(select auth\.uid\(\)\)/);
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
  assert.match(source, /media\.addEventListener\(eventName, \(\) => \{/);
  assert.match(source, /thread\.scrollHeight - thread\.scrollTop - thread\.clientHeight < 140/);
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

test("chat attachments normalize Android content-provider files and keep browser, Storage, and RLS allowlists aligned", async () => {
  const [chat, migration] = await Promise.all([
    read("src/chat.js"), read("supabase/migrations/20261020140000_chat_attachment_mime_reliability.sql")
  ]);
  assert.match(chat, /function normalizedAttachment\(file\)/);
  assert.match(chat, /mimeTypesByExtension/);
  assert.match(chat, /new File\(\[file\]/);
  assert.match(chat, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(chat, /Seleção de arquivo cancelada/);
  assert.match(migration, /chat_media_mime_type_check/);
  assert.match(migration, /looply_chat_insert_own_message/);
  assert.match(migration, /application\/msword/);
  assert.match(migration, /conversation_id::text/);
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


test("emoji picker has searchable categories, per-user recents, skin tones, flags and cursor-safe insertion", async () => {
  const source = await read("src/chat.js");
  const css = await read("assets/css/pages/chat.css");
  assert.match(source, /data-chat-emoji-picker/);
  assert.match(source, /data-chat-emoji-choice/);
  assert.match(source, /input\.setRangeText\(emojiChoice\.dataset\.chatEmojiChoice, start, end, "end"\)/);
  assert.match(source, /data-chat-emoji-category/);
  assert.match(source, /data-chat-emoji-search/);
  assert.match(source, /CHAT_EMOJI_CATEGORIES/);
  assert.match(source, /looply-chat-emoji-recent:/);
  assert.match(source, /👋🏿/);
  assert.match(source, /🇧🇷/);
  assert.match(source, /data-chat-emoji-grid/);
  assert.match(css, /\.chat-emoji-picker/);
  assert.match(css, /\.chat-emoji-categories/);
  assert.match(css, /\.chat-emoji-grid/);
});

test("chat stickers use a dedicated native file picker, enforce safe static image formats and render compactly", async () => {
  const [source, css, migration] = await Promise.all([
    read("src/chat.js"), read("assets/css/pages/chat.css"),
    read("supabase/migrations/20261020140000_chat_attachment_mime_reliability.sql")
  ]);
  assert.match(source, /data-chat-choose-sticker/);
  assert.match(source, /name="sticker" type="file" accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(source, /data-chat-sticker-picker/);
  assert.match(source, /data-chat-sticker-browse/);
  assert.match(source, /picker\.showModal\(\)/);
  assert.match(source, /data-chat-sticker-confirm/);
  assert.match(source, /Escolha uma imagem JPG, PNG ou WebP de até 10 MiB/);
  assert.match(source, /Figurinhas animadas ainda não são aceitas/);
  assert.match(source, /`sticker-\$\{Date\.now\(\)\}\./);
  assert.match(source, /class="chat-sticker"/);
  assert.match(css, /\.chat-message-media img\.chat-sticker[^\{]*\{[^}]*max-width:min\(160px, 48vw\)/);
  assert.match(css, /\.chat-sticker-dialog::backdrop/);
  assert.match(migration, /'image\/jpeg', 'image\/png', 'image\/webp'/);
  assert.doesNotMatch(source, /image\/gif|image\/webp.*image\/gif/);
});

test("chat emoji picker updates invalidate static page, stylesheet and module caches", async () => {
  const [chatPage, conversationPage, chatEntry, conversationEntry, serviceWorker] = await Promise.all([
    read("chat.html"), read("conversa.html"), read("assets/js/chat.js"), read("assets/js/conversation.js"), read("sw.js")
  ]);
  for (const source of [chatPage, conversationPage, chatEntry, conversationEntry]) assert.match(source, /(notification-bus-20261022|avatar-sync-20261028)/);
  assert.match(serviceWorker, /looply-shell-v7/);
});

test("voice recorder pause and resume exclude paused time and expose accessible controls", async () => {
  const source = await read("src/chat.js");
  assert.equal(voiceRecordingElapsedMs({ startedAt: 1000, pausedAt: 3000, pausedTotal: 0 }, 5000), 2000);
  assert.equal(voiceRecordingElapsedMs({ startedAt: 1000, pausedAt: 0, pausedTotal: 2000 }, 6000), 3000);
  assert.match(source, /data-chat-record-pause aria-pressed="false"/);
  assert.match(source, /state\.recorder\.pause\(\)/);
  assert.match(source, /state\.recorder\.resume\(\)/);
  assert.match(source, /voiceRecordingElapsedMs\(state\)/);
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


test("global incoming calls and the active-chat controller use the same legacy signaling contract", async () => {
  const [runtime, globalListener, callController] = await Promise.all([
    read("src/page-runtime.js"), read("src/global-call-listener.js"), read("src/chat-calls.js")
  ]);
  assert.match(runtime, /setupGlobalCallListener\(supabase, user\.id, null\)/);
  assert.match(globalListener, /from\("conversation_participants"\)/);
  assert.match(globalListener, /config: \{ private: true/);
  assert.match(globalListener, /conversation\.kind !== "direct"/);
  assert.match(globalListener, /looply:pending-call:/);
  assert.match(globalListener, /type, conversationId: call\.conversationId, senderId: userId/);
  assert.match(callController, /restorePendingIncomingCall\(id\)/);
  assert.match(callController, /payload\.type === "answer" && pc && isCaller/);
  assert.match(callController, /type, conversationId: topic, senderId: userId/);
  assert.doesNotMatch(globalListener, /callId: call\.id/);
  assert.doesNotMatch(callController, /callId/);
});

test("private call signaling authorization is limited to direct conversation members", async () => {
  const migration = await read("supabase/migrations/20261018215518_direct_call_signaling_hardening.sql");
  assert.match(migration, /for select\s+to authenticated/i);
  assert.match(migration, /for insert\s+to authenticated/i);
  assert.match(migration, /c\.kind = 'direct'/i);
  assert.match(migration, /cp\.user_id = \(select auth\.uid\(\)\)/i);
});

test("a call accepted from the global notification is restored and handed to the original accept flow", async () => {
  const source = await read("src/chat-calls.js");
  const start = source.indexOf("const restorePendingIncomingCall =");
  const end = source.indexOf("\n  const ensureChannel =", start);
  assert.ok(start >= 0 && end > start, "pending call restoration helper must exist");
  const restore = source.slice(start, end);
  assert.match(restore, /pending\.accepted !== true/);
  assert.match(restore, /pending\.conversationId !== conversationId/);
  assert.match(restore, /window\.setTimeout\(\(\) => \{[\s\S]*?void acceptCall\(\)/);
  assert.match(source, /getUserMedia\(\{ audio: true, video: callMode === "video" \}\)/);
  assert.match(source, /PermissionDeniedError/);
  assert.match(source, /Permita o acesso ao microfone/);
  assert.match(source, /if \(\["NotAllowedError", "PermissionDeniedError"\]\.includes\(error\?\.name\)\)[\s\S]*?return;[\s\S]*?await send\("failed",/);
});

test("caller and receiver exchange offers, answers, and queued ICE candidates using the previously working WebRTC flow", async () => {
  const source = await read("src/chat-calls.js");
  assert.match(source, /const offerPayload = \{/);
  assert.match(source, /description: pc\.localDescription\.toJSON\(\)/);
  assert.match(source, /send\("offer", offerPayload\)/);
  assert.match(source, /offerRetryTimer = window\.setInterval\(/);
  assert.match(source, /payload\.type === "answer" && pc && isCaller/);
  assert.match(source, /await pc\.setRemoteDescription\(payload\.description\)/);
  assert.match(source, /await pc\.setLocalDescription\(answer\)/);
  assert.match(source, /send\("answer", \{ description: pc\.localDescription\.toJSON\(\) \}\)/);
  assert.match(source, /else pendingCandidates\.push\(payload\.candidate\)/);
  assert.match(source, /await pc\.addIceCandidate\(candidate\)/);
});

test("remote audio/video tracks remain attached to the remote stream and the speaker is unmuted", async () => {
  const source = await read("src/chat-calls.js");
  assert.match(source, /let remoteStream = null/);
  assert.match(source, /pc\.ontrack = \(event\) =>/);
  assert.match(source, /remoteStream\.addTrack\(event\.track\)/);
  assert.match(source, /remote\.muted = false/);
  assert.match(source, /remote\.play\(\)/);
});

test("tic-tac-toe shows actual player names and resolves the winner from the winning player ID", async () => {
  const source = await read("src/chat-enhancements.js");
  assert.match(source, /const ownDisplayName = \(\) => root\.querySelector\("\.looply-account strong"\)/);
  assert.match(source, /senderName: ownDisplayName\(\)/);
  assert.match(source, /oName: ownDisplayName\(\)/);
  assert.match(source, /const winnerId = gameState\.winnerId \|\|/);
  assert.doesNotMatch(source, /senderName: root\.querySelector\("\[data-site-header\]"\)\?\.textContent/);
});




test("audio and video call controls remain available and stop media on hangup", async () => {
  const source = await read("src/chat-calls.js");
  const css = await read("assets/css/pages/chat.css");
  assert.match(source, /data-call-audio/);
  assert.match(source, /data-call-video/);
  assert.match(source, /data-call-toggle-mic/);
  assert.match(source, /data-call-toggle-speaker/);
  assert.match(source, /data-call-flip-camera/);
  assert.match(source, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(css, /\.chat-call-backdrop\s*\{\s*position:\s*fixed/);
});

test("chat paperclip picker is isolated from conversation and call click handling", async () => {
  const source = await read("src/chat.js");
  assert.match(source, /data-chat-choose-files/);
  assert.match(source, /root\.addEventListener\("click", \(event\) => \{/);
  assert.match(source, /const input = button\.closest\("\[data-chat-send\]"\)\?\.querySelector\('input\[name="files"\]'\)/);
  assert.match(source, /input\?\.click\(\)/);
  assert.doesNotMatch(source, /const chooseFilesButton = event\.target\.closest/);
});
