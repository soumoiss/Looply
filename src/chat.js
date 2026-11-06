import { icon } from "./icons.js";
import { requestImmediateMessagePush } from "./chat-push-alert.js";
import { premiumChatCardMarkup } from "./chat-premium-cards.js";
import { editGroupCover } from "./group-cover-editor.js";
import { matchesConversationFilter } from "./chat-filter-logic.js";
import { countUnreadNotificationsByConversation } from "./chat-read-receipts.js";
import { cachedSignedUrls, cachedSignedUrl } from "./storage-url-cache.js";
import { stickerCatalogMarkup, bindStickerCatalog, cc0StickerFromMessage } from "./chat-sticker-catalog.js?v=neon-catalog-packs-20261029";
import { notificationBus } from "./notification-bus.js?v=notification-bus-20261022";
import { toggleEmojiPicker } from "./emoji-picker.js";
const fileExtensions = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"],
  ["video/mp4", "mp4"], ["video/webm", "webm"], ["audio/mp4", "mp4"],
  ["audio/mpeg", "mp3"], ["audio/ogg", "ogg"], ["audio/webm", "webm"],
  ["application/pdf", "pdf"], ["text/plain", "txt"], ["text/csv", "csv"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/rtf", "rtf"]
]);
const mimeTypesByExtension = new Map([...fileExtensions].map(([mimeType, extension]) => [extension, mimeType]));
const maxFileSize = 25 * 1024 * 1024;
const maxFilesPerMessage = 8;

let activeConversationId = null;
let realtimeChannel = null;
let realtimeUserId = null;
let stopNotificationChanges = null;
let refreshTimer = null;
let refreshSequence = 0;
let activeThreadRequest = 0;
let conversationSearch = "";
let conversationFilter = "all";
const voiceRecordings = new Map();
export function voiceRecordingElapsedMs(state, now = Date.now()) {
  if (!state || !Number.isFinite(state.startedAt)) return 0;
  const pausedNow = state.pausedAt ? Math.max(0, now - state.pausedAt) : 0;
  return Math.max(0, now - state.startedAt - (state.pausedTotal || 0) - pausedNow);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function compactChatTime(value, now = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"});
  return date.toLocaleDateString("pt-BR", {day:"2-digit",month:"2-digit"});
}
function messageTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "";
}

function formatMessageDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (left, right) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  if (sameDay(date, today)) return "Hoje";
  if (sameDay(date, yesterday)) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
}

export function countUnreadNotifications(notifications = []) {
  return [...countUnreadNotificationsByConversation(notifications).values()].reduce((total, count) => total + count, 0);
}

async function loadUnreadChatNotifications(client, userId, conversationIds) {
  const notifications = [];
  for (let start = 0; start < conversationIds.length; start += 50) {
    const ids = conversationIds.slice(start, start + 50);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.from("chat_notifications")
        .select("conversation_id,read_at")
        .eq("user_id", userId)
        .in("conversation_id", ids)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throw error;
      notifications.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return countUnreadNotificationsByConversation(notifications);
}

export async function loadChatData(client, userId) {
  const [participantResult, notificationResult, profilesResult] = await Promise.all([
    (async () => {
      const rows = [];
      // RLS still decides which conversations are accessible. Pagination
      // prevents a silent 1,000-row or 50-conversation cutoff.
      for (let offset=0; offset<10000; offset+=500) {
        const result = await client.from("conversation_participants")
          .select("conversation_id,last_read_at").eq("user_id",userId)
          .order("conversation_id").range(offset,offset+499);
        if (result.error) return {data:null,error:result.error};
        rows.push(...(result.data || []));
        if ((result.data || []).length < 500) break;
      }
      return {data:rows,error:null};
    })(),
    client.from("chat_notifications").select("id,conversation_id,kind,preview,created_at,read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    client.from("profiles").select("id,username,display_name,avatar_path").order("username").limit(100)
  ]);
  if (participantResult.error) throw participantResult.error;
  if (notificationResult.error) throw notificationResult.error;
  const participants = participantResult.data || [];
  const ids = participants.map((row) => row.conversation_id);
  const unreadByConversation = await loadUnreadChatNotifications(client, userId, ids);
  for (let start = 0; start < ids.length; start += 50) {
    const { data: delivered, error: deliveredError } = await client.rpc("mark_conversations_delivered", { p_conversation_ids: ids.slice(start, start + 50) });
    if (deliveredError || delivered !== true) console.warn("Looply delivery receipt update failed", deliveredError || { message: "conversation_unavailable" });
  }
  let conversations = [];
  let latestMessages = [];
  if (ids.length) {
    for (let start=0; start<ids.length; start+=50) {
      const batch = ids.slice(start,start+50);
      const [conversationResult,latestResult] = await Promise.all([
        client.from("conversations")
          .select("id,kind,subject,created_by,created_at,updated_at,participants:conversation_participants(user_id,profile:profiles!conversation_participants_user_id_fkey(id,username,display_name,avatar_path))")
          .in("id",batch).order("updated_at",{ascending:false}).limit(50),
        client.from("chat_messages")
          .select("conversation_id,body,created_at,sender_id,author:profiles!chat_messages_sender_id_fkey(username,display_name)")
          .in("conversation_id",batch).order("created_at",{ascending:false}).limit(500)
      ]);
      if (conversationResult.error) throw conversationResult.error;
      if (latestResult.error) throw latestResult.error;
      conversations.push(...(conversationResult.data || []));
      latestMessages.push(...(latestResult.data || []));
    }
    conversations.sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
  }
  const latestByConversation = new Map();
  for (const message of latestMessages) if (!latestByConversation.has(message.conversation_id)) latestByConversation.set(message.conversation_id, message);
  const missingPreviews = conversations.filter(c=>!latestByConversation.has(c.id));
  for (let start=0; start<missingPreviews.length; start+=8) {
    await Promise.all(missingPreviews.slice(start,start+8).map(async conversation => {
      const result = await client.from("chat_messages")
        .select("conversation_id,body,created_at,sender_id,author:profiles!chat_messages_sender_id_fkey(username,display_name)")
        .eq("conversation_id",conversation.id).order("created_at",{ascending:false}).limit(1);
      if (result.error) console.warn("Latest chat preview unavailable",conversation.id,result.error);
      else if (result.data?.[0]) latestByConversation.set(conversation.id,result.data[0]);
    }));
  }
  // Order by the most recent real message, not the original creation time
  // or an unrelated group/profile update. Stable tie-breaker avoids jumps.
  const lastActivity = conversation => Date.parse(
    latestByConversation.get(conversation.id)?.created_at || conversation.updated_at || conversation.created_at || 0
  ) || 0;
  conversations.sort((left,right) => lastActivity(right)-lastActivity(left) ||
    String(left.id).localeCompare(String(right.id)));
  const readByConversation = new Map(participants.map((row) => [row.conversation_id, row.last_read_at]));
  const profiles = profilesResult.data || [];
  // The People selector prioritizes contacts who have actually exchanged
  // messages with this user, using the same recency as the conversation list.
  const contactActivity = new Map();
  for(const conversation of conversations){
    if(conversation.kind!=="direct" || !latestByConversation.has(conversation.id))continue;
    const timestamp=lastActivity(conversation);
    for(const participant of conversation.participants||[]){
      if(participant.user_id!==userId)
        contactActivity.set(participant.user_id,Math.max(contactActivity.get(participant.user_id)||0,timestamp));
    }
  }
  profiles.sort((a,b)=>(contactActivity.get(b.id)||0)-(contactActivity.get(a.id)||0) ||
    String(a.display_name||a.username||"").localeCompare(String(b.display_name||b.username||""),"pt-BR"));
  // Both profile search and nested conversation participants hold distinct
  // objects for the same profile ID. Assign signed URLs to EVERY reference,
  // not just the last reference inserted into a Map.
  const profileReferences = [...profiles, ...conversations.flatMap(c =>
    (c.participants || []).map(participant => participant.profile).filter(Boolean))];
  const paths = new Map();
  for (const person of profileReferences) if (person?.id && person.avatar_path)
    paths.set(person.id, person.avatar_path);
  const avatarUrls = new Map();
  await Promise.all([...paths.entries()].map(async ([id,path]) => {
    const signed = await cachedSignedUrl(client, "looply-avatars", path, 1800);
    if (signed?.data?.signedUrl) avatarUrls.set(id, signed.data.signedUrl);
    else if (signed?.error) console.warn("Chat avatar unavailable for profile", id, signed.error);
  }));
  for (const person of profileReferences)
    if (person?.id) person.avatarUrl = avatarUrls.get(person.id) || null;
  // Cache signed sender avatars in the trusted Android WebView's private storage.
  // No image URLs or image bytes are sent to Firebase, and other web origins
  // cannot send avatar-cache messages to the native receiver.
  if(typeof window!=="undefined"&&window.LooplyAvatarCache?.postMessage){
    for(const [id,url] of avatarUrls){
      if(url)try{window.LooplyAvatarCache.postMessage(JSON.stringify({userId:id,url}));}catch{}
    }
  }
  const groupIds = conversations.filter(c => c.kind === "group").map(c => c.id);
  const covers = new Map();
  if (groupIds.length) {
    const {data:rows,error} = await client.from("group_covers")
      .select("conversation_id,storage_path").in("conversation_id",groupIds);
    if (error) console.warn("Chat group covers unavailable",error);
    else await Promise.all((rows || []).map(async row => {
      const signed = await cachedSignedUrl(client,"looply-chat",row.storage_path,1800);
      if (signed?.data?.signedUrl) covers.set(row.conversation_id,signed.data.signedUrl);
    }));
  }
  return {
    conversations: conversations.map((conversation) => ({
      ...conversation,
      coverUrl: covers.get(conversation.id) || null,
      lastMessage: latestByConversation.get(conversation.id) || null,
      lastReadAt: readByConversation.get(conversation.id),
      unreadCount: unreadByConversation.get(conversation.id) || 0
    })),
    notifications: notificationResult.data || [],
    profiles,
    profilesError: profilesResult.error
  };
}

function conversationLabel(conversation, userId) {
  if (conversation.kind === "letter") return `Carta · ${conversation.subject || "para Peixinho"}`;
  if (conversation.kind === "group") return conversation.subject || "Grupo";
  const other = (conversation.participants || []).find((row) => row.user_id !== userId)?.profile;
  return other ? `${other.display_name || other.username} · @${other.username}` : "Conversa privada";
}

function conversationAvatar(conversation, userId) {
  if (conversation.kind === "letter") return `<span class="chat-conversation-avatar" aria-hidden="true">✉</span>`;
  if (conversation.kind === "group") return conversation.coverUrl
    ? `<img class="chat-conversation-avatar chat-group-avatar" data-group-cover-id="${escapeHtml(conversation.id)}" src="${escapeHtml(conversation.coverUrl)}" alt="Foto do grupo" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="chat-conversation-avatar chat-group-avatar" role="img" aria-label="Conversa em grupo">${icon("users")}</span>`;
  const profile = (conversation.participants || []).find((row) => row.user_id !== userId)?.profile;
  const initial = (profile?.display_name || profile?.username || "?").slice(0, 1).toLocaleUpperCase("pt-BR");
  return profile?.avatarUrl
    ? `<img class="chat-conversation-avatar" data-profile-avatar-id="${escapeHtml(profile.id)}" src="${escapeHtml(profile.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="chat-conversation-avatar" data-profile-avatar-id="${escapeHtml(profile?.id || "")}" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

function conversationPreview(conversation, userId) {
  const message = conversation.lastMessage;
  if (!message) return conversation.kind === "letter" ? "Carta privada" : "Nenhuma mensagem";
  const authorName = message.sender_id === userId ? "Você" : conversation.kind === "group" ? (message.author?.display_name || message.author?.username || "Membro") : "";
  const author = authorName ? `${authorName}: ` : "";
  const text = String(message.body || "").trim();
  return `${author}${text || "Mídia"}`.slice(0, 68);
}

function notificationsMarkup(notifications) {
  const unread = notifications.filter((item) => !item.read_at).length;
  if (!notifications.length) return `<p class="chat-empty">Nenhuma notificação</p>`;
  return `<div class="chat-notification-list">${notifications.slice(0, 5).map((item) => `<a class="chat-notification ${item.read_at ? "is-read" : ""}" href="conversa.html?id=${encodeURIComponent(item.conversation_id)}" data-chat-open="${escapeHtml(item.conversation_id)}">
    <span class="chat-notification-kind">${item.kind === "letter" ? "Carta" : "Mensagem"}</span><span>${escapeHtml(item.preview)}</span><time>${escapeHtml(formatDate(item.created_at))}</time>
  </a>`).join("")}</div><span class="chat-count">${unread} não lida${unread === 1 ? "" : "s"}</span>`;
}

export function chatMarkup(data, userId) {
  if (data.error) return `<section class="chat-area" data-chat-area aria-labelledby="chatTitle"><div class="chat-heading"><div><span class="section-kicker">Mensagens</span><h2 id="chatTitle">Chats</h2></div></div><div class="chat-empty" role="alert">Não foi possível carregar as conversas. Atualize a página e tente novamente.</div></section>`;
  const conversations = data.conversations.length
    ? data.conversations.map((conversation) => `<a class="chat-conversation ${conversation.id === activeConversationId ? "is-active" : ""}" href="conversa.html?id=${encodeURIComponent(conversation.id)}" data-chat-open="${escapeHtml(conversation.id)}" data-chat-kind="${escapeHtml(conversation.kind || "")}" data-chat-unread-count="${Number(conversation.unreadCount) || 0}">
        ${conversationAvatar(conversation, userId)}
        <span class="chat-conversation-copy"><span class="chat-model-row-title"><strong>${escapeHtml(conversationLabel(conversation, userId).split(" · @")[0])}</strong><time>${escapeHtml(compactChatTime(conversation.lastMessage?.created_at || conversation.updated_at))}</time></span><span class="chat-model-row-preview"><small>${escapeHtml(conversationPreview(conversation, userId))}</small></span></span>
        ${conversation.unreadCount ? `<span class="chat-unread">${conversation.unreadCount}</span>` : ""}
      </a>`).join("")
    : `<p class="chat-empty">Nenhuma conversa. Inicie uma conversa ou escreva uma carta.</p>`;
  const conversationTools = `<div class="chat-conversation-tools">
    <label class="visually-hidden" for="chatConversationSearch">Buscar conversa</label>
    <div class="chat-model-search">${icon("search")}<input id="chatConversationSearch" type="search" maxlength="100" placeholder="Buscar conversa ou última mensagem" value="${escapeHtml(conversationSearch)}" data-chat-conversation-search></div>
    <div class="chat-premium-stories-slot" data-chat-premium-stories></div><div class="chat-filter-tabs" role="group" aria-label="Filtrar conversas">
      <button class="chat-filter-chip" type="button" data-chat-filter="all" aria-pressed="${conversationFilter === "all"}">Todas</button><button class="chat-filter-chip" type="button" data-chat-filter="unread" aria-pressed="false">Não lidas</button><button class="chat-filter-chip" type="button" data-chat-filter="groups" aria-pressed="false">Grupos</button><button class="chat-filter-chip" type="button" data-chat-filter="favorites" aria-pressed="false">Favoritas</button><button class="chat-filter-chip" type="button" data-chat-filter="archived" aria-pressed="false">Arquivadas</button>
    </div>
  </div>`;
  const people = (data.profiles || []).filter((profile) => profile.id !== userId).map((profile) => `<article class="chat-person">
    ${profile.avatarUrl ? `<img class="chat-person-avatar" data-profile-avatar-id="${escapeHtml(profile.id)}" src="${escapeHtml(profile.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="chat-person-avatar" data-profile-avatar-id="${escapeHtml(profile.id)}" aria-hidden="true">${escapeHtml((profile.display_name || profile.username || "?").slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>`}
    <span><a href="perfil.html?usuario=${encodeURIComponent(profile.id)}"><strong data-profile-name-id="${escapeHtml(profile.id)}">${escapeHtml(profile.display_name || profile.username)}</strong><small>@${escapeHtml(profile.username)}</small></a></span>
    <button class="text-button" type="button" data-chat-start="${escapeHtml(profile.id)}">Conversar</button>
  </article>`).join("");
  const searchMessage = data.profilesError
    ? `<p class="chat-empty" role="alert">Não foi possível carregar os perfis para iniciar uma conversa.</p>`
    : `<div class="chat-people-list" data-chat-people>${people || `<p class="chat-empty">Nenhum outro perfil está visível agora.</p>`}</div>`;
  const groupProfiles = (data.profiles || []).filter((profile) => profile.id !== userId);
  const groupOptions = groupProfiles.map((profile) => {
    const name = profile.display_name || profile.username;
    const initial = String(name || "?").slice(0, 1).toLocaleUpperCase("pt-BR");
    const avatar = profile.avatarUrl
      ? `<img class="chat-group-option-avatar" data-profile-avatar-id="${escapeHtml(profile.id)}" src="${escapeHtml(profile.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="chat-group-option-avatar" data-profile-avatar-id="${escapeHtml(profile.id)}" aria-hidden="true">${escapeHtml(initial)}</span>`;
    return `<label class="chat-group-option">${avatar}<span><strong>${escapeHtml(name)}</strong><small>@${escapeHtml(profile.username)}</small></span><input type="checkbox" name="memberIds" value="${escapeHtml(profile.id)}" aria-label="Adicionar ${escapeHtml(name)} ao grupo"></label>`;
  }).join("");
  const groupCompose = `<details class="chat-panel group-compose-panel"><summary>Criar grupo</summary>
    <form class="chat-group-form" data-chat-group-create>
      <div class="field"><label for="chatGroupSubject">Nome do grupo</label><input id="chatGroupSubject" name="subject" type="text" maxlength="120" required placeholder="Ex.: Amigos"></div>
      <button type="button" class="chat-group-cover-pick" data-chat-create-cover-editor><span class="chat-group-cover-preview" data-chat-create-cover-preview aria-hidden="true">${icon("users")}</span><span><strong>Foto do grupo (opcional)</strong><small>Galeria, câmera, recortar e zoom</small></span></button><input id="chatGroupCover" class="visually-hidden" name="groupCover" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"><fieldset class="group-member-options"><legend>Escolha pelo menos duas pessoas</legend>${groupOptions || `<p class="chat-empty">Não há outros perfis disponíveis.</p>`}</fieldset>
      <button class="primary-button compact-button" type="submit"${groupProfiles.length < 2 ? " disabled" : ""}>Criar grupo</button>
      <span class="form-status" data-status role="status" aria-live="polite"></span>
    </form>
  </details>`;
  return `<section class="chat-area chat-premium" data-chat-area aria-labelledby="chatTitle">
    <div class="chat-layout">
      <aside class="chat-sidebar">
        <div class="chat-heading"><div><span class="section-kicker">Mensagens</span><h2 id="chatTitle">Conversas</h2></div><span class="chat-live visually-hidden" data-chat-live role="status">Ao vivo</span><button class="chat-premium-head-action" type="button" data-chat-premium-new aria-label="Nova conversa">${icon("plus")}</button><button class="chat-premium-head-action" type="button" data-chat-premium-new-group aria-label="Criar grupo">${icon("users")}</button></div>
        <section class="chat-panel" aria-label="Suas conversas"><div class="chat-panel-heading"><h3>Conversas</h3><span>${data.conversations.length}</span></div>${conversationTools}<div class="chat-conversation-list" data-chat-conversations>${conversations}<p class="chat-empty chat-conversation-no-match" data-chat-no-matches hidden>Nenhuma conversa corresponde ao filtro.</p></div></section>
        <details class="chat-panel chat-search-panel"><summary>Encontrar uma pessoa</summary>
          <form class="chat-search-form" data-chat-search><label class="visually-hidden" for="chatSearch">Username</label><input id="chatSearch" name="query" type="text" minlength="3" maxlength="30" pattern="[A-Za-z0-9_]{3,30}" required placeholder="Buscar pelo username"><button class="text-button" type="submit">Buscar</button></form>
          ${searchMessage}<button type="button" class="text-button" data-chat-premium-legacy-letter>Escrever carta para Peixinho</button>
        </details>
        ${groupCompose}
        <details class="chat-panel letter-compose-panel"><summary>Escrever uma carta para Peixinho</summary>
          <form class="letter-form" data-letter-send><div class="field"><label for="letterSubject">Assunto</label><input id="letterSubject" name="subject" maxlength="120" required placeholder="Um título para sua carta"></div>
            <div class="field"><label for="letterBody">Mensagem</label><textarea id="letterBody" name="body" maxlength="5000" rows="5" required placeholder="Escreva sua carta"></textarea></div>
            <p class="field-hint">Somente você e Peixinho poderão abrir esta carta. A resposta continuará na conversa privada.</p>
            <button class="primary-button compact-button" type="submit">Enviar carta ${icon("send")}</button><span class="form-status" data-status role="status" aria-live="polite"></span>
          </form>
        </details>
        <details class="chat-panel chat-notifications-panel"><summary>Notificações <span class="chat-summary-unread">${data.notifications.filter((item) => !item.read_at).length}</span></summary>${notificationsMarkup(data.notifications)}</details>
      </aside>
      <section class="chat-thread-panel" aria-label="Mensagens da conversa"><div class="chat-thread" data-chat-thread><div class="chat-premium-placeholder"><div class="chat-premium-placeholder-icon">${icon("chat")}</div><strong>Suas mensagens</strong><span>Selecione uma conversa para compartilhar momentos.</span><button type="button" data-chat-premium-new>Nova conversa</button></div></div></section>
    </div>
  </section>`;
}

function setStatus(form, message, kind = "success") {
  const status = form.querySelector("[data-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function normalizedAttachment(file) {
  const suppliedType = String(file.type || "").split(";")[0].toLocaleLowerCase("en-US");
  const extension = String(file.name || "").split(".").pop()?.toLocaleLowerCase("en-US") || "";
  const mimeType = fileExtensions.has(suppliedType) ? suppliedType : mimeTypesByExtension.get(extension);
  if (!mimeType) return null;
  // Android document providers sometimes omit File.type for content:// URIs. A new
  // File preserves the bytes while supplying the validated type used by Storage.
  return suppliedType === mimeType ? file : new File([file], file.name || `arquivo.${fileExtensions.get(mimeType)}`, {
    type: mimeType,
    lastModified: file.lastModified || Date.now()
  });
}

function selectedFiles(formData) {
  const files = formData.getAll("files")
    .filter((file) => file instanceof File && file.size > 0)
    .map(normalizedAttachment);
  if (files.some((file) => !file) || files.length > maxFilesPerMessage || files.some((file) => file.size > maxFileSize)) {
    throw new Error("unsupported attachment");
  }
  return files;
}

export function appendRecordedAudio(form, formData) {
  // The native WebView might reject DataTransfer/input.files even though
  // MediaRecorder produced a valid File. Sending must not silently omit it.
  const file = form?._looplyRecordedFile;
  if (!(file instanceof File) || file.size <= 0) return false;
  const alreadyIncluded = formData.getAll("files").some((existing) =>
    existing instanceof File && existing.name === file.name &&
    existing.size === file.size && existing.lastModified === file.lastModified);
  if (!alreadyIncluded) formData.append("files", file, file.name);
  return !alreadyIncluded;
}

function formatRecordingTime(milliseconds) {
  const total = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function setRecordingFile(form, file, remove = false) {
  const input = form.querySelector('input[name="files"]');
  if (!input) return;
  // Some Android System WebView versions do not permit setting input.files.
  // Keep the recording on the form and inject it into FormData at submit time
  // as a safe fallback instead of silently sending a text-only message.
  if (typeof DataTransfer !== "function") return;
  try {
    const transfer = new DataTransfer();
    for (const existing of input.files) {
      const isRecorded = existing.name === file?.name && existing.lastModified === file?.lastModified && existing.size === file?.size;
      if (!isRecorded) transfer.items.add(existing);
    }
    if (file && !remove) transfer.items.add(file);
    input.files = transfer.files;
  } catch (error) {
    console.warn("Looply WebView file picker does not support programmatic audio attachment", error?.name || "unsupported");
  }
}

function cancelVoiceRecording(form) {
  const state = voiceRecordings.get(form);
  if (state) {
    state.cancelled = true;
    if (state.timer) clearInterval(state.timer);
    if (state.recorder.state !== "inactive") state.recorder.stop();
    state.stream.getTracks().forEach((track) => track.stop());
    voiceRecordings.delete(form);
  }
  const recordedFile = form._looplyRecordedFile;
  if (recordedFile) {
    setRecordingFile(form, recordedFile, true);
    delete form._looplyRecordedFile;
  }
  const preview = form.querySelector("[data-chat-record-preview]");
  if (preview?.src?.startsWith("blob:")) URL.revokeObjectURL(preview.src);
  if (preview) preview.removeAttribute("src");
  form.querySelector("[data-chat-recording]").hidden = true;
  form.querySelector("[data-chat-record-ready]").hidden = true;
  const pauseButton = form.querySelector("[data-chat-record-pause]");
  if (pauseButton) { pauseButton.textContent = "Pausar"; pauseButton.setAttribute("aria-pressed", "false"); }
  const startButton = form.querySelector("[data-chat-record-start]");
  startButton.hidden = false;
  startButton.textContent = "Gravar áudio";
  setStatus(form, "Gravação descartada.");
}

async function startVoiceRecording(form) {
  const startButton = form.querySelector("[data-chat-record-start]");
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus(form, "Gravação de áudio indisponível neste navegador.", "error");
    return;
  }
  if (!window.isSecureContext) {
    setStatus(form, "A gravação exige uma conexão HTTPS.", "error");
    return;
  }
  const ready = form.querySelector("[data-chat-record-ready]");
  const oldPreview = form.querySelector("[data-chat-record-preview]");
  if (form._looplyRecordedFile) {
    setRecordingFile(form, form._looplyRecordedFile, true);
    delete form._looplyRecordedFile;
  }
  if (oldPreview?.src?.startsWith("blob:")) URL.revokeObjectURL(oldPreview.src);
  oldPreview?.removeAttribute("src");
  ready.hidden = true;
  startButton.disabled = true;
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!form.isConnected) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const supportedTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
    const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported?.(type));
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const state = { stream, recorder, chunks: [], startedAt: Date.now(), pausedAt: 0, pausedTotal: 0, timer: null, cancelled: false };
    voiceRecordings.set(form, state);
    recorder.addEventListener("dataavailable", (event) => { if (event.data?.size) state.chunks.push(event.data); });
    recorder.addEventListener("error", () => {
      cancelVoiceRecording(form);
      setStatus(form, "Não foi possível gravar o áudio.", "error");
    }, { once: true });
    recorder.addEventListener("stop", () => {
      if (state.cancelled) return;
      const actualType = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
      const extension = fileExtensions.get(actualType);
      const blob = new Blob(state.chunks, { type: actualType });
      if (!extension || !blob.size || blob.size > maxFileSize) {
        cancelVoiceRecording(form);
        setStatus(form, "O formato ou tamanho do áudio não é compatível.", "error");
        return;
      }
      const file = new File([blob], `gravacao-${Date.now()}.${extension}`, { type: actualType, lastModified: Date.now() });
      form._looplyRecordedFile = file;
      setRecordingFile(form, file);
      const preview = form.querySelector("[data-chat-record-preview]");
      preview.src = URL.createObjectURL(blob);
      form.querySelector("[data-chat-recording]").hidden = true;
      ready.hidden = false;
      const pauseButton = form.querySelector("[data-chat-record-pause]");
      if (pauseButton) { pauseButton.textContent = "Pausar"; pauseButton.setAttribute("aria-pressed", "false"); }
      startButton.hidden = false;
      startButton.textContent = "Gravar outro áudio";
      if (state.timer) clearInterval(state.timer);
      state.stream.getTracks().forEach((track) => track.stop());
      voiceRecordings.delete(form);
      setStatus(form, "Áudio pronto para enviar.");
    }, { once: true });
    recorder.start();
    form.querySelector("[data-chat-recording]").hidden = false;
    form.querySelector("[data-chat-record-time]").textContent = "00:00";
    startButton.hidden = true;
    state.timer = setInterval(() => {
      const time = form.querySelector("[data-chat-record-time]");
      if (time) time.textContent = formatRecordingTime(voiceRecordingElapsedMs(state));
    }, 250);
    setStatus(form, "Gravando áudio…", "info");
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    console.error("Looply microphone access failed", error);
    const microphoneErrors = {
      NotAllowedError: "O acesso ao microfone foi negado. Ative a permissão Microfone nas configurações do Looply.",
      PermissionDeniedError: "O acesso ao microfone foi negado. Ative a permissão Microfone nas configurações do Looply.",
      NotFoundError: "Nenhum microfone disponível foi encontrado neste aparelho.",
      NotReadableError: "O microfone está ocupado ou indisponível. Feche outros aplicativos que estejam gravando.",
      AbortError: "A captura de áudio foi interrompida. Tente gravar novamente.",
      NotSupportedError: "O formato de gravação não é compatível com este Android.",
      SecurityError: "A origem da página não está autorizada a acessar o microfone."
    };
    setStatus(form, microphoneErrors[error?.name] ||
      "Não foi possível iniciar a gravação. Confira o microfone e tente novamente.", "error");
  } finally {
    startButton.disabled = false;
  }
}

async function uploadResumable(client, path, file, onProgress) {
  // All binary data goes to the authenticated Neon Storage service.
  // Supabase TUS endpoints, keys, and retry SDKs are not used.
  const { data, error } = await client.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("session expired");
  if (!file?.size || file.size > 25 * 1024 * 1024) throw new Error("unsupported file");
  onProgress?.(0);
  const { data: uploaded, error: uploadError } = await client.storage.from("looply-chat").upload(path, file, {
    contentType: file.type || "application/octet-stream", upsert: false
  });
  if (uploadError) throw uploadError;
  if (uploaded?.path !== path) throw new Error("neon_storage_unconfirmed");
  onProgress?.(100);
}

async function normalizeGroupCover(file) {
  if (!(file instanceof File) || !["image/jpeg","image/png","image/webp"].includes(file.type) ||
      !file.size || file.size > 10*1024*1024)
    throw Error("invalid_group_cover");
  let image;
  let objectUrl;
  try {
    if (typeof createImageBitmap === "function") image = await createImageBitmap(file);
    else {
      objectUrl = URL.createObjectURL(file);
      image = new Image();
      image.src = objectUrl;
      await image.decode();
    }
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    if (!width || !height) throw Error("invalid_group_cover");
    const size = 512, scale = Math.min(1,size/Math.max(width,height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(width*scale));
    canvas.height = Math.max(1,Math.round(height*scale));
    canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
    const blob = await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",0.83));
    if (!blob?.size) throw Error("invalid_group_cover");
    return new File([blob],"capa-grupo.webp",{type:"image/webp"});
  } finally {
    image?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function voiceWaveBars(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const bars = [];
  for (let i = 0; i < 38; i++) {
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    const envelope = .5 + .5 * Math.sin(Math.PI * (i + 1) / 39);
    bars.push(Math.round(16 + 84 * ((h % 1000) / 1000) * envelope));
  }
  return bars.map((value) => `<i style="--h:${value}%"></i>`).join("");
}
function voiceMessageMarkup(url, fileName, media) {
  const bars = voiceWaveBars(String(media.storage_path || media.id || fileName));
  return `<div class="chat-audio-player chat-voice" data-chat-voice><audio src="${url}" preload="metadata" aria-label="${fileName}"></audio><button type="button" class="chat-voice-play" data-chat-voice-toggle aria-label="Ouvir áudio" aria-pressed="false"><span class="chat-voice-icon-play">${icon("play")}</span><span class="chat-voice-icon-pause">${icon("pause")}</span></button><div class="chat-voice-track" data-chat-voice-seek role="slider" tabindex="0" aria-label="Posição do áudio" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="chat-voice-wave" aria-hidden="true">${bars}</span><span class="chat-voice-wave is-fill" aria-hidden="true">${bars}</span><span class="chat-voice-knob" aria-hidden="true"></span></div><span class="chat-voice-time" data-chat-voice-time>0:00</span><button type="button" class="chat-voice-rate" data-chat-voice-rate aria-label="Velocidade do áudio">1×</button></div>`;
}

function renderMedia(media) {
  if (!media.signedUrl) return `<span class="chat-media-unavailable">Anexo temporariamente indisponível.</span>`;
  const url = escapeHtml(media.signedUrl);
  const fileName = escapeHtml(media.file_name);
  if (media.mime_type.startsWith("image/")) {
    const sticker = media.file_name?.startsWith("sticker-") === true;
    return `<a class="chat-image-link${sticker ? " chat-sticker-link" : ""}" href="${url}" target="_blank" rel="noopener noreferrer"${sticker ? ' aria-label="Figurinha"' : ""}><img${sticker ? ' class="chat-sticker"' : ""} src="${url}" alt="${sticker ? "Figurinha" : fileName}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`;
  }
  if (media.mime_type.startsWith("video/")) return `<video src="${url}" controls preload="metadata" aria-label="${fileName}"></video>`;
  if (media.mime_type.startsWith("audio/")) return voiceMessageMarkup(url, fileName, media);
  return `<a class="chat-file-link" href="${url}" target="_blank" rel="noopener noreferrer">${icon("external")} ${fileName}</a>`;
}

async function loadThread(client, conversationId, before = null) {
  let messageQuery = client.from("chat_messages")
    .select("id,conversation_id,sender_id,reply_to,body,created_at,delivered_at,read_at,author:profiles!chat_messages_sender_id_fkey(id,username,display_name,avatar_path),media:chat_media!chat_media_message_fk(id,storage_path,mime_type,file_name,byte_size)")
    .eq("conversation_id", conversationId);
  if (before) messageQuery = messageQuery.lt("created_at", before);
  const [messageResult, participantResult, conversationResult] = await Promise.all([
    messageQuery.order("created_at", { ascending: false }).limit(100),
    client.from("conversation_participants").select("user_id,last_read_at,profile:profiles!conversation_participants_user_id_fkey(id,username,display_name,avatar_path)").eq("conversation_id", conversationId),
    client.from("conversations").select("id,kind,subject,created_by").eq("id", conversationId).maybeSingle()
  ]);
  if (messageResult.error) throw messageResult.error;
  if (participantResult.error) throw participantResult.error;
  if (conversationResult.error) throw conversationResult.error;
  if (!conversationResult.data) throw new Error("Conversation unavailable");
  const messages = (messageResult.data || []).reverse();
  if(messages.length){
    const ids=messages.map(message=>message.id);
    const {data:reactions,error:reactionsError}=await client.from("chat_message_reactions")
      .select("message_id,user_id,emoji")
      .eq("conversation_id",conversationId)
      .in("message_id",ids)
      .limit(1000);
    if(reactionsError)console.warn("Chat premium reactions unavailable",reactionsError);
    const reactionsById=new Map();
    for(const item of reactions||[]){
      const list=reactionsById.get(item.message_id)||[];
      list.push(item);reactionsById.set(item.message_id,list);
    }
    for(const message of messages)message.reactions=reactionsById.get(message.id)||[];
  }
  if (messages.length) {
    const {data:stickerMessages,error:stickersError} = await client.from("chat_sticker_messages")
      .select("message_id,sticker_id").eq("conversation_id",conversationId)
      .in("message_id",messages.map(message => message.id)).limit(100);
    if (stickersError) console.warn("Chat sticker references could not load",stickersError);
    else {
      const ids = [...new Set((stickerMessages || []).map(row=>row.sticker_id))];
      if (ids.length) {
        const {data:items,error:catalogError} = await client.from("sticker_catalog")
          .select("id,title,asset_path,storage_path").in("id",ids);
        if (catalogError) console.warn("Chat sticker images could not load",catalogError);
        else {
          await Promise.all((items || []).filter(item=>/^stickers\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(item.storage_path||""))
            .map(async item => {
              const result=await cachedSignedUrl(client,"looply-stickers",item.storage_path,1800);
              item.imageUrl=result?.data?.signedUrl||null;
            }));
          const byId = new Map((items || []).map(item=>[item.id,item]));
          const byMessage = new Map((stickerMessages || []).map(item=>[item.message_id,byId.get(item.sticker_id)]));
          for (const message of messages) message.sticker = byMessage.get(message.id) || null;
        }
      }
    }
  }
  if (conversationResult.data.kind === "group") {
    const {data:cover,error:coverError} = await client.from("group_covers")
      .select("storage_path").eq("conversation_id",conversationId).maybeSingle();
    if (!coverError && cover?.storage_path) {
      const signed = await cachedSignedUrl(client,"looply-chat",cover.storage_path,1800);
      conversationResult.data.coverUrl = signed?.data?.signedUrl || null;
    } else if (coverError) console.warn("Chat group cover unavailable",coverError);
  }
  // Show the original story in both participants' chat histories without
  // replacing the actual message body. The link still obeys story visibility.
  if (messages.length) {
    const { data: links, error: linksError } = await client.from("story_replies")
      .select("message_id,story_id").eq("conversation_id", conversationId)
      .in("message_id", messages.map(message => message.id)).limit(100);
    if (!linksError) {
      const byMessage = new Map((links || []).map(link => [link.message_id, link.story_id]));
      for (const message of messages) message.storyId = byMessage.get(message.id) || null;
    } else {
      console.warn("Looply story reply context could not load.", linksError);
    }
  }
  const media = messages.flatMap((message) => message.media || []);
  if (media.length) {
    const { data: signed, error: signedError } = await cachedSignedUrls(client, "looply-chat", media.map((item) => item.storage_path), 1800);
    if (!signedError && signed) media.forEach((item, index) => { item.signedUrl = signed[index]?.signedUrl || null; });
  }
  return { messages, participants: participantResult.data || [], conversation: conversationResult.data };
}

function olderMessagesButton(conversationId, oldestMessage) {
  return `<button class="chat-load-older" type="button" data-chat-load-older data-conversation-id="${escapeHtml(conversationId)}" data-before="${escapeHtml(oldestMessage.created_at)}">Carregar mensagens anteriores</button>`;
}

// Photos and stickers have their own visual surface; ordinary text, video and
// document messages keep the standard message bubble.
export function isVisualOnlyChatMessage(message, hasSticker = false) {
  const media = Array.isArray(message?.media) ? message.media : [];
  return Boolean(hasSticker) || (media.length > 0 &&
    media.every(item => typeof item?.mime_type === "string" && item.mime_type.startsWith("image/")));
}
function isAttachmentPlaceholder(body) {
  return ["", "Compartilhou arquivos.", "Figurinha", "Mensagem de voz", "Mensagem de voz.", "Enviou um áudio", "Enviou um áudio.", "Áudio", "Áudio enviado"].includes(String(body ?? "").trim());
}

export function threadMarkup(messages, userId, peerReadAt = null, peerProfile = null, participants = [], isGroup = false) {
  if (!messages.length) return `<div class="chat-empty"><strong>Esta conversa está pronta.</strong><span>Envie a primeira mensagem.</span></div>`;
  const byId = new Map(messages.map((message) => [message.id, message]));
  let lastDay = "";
  return messages.map((message) => {
    const day = formatMessageDay(message.created_at);
    const daySeparator = day && day !== lastDay ? `<div class="chat-date-separator"><span>${escapeHtml(day)}</span></div>` : "";
    lastDay = day || lastDay;
    const parent = message.reply_to ? byId.get(message.reply_to) : null;
    const replyContext = message.reply_to ? `<small class="chat-reply-preview">↳ ${escapeHtml(parent ? (parent.body || "mensagem").slice(0, 120) : "Respondeu a uma mensagem anterior")}</small>` : "";
    const storyContext = message.storyId
      ? `<a class="chat-reply-preview" href="home.html?storyId=${encodeURIComponent(message.storyId)}">↳ Story respondido</a>`
      : "";
    const bundledSticker = cc0StickerFromMessage(message.body);
    const stickerSource = bundledSticker?.asset_path
      ? bundledSticker.asset_path
      : /^assets\/stickers\/[a-z0-9_-]{3,80}\.svg$/.test(message.sticker?.asset_path||"")
      ? message.sticker.asset_path
      : /^stickers\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(message.sticker?.storage_path||"")
        && /^https:\/\//.test(message.sticker?.imageUrl||"")
          ? message.sticker.imageUrl : "";
    const sticker = stickerSource
      ? `<img class="chat-catalog-message" src="${escapeHtml(stickerSource)}" alt="Figurinha: ${escapeHtml(bundledSticker?.title || message.sticker?.title || "Looply")}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : message.sticker?.storage_path ? `<span class="chat-media-unavailable">Figurinha indisponível.</span>` : "";
    const premiumCard = premiumChatCardMarkup(message.body);
    const visualOnly = isVisualOnlyChatMessage(message, Boolean(sticker));
    const mediaList = Array.isArray(message.media) ? message.media : [];
    const audioOnly = mediaList.length > 0 && mediaList.every((item) => String(item?.mime_type || "").startsWith("audio/"));
    const noteCard = String(premiumCard || "").includes("chat-premium-note-card");
    const bare = visualOnly || audioOnly || noteCard;
    const hideVisualPlaceholder = Boolean(sticker) || ((visualOnly || audioOnly) && isAttachmentPlaceholder(message.body));
    const isMine = message.sender_id === userId;
    const authorProfile = participants.find((participant) => participant.user_id === message.sender_id)?.profile || message.author || peerProfile;
    const avatarLabel = (authorProfile?.display_name || authorProfile?.username || "?").slice(0, 1).toLocaleUpperCase("pt-BR");
    const avatar = !isMine && authorProfile ? (authorProfile.avatarUrl
      ? `<img class="chat-message-avatar" data-profile-avatar-id="${escapeHtml(authorProfile.id)}" src="${escapeHtml(authorProfile.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="chat-message-avatar" data-profile-avatar-id="${escapeHtml(authorProfile.id)}" aria-hidden="true">${escapeHtml(avatarLabel)}</span>`) : "";
    const readCount = isGroup ? participants.filter((participant) => participant.user_id !== userId && participant.last_read_at && new Date(participant.last_read_at) >= new Date(message.created_at)).length : 0;
    const readTotal = Math.max(0, participants.length - 1);
    const groupReadText = readCount === readTotal && readTotal ? "Lida por todos" : readCount ? `Lida por ${readCount} de ${readTotal}` : "Enviada";
    const deliveryLabel = isGroup ? groupReadText : message.read_at ? "Lida" : message.delivered_at ? "Entregue" : "Enviada";
    const delivery = isMine ? `<small class="chat-delivery">${deliveryLabel}</small>` : "";
    const reactionSummary=Array.isArray(message.reactions)&&message.reactions.length
      ? '<div class="chat-premium-reactions" aria-label="Reações à mensagem">'+
        [...new Set(message.reactions.map(r=>r.emoji))]
          .filter(emoji=>["❤️","😂","😮","😢","🙏","👍"].includes(emoji))
          .map(emoji=>{
            const count=message.reactions.filter(r=>r.emoji===emoji).length;
            const selected=message.reactions.some(r=>r.emoji===emoji&&r.user_id===userId);
            return '<button class="chat-premium-reaction-pill'+(selected?' is-selected':'')+
              '" type="button" data-chat-premium-reaction-existing="'+emoji+
              '" data-chat-premium-message-id="'+escapeHtml(message.id)+
              '" aria-pressed="'+String(selected)+'" aria-label="'+emoji+' '+count+
              ' reação(ões)">'+emoji+' <span>'+count+'</span></button>';
          }).join("")+'</div>' : "";

    return `${daySeparator}<div data-message-row-id="${escapeHtml(message.id)}" class="chat-message-row ${isMine ? "is-mine" : "is-theirs"}">${avatar}<article class="chat-message ${isMine ? "is-mine" : ""}${visualOnly ? " is-visual-only" : ""}${bare ? " is-bare" : ""}${audioOnly ? " is-audio-only" : ""}${sticker ? " is-sticker" : ""}${noteCard ? " is-note" : ""}">
    <div class="chat-bubble"><div class="chat-message-meta"><a href="perfil.html?usuario=${encodeURIComponent(message.sender_id)}"><strong data-profile-name-id="${escapeHtml(message.sender_id)}">${escapeHtml(message.sender_id === userId ? "Você" : authorProfile?.display_name || authorProfile?.username || "Perfil restrito")}</strong></a><time datetime="${escapeHtml(message.created_at)}" title="${escapeHtml(formatDate(message.created_at))}">${escapeHtml(messageTime(message.created_at))}</time></div>
    ${replyContext}${storyContext}${sticker}${premiumCard}<p data-chat-message-body${hideVisualPlaceholder || premiumCard ? ' class="visually-hidden"' : ""}>${escapeHtml(message.body)}</p><form class="chat-message-edit" data-chat-edit-message data-message-id="${escapeHtml(message.id)}" data-conversation-id="${escapeHtml(message.conversation_id)}" hidden><label class="visually-hidden" for="edit-message-${escapeHtml(message.id)}">Editar mensagem</label><textarea id="edit-message-${escapeHtml(message.id)}" name="body" maxlength="5000" required>${escapeHtml(message.body)}</textarea><div><button class="chat-reply-button" type="submit">Salvar</button><button class="chat-reply-button" type="button" data-chat-edit-cancel>Cancelar</button></div><p class="form-status" data-status role="status" aria-live="polite"></p></form>${message.media?.length ? `<div class="chat-message-media">${message.media.map(renderMedia).join("")}</div>` : ""}${delivery}</div>${reactionSummary}
    <button type="button" class="chat-message-menu chat-icon" data-chat-message-menu aria-label="Opções da mensagem" aria-expanded="false">${icon("more")}</button><div class="chat-message-actions-inline" hidden><button class="chat-premium-react-trigger" type="button" data-chat-premium-react="${escapeHtml(message.id)}" aria-label="Reagir à mensagem">♡</button>${isMine ? `<button class="chat-reply-button" type="button" data-chat-edit-open="${escapeHtml(message.id)}">Editar</button><button class="chat-reply-button" type="button" data-chat-delete="${escapeHtml(message.id)}" data-conversation-id="${escapeHtml(message.conversation_id)}">Excluir</button>` : ""}<button class="chat-reply-button" type="button" data-chat-reply="${escapeHtml(message.id)}">Responder</button><button class="chat-reply-button" type="button" data-chat-copy="${escapeHtml(message.id)}">Copiar</button></div><p class="form-status" data-delete-status role="status" aria-live="polite"></p>
  </article></div>`;
  }).join("");
}

function peerParticipantFor(participants, userId) {
  return participants.find((participant) => participant.user_id !== userId) || null;
}

export function messageComposerMarkup(conversationId) {
  return `<form class="chat-message-form" data-chat-send data-conversation-id="${escapeHtml(conversationId)}">
    <input type="hidden" name="replyTo" value=""><p class="chat-reply-context" data-chat-reply-context hidden><span></span><button type="button" data-chat-reply-clear aria-label="Cancelar resposta">${icon("close")}</button></p>
    <div class="chat-premium-compose-row">
      <div class="chat-premium-compose-box">
        <button class="chat-emoji-button" type="button" data-chat-emoji aria-label="Inserir emoji">${icon("smile")}</button>
        <label class="visually-hidden" for="message-${escapeHtml(conversationId)}">Mensagem</label>
        <textarea id="message-${escapeHtml(conversationId)}" name="body" maxlength="5000" rows="1" placeholder="Mensagem" enterkeyhint="send" aria-label="Escreva sua mensagem"></textarea>
        <button class="chat-attachment-label" type="button" data-chat-premium-menu-toggle aria-expanded="false" aria-label="Anexar mídia e abrir opções" aria-controls="premium-attachments-${escapeHtml(conversationId)}">${icon("paperclip")}</button>
      </div>
      <div class="chat-message-actions">
        <button class="text-button chat-record-start" type="button" data-chat-record-start aria-label="Gravar áudio">${icon("mic")}</button>
        <button class="primary-button compact-button chat-premium-send" type="submit" aria-label="Enviar mensagem">${icon("send")}</button>
      </div>
    </div>
    <div id="premium-attachments-${escapeHtml(conversationId)}" class="chat-premium-attach-menu" data-chat-premium-menu hidden role="group" aria-label="Compartilhar na conversa">
      <button type="button" data-chat-choose-files><span class="chat-premium-tile purple">${icon("image")}</span><span>Fotos e arquivos</span></button>
      <button type="button" data-chat-premium-camera><span class="chat-premium-tile rose">${icon("camera")}</span><span>Câmera</span></button>
      <button type="button" data-chat-choose-sticker><span class="chat-premium-tile orange">${icon("smile")}</span><span>Figurinha</span></button>
      <button type="button" data-v2-game data-chat-premium-game><span class="chat-premium-tile indigo">${icon("gamepad")}</span><span>Jogos</span></button>
      <button type="button" data-chat-premium-share-game><span class="chat-premium-tile indigo">${icon("share")}</span><span>Convidar para jogar</span></button>
      <button type="button" data-chat-premium-note><span class="chat-premium-tile amber">💌</span><span>Cartas</span></button>
      <button type="button" data-chat-premium-music><span class="chat-premium-tile green">${icon("music")}</span><span>Músicas</span></button>
    </div>
    <input id="files-${escapeHtml(conversationId)}" name="files" class="chat-premium-file-input" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mp4,audio/mpeg,audio/ogg,audio/webm,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf">
    <input class="chat-sticker-input" name="sticker" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar imagem para figurinha">
    <dialog class="chat-sticker-dialog" data-chat-sticker-picker aria-labelledby="chatStickerTitle-${escapeHtml(conversationId)}"><div class="chat-sticker-dialog-heading"><div><span class="section-kicker">Figurinhas</span><h3 id="chatStickerTitle-${escapeHtml(conversationId)}">Escolher figurinha</h3></div><button class="chat-sticker-close" type="button" data-chat-sticker-close aria-label="Fechar figurinhas">${icon("close")}</button></div>${stickerCatalogMarkup()}<button class="chat-sticker-browse" type="button" data-chat-sticker-browse>Usar imagem do aparelho</button><div class="chat-sticker-preview" data-chat-sticker-preview hidden></div><div class="chat-sticker-dialog-actions"><button class="text-button" type="button" data-chat-sticker-close>Cancelar</button><button class="primary-button compact-button" type="button" data-chat-sticker-confirm disabled>Usar figurinha</button></div></dialog>
    <div class="chat-recorder" data-chat-recording hidden><span class="chat-recording-indicator" aria-hidden="true"></span><span data-chat-record-time>00:00</span><button class="text-button" type="button" data-chat-record-pause aria-pressed="false">Pausar</button><button class="text-button" type="button" data-chat-record-stop>Finalizar áudio</button><button class="text-button" type="button" data-chat-record-cancel>Cancelar</button></div>
    <div class="chat-record-ready" data-chat-record-ready hidden><audio controls data-chat-record-preview></audio><button class="text-button" type="button" data-chat-record-cancel>Remover áudio</button></div>
    <span class="form-status" data-status role="status" aria-live="polite"></span></form>`;
}

export function threadHeadingMarkup(root, participants, userId, conversationInfo = null) {
  const search = '<button class="chat-v2-icon-button" type="button" data-chat-premium-search aria-label="Buscar nesta conversa">' + icon("search") + '</button>';
  if (conversationInfo?.kind === "group") {
    const memberCount = participants.length;
    const avatar = conversationInfo.coverUrl
      ? `<img class="chat-thread-avatar chat-group-avatar" data-group-cover-id="${escapeHtml(conversationInfo.id)}" src="${escapeHtml(conversationInfo.coverUrl)}" alt="Foto do grupo" referrerpolicy="no-referrer">`
      : `<span class="chat-thread-avatar chat-group-avatar" role="img" aria-label="Conversa em grupo">${icon("users")}</span>`;
    const avatarWrap = `<span class="chat-group-avatar-wrap">${avatar}<button type="button" class="chat-cover-badge" data-chat-group-cover-choose aria-label="Trocar foto do grupo" title="Trocar foto do grupo">${icon("camera")}</button></span>`;
    const editor = `<input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" data-chat-group-cover-input aria-label="Escolher foto do grupo"><span class="chat-cover-status" data-chat-cover-status role="status" aria-live="polite"></span>`;
    return `<header class="chat-thread-heading" data-chat-kind="group" data-conversation-id="${escapeHtml(activeConversationId)}"><button class="chat-back-button" type="button" data-chat-back aria-label="Voltar às conversas">${icon("back")}</button>${avatarWrap}<div class="chat-thread-identity"><strong>${escapeHtml(conversationInfo.subject || "Grupo")}</strong><small>${memberCount} participantes</small></div>${editor}${search}</header>`;
  }
  const peer = participants.find((participant) => participant.user_id !== userId)?.profile;
  const fallback = (peer?.display_name || peer?.username || "?").slice(0, 1).toLocaleUpperCase("pt-BR");
  const conversation = [...root.querySelectorAll("[data-chat-open]")].find((item) => item.dataset.chatOpen === activeConversationId);
  const image = conversation?.querySelector(".chat-conversation-avatar[src]");
  const avatarUrl = image?.src || peer?.avatarUrl;
  const avatar = avatarUrl
    ? `<img class="chat-thread-avatar" data-profile-avatar-id="${escapeHtml(peer?.id || "")}" src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="chat-thread-avatar" aria-hidden="true">${escapeHtml(fallback)}</span>`;
  const name = conversation?.querySelector(".chat-conversation-copy strong")?.textContent || peer?.display_name || peer?.username || "Conversa privada";
  return `<header class="chat-thread-heading" data-chat-kind="direct" data-conversation-id="${escapeHtml(activeConversationId)}"><button class="chat-back-button" type="button" data-chat-back aria-label="Voltar às conversas">${icon("back")}</button>${avatar}<a class="chat-thread-identity" href="perfil.html?usuario=${encodeURIComponent(peer?.id || "")}"><strong data-profile-name-id="${escapeHtml(peer?.id || "")}">${escapeHtml(name)}</strong><small>Conversa em tempo real</small></a>${search}</header>`;
}

async function signThreadAvatar(client, participants) {
  const profiles = participants.map((participant) => participant.profile).filter((profile) => profile?.avatar_path);
  if (!profiles.length) return;
  const { data } = await cachedSignedUrls(client, "looply-avatars", profiles.map((profile) => profile.avatar_path), 1800);
  if (data) profiles.forEach((profile, index) => { profile.avatarUrl = data[index]?.signedUrl || ""; });
}

/** URLs assinadas e estado do player mudam a cada leitura; ignorar isso evita reconstruir a mensagem (piscar). */
function stableMessageSignature(node) {
  const copy = node.cloneNode(true);
  copy.querySelectorAll("details[open]").forEach((el) => el.removeAttribute("open"));
  copy.querySelectorAll("[src],[href]").forEach((el) => {
    for (const attr of ["src", "href"]) {
      const value = el.getAttribute(attr);
      if (value && /^https?:/i.test(value)) el.setAttribute(attr, value.split("?")[0]);
    }
  });
  copy.querySelectorAll("[data-chat-voice]").forEach((el) => { el.removeAttribute("style"); el.classList.remove("is-playing"); });
  copy.querySelectorAll("[data-chat-voice-time],[data-chat-voice-rate]").forEach((el) => { el.textContent = ""; });
  copy.querySelectorAll("[aria-valuenow],[aria-pressed][data-chat-voice-toggle]").forEach((el) => { el.removeAttribute("aria-valuenow"); el.removeAttribute("aria-pressed"); });
  return copy.outerHTML;
}

export function updateThreadMarkup(thread, markup, conversationId) {
  if (!thread) return;
  const currentForm = thread.querySelector("[data-chat-send]");
  const preserveComposer = Boolean(currentForm && currentForm.dataset.conversationId === conversationId);
  if (!preserveComposer) {
    thread.innerHTML = markup;
    return;
  }

  const history=thread.querySelector("[data-chat-premium-history]")||thread;
  const wasNearBottom = history.scrollHeight-history.scrollTop-history.clientHeight < 120;
  const previousScrollTop=history.scrollTop;
  const historyTop=history.getBoundingClientRect().top;
  const anchor=[...history.querySelectorAll("[data-message-row-id]")].find(el=>el.getBoundingClientRect().bottom>historyTop);
  const anchorOffset=anchor?.getBoundingClientRect().top-historyTop;
  const openedNotes=new Set([...history.querySelectorAll(".chat-premium-note-card[open]")].map(note=>note.closest("[data-message-row-id]")?.dataset.messageRowId));
  const parsed = document.createElement("div");
  parsed.innerHTML = markup;
  parsed.querySelector("[data-chat-send]")?.remove();

  // Keep existing message and media nodes alive across polling updates.
  const incomingHistory=parsed.querySelector("[data-chat-premium-history]");
  const existing=new Map([...history.children].filter(el=>el.dataset.messageRowId).map(el=>[el.dataset.messageRowId,el]));
  const firstIncoming=incomingHistory.querySelector("[data-message-row-id]")?.dataset.messageRowId;
  const firstExisting=existing.get(firstIncoming);
  const nextNodes=[];
  // Mensagens antigas já carregadas ficam sempre no lugar: antes elas eram
  // removidas quando o botão "mais antigas" sumia, e a tela pulava.
  if(firstExisting){
    for(const node of [...history.children]){if(node===firstExisting)break;nextNodes.push(node);}
  }
  const keepOlder=nextNodes.some(node=>node.dataset.messageRowId);
  if(!keepOlder)nextNodes.length=0;
  for(const next of [...incomingHistory.children]){
    if(keepOlder && next.matches("[data-chat-load-older]"))continue;
    const old=existing.get(next.dataset.messageRowId);
    if(old){
      if(stableMessageSignature(old)===stableMessageSignature(next)){nextNodes.push(old);continue;}
    }
    if(!next.dataset.messageRowId&&next.matches(".chat-date-separator")){
      const prev=nextNodes[nextNodes.length-1];
      if(prev?.matches?.(".chat-date-separator")&&prev.textContent===next.textContent)continue;
    }
    nextNodes.push(next);
  }
  let cursor=history.firstChild;
  for(const node of nextNodes){
    if(node===cursor){cursor=cursor.nextSibling;continue;}
    history.insertBefore(node,cursor);
  }
  const retained=new Set(nextNodes);
  for(const node of [...history.childNodes])if(!retained.has(node))node.remove();
  const oldHeading=thread.querySelector(".chat-thread-heading");
  const newHeading=parsed.querySelector(".chat-thread-heading");
  if(oldHeading&&newHeading&&stableMessageSignature(oldHeading)!==stableMessageSignature(newHeading)){
    // The header contains buttons and a native group-cover picker; refresh only
    // on a semantic change, not on each signed-URL renewal.
    const oldAvatar=oldHeading.querySelector("[src]"),nextAvatar=newHeading.querySelector("[src]");
    const sameIdentity=oldHeading.dataset.conversationId===newHeading.dataset.conversationId;
    const sameTitle=oldHeading.querySelector(".chat-thread-identity")?.textContent===newHeading.querySelector(".chat-thread-identity")?.textContent;
    const sameCover=oldAvatar?.getAttribute("src")?.split("?")[0]===nextAvatar?.getAttribute("src")?.split("?")[0];
    if(!sameIdentity||!sameTitle||!sameCover)oldHeading.replaceWith(newHeading);
  }
  const updatedHistory=history;
  for(const note of updatedHistory.querySelectorAll(".chat-premium-note-card")){
    if(openedNotes.has(note.closest("[data-message-row-id]")?.dataset.messageRowId))note.open=true;
  }
  if(!wasNearBottom){
    updatedHistory.scrollTop=previousScrollTop;
    if(anchor?.isConnected)updatedHistory.scrollTop+=anchor.getBoundingClientRect().top-historyTop-anchorOffset;
  }
  if (wasNearBottom && nextNodes.some(node=>node.dataset.messageRowId&&!existing.has(node.dataset.messageRowId))) {const nextHistory=thread.querySelector("[data-chat-premium-history]")||thread;nextHistory.scrollTop=nextHistory.scrollHeight;}
}

function scrollInitialThreadToLatest(thread) {
  if (!thread) return;
  const scrollToLatest = () => {if(thread.isConnected){const container=thread.querySelector("[data-chat-premium-history]")||thread;container.scrollTop=container.scrollHeight;}};
  // The second frame runs after layout has incorporated the inserted messages.
  // Media can still resize later, so each initial load gets one extra correction.
  requestAnimationFrame(() => {
    scrollToLatest();
    requestAnimationFrame(scrollToLatest);
  });
  thread.querySelectorAll("img, video").forEach((media) => {
    const eventName = media instanceof HTMLVideoElement ? "loadedmetadata" : "load";
    media.addEventListener(eventName, () => {
      const container=thread.querySelector("[data-chat-premium-history]")||thread;
      if (container.scrollHeight-container.scrollTop-container.clientHeight < 140) scrollToLatest();
    }, { once: true });
  });
}

async function insertChatMessage(client, conversationId, userId, body, replyTo = null) {
  const { data, error } = await client.from("chat_messages")
    .insert({ conversation_id: conversationId, sender_id: userId, reply_to: replyTo, body })
    .select("id").single();
  if (error) throw error;
  if (!data?.id) throw new Error("message_not_confirmed");
  return data;
}

function publishChatMessage(root, client, conversationId, messageId) {
  root.dispatchEvent(new CustomEvent("looply:chat-message-saved", { detail: { conversationId } }));
  void requestImmediateMessagePush(client, messageId);
}

export async function sendChatCard(root, client, userId, composer, body) {
  const conversationId = composer?.dataset.conversationId;
  if (!conversationId || !userId || root.querySelector("form[data-chat-send]") !== composer)
    throw new Error("Abra a conversa novamente para compartilhar.");

  const message = await insertChatMessage(client, conversationId, userId, body);
  publishChatMessage(root, client, conversationId, message.id);
  if (activeConversationId === conversationId) void openConversation(root, client, conversationId, userId);
}

async function openConversation(root, client, conversationId, userId) {
  if (!conversationId || !client || !userId) return;
  if(root.dataset.conversationPage !== "true" && !window.history.state?.looplyChatThread){
    window.history.pushState({...window.history.state,looplyChatThread:conversationId},"",window.location.href);
  }
  activeConversationId = conversationId;
  refreshSequence += 1;
  const requestId = ++activeThreadRequest;
  const thread = root.querySelector("[data-chat-thread]");
  if (!thread) return;
  const hasSameComposer = thread.querySelector("[data-chat-send]")?.dataset.conversationId === conversationId;
  if (!hasSameComposer) thread.innerHTML = `<p class="chat-empty" role="status">Carregando mensagens...</p>`;
  root.querySelector("[data-chat-area]")?.classList.add("is-conversation-open");

  try {
    const { messages, participants, conversation } = await loadThread(client, conversationId);
    if (requestId !== activeThreadRequest || activeConversationId !== conversationId || !root.querySelector("[data-chat-thread]")) return;
    await signThreadAvatar(client, participants);
    if (requestId !== activeThreadRequest || activeConversationId !== conversationId) return;
    const peer = peerParticipantFor(participants, userId);
    const isGroup = conversation.kind === "group";
    const markup = `${threadHeadingMarkup(root, participants, userId, conversation)}<div class="chat-premium-history" data-chat-premium-history role="log" aria-label="Histórico da conversa">${messages.length === 100 ? olderMessagesButton(conversationId, messages[0]) : ""}${threadMarkup(messages, userId, peer?.last_read_at || null, peer?.profile || null, participants, isGroup)}</div>${messageComposerMarkup(conversationId)}`;
    if (hasSameComposer) updateThreadMarkup(thread, markup, conversationId);
    else {
      thread.innerHTML = markup;
      scrollInitialThreadToLatest(thread);
    }
    root.dispatchEvent(new CustomEvent("looply:conversation-activated", { detail: { conversationId } }));
    const { data: readConfirmed, error: readError } = await client.rpc("mark_conversation_read", { p_conversation_id: conversationId });
    if (readError || readConfirmed !== true) console.warn("Looply read receipt update failed", readError || { message: "conversation_unavailable" });
    // The unread filter is driven by the persisted receipt, so refresh the
    // sidebar only after the database confirms the read transition.
    else if (activeConversationId === conversationId) void refreshChat(root, client, userId, { keepThread: true });
  } catch (error) {
    console.error("Looply conversation load failed", error);
    if (requestId === activeThreadRequest && activeConversationId === conversationId && thread.isConnected && !thread.querySelector("[data-chat-send]")) {
      thread.innerHTML = `<p class="chat-empty" role="alert">Não foi possível carregar esta conversa. Confira o acesso e tente novamente.</p>`;
    }
  }
}

/** Update real Neon conversation rows in place; do not throw away Stories, search, scroll, nicknames or action buttons. */
function reconcileChatSidebar(currentSidebar, freshSidebar) {
  if (!currentSidebar || !freshSidebar) return;
  const currentList=currentSidebar.querySelector("[data-chat-conversations]");
  const freshList=freshSidebar.querySelector("[data-chat-conversations]");
  if (!currentList || !freshList) return;
  const scrollTop=currentSidebar.scrollTop;
  const saved=new Map([...currentList.querySelectorAll(":scope > [data-chat-open]")]
    .map(card=>[card.dataset.chatOpen,card]));
  const desired=[];
  for (const next of [...freshList.children]) {
    const id=next.dataset.chatOpen;
    if (!id) {
      const old=currentList.querySelector("[data-chat-no-matches]");
      desired.push(old||next);
      continue;
    }
    const old=saved.get(id);
    if (!old) {desired.push(next);continue;}
    // Signed avatar URLs and locally decorated cards are deliberately preserved.
    // Only the server-owned fields change when a new message/receipt arrives.
    old.dataset.chatKind=next.dataset.chatKind;
    old.dataset.chatUnreadCount=next.dataset.chatUnreadCount;
    old.classList.toggle("is-active",next.classList.contains("is-active"));
    const currentName=old.querySelector(".chat-conversation-copy strong");
    const freshName=next.querySelector(".chat-conversation-copy strong");
    if(currentName&&freshName){
      // Keep a user-specific nickname, but update genuine server-side renames.
      const previousOriginal=currentName.dataset.originalName||currentName.textContent;
      const customName=currentName.textContent!==previousOriginal;
      if(!customName&&currentName.textContent!==freshName.textContent)currentName.textContent=freshName.textContent;
      currentName.dataset.originalName=freshName.textContent;
    }
    const pairs=[
      [".chat-conversation-avatar", ".chat-conversation-avatar"],
      [".chat-model-row-title time", ".chat-model-row-title time"],
      [".chat-model-row-preview small", ".chat-model-row-preview small"],
      [".chat-unread", ".chat-unread"]
    ];
    // A cover or avatar changes only when its storage path changes. Query-token
    // rotations are not content changes and must not restart image downloads.
    const oldAvatar=old.querySelector(".chat-conversation-avatar");
    const nextAvatar=next.querySelector(".chat-conversation-avatar");
    if(oldAvatar&&nextAvatar){
      const oldUrl=oldAvatar.getAttribute("src")?.split("?")[0];
      const nextUrl=nextAvatar.getAttribute("src")?.split("?")[0];
      if(oldAvatar.tagName!==nextAvatar.tagName || (oldUrl&&nextUrl&&oldUrl!==nextUrl))oldAvatar.replaceWith(nextAvatar);
    }
    for(const [before,after] of pairs.slice(1)){
      const previous=old.querySelector(before),latest=next.querySelector(after);
      if(previous&&latest){if(previous.textContent!==latest.textContent)previous.textContent=latest.textContent;}
      else if(previous&&!latest)previous.remove();
      else if(!previous&&latest)old.append(latest);
    }
    desired.push(old);
  }
  // Preserve locally pinned ordering when Neon summaries refresh.
  desired.sort((left,right)=>Number(right.classList.contains("is-chat-premium-pinned"))-
    Number(left.classList.contains("is-chat-premium-pinned")));
  // Reordering existing nodes does not recreate their images or animations.
  const existing=[...currentList.children];
  if(desired.length!==existing.length||desired.some((card,i)=>card!==existing[i]))
    currentList.replaceChildren(...desired);
  const count=currentSidebar.querySelector(".chat-panel-heading span");
  const nextCount=freshSidebar.querySelector(".chat-panel-heading span");
  if(count&&nextCount&&count.textContent!==nextCount.textContent)count.textContent=nextCount.textContent;
  const notices=currentSidebar.querySelector(".chat-notifications-panel");
  const newNotices=freshSidebar.querySelector(".chat-notifications-panel");
  if(notices&&newNotices&&!notices.open&&notices.innerHTML!==newNotices.innerHTML)
    notices.innerHTML=newNotices.innerHTML;
  currentSidebar.scrollTop=scrollTop;
}

async function refreshChat(root, client, userId, { keepThread = false } = {}) {
  const area = root.querySelector("[data-chat-area]");
  if (!area) return;
  const requestId = ++refreshSequence;
  const conversationAtStart = activeConversationId;
  try {
    const data = await loadChatData(client, userId);
    if (requestId !== refreshSequence || !root.querySelector("[data-chat-area]")) return;
    const parsed = document.createElement("div");
    parsed.innerHTML = chatMarkup(data, userId);
    const freshArea = parsed.querySelector("[data-chat-area]");
    const currentArea = root.querySelector("[data-chat-area]");
    const currentSidebar = currentArea?.querySelector(".chat-sidebar");
    const freshSidebar = freshArea?.querySelector(".chat-sidebar");
    const currentStories = currentSidebar?.querySelector(".story-area");
    // Keep the same sidebar and its real Stories/filters/inputs across every
    // Neon sync. Replacing it caused visible flashes and reset native scrolling.
    if (currentSidebar && freshSidebar) {
      reconcileChatSidebar(currentSidebar,freshSidebar);
      if (currentStories && !currentSidebar.contains(currentStories))
        (currentSidebar.querySelector("[data-chat-premium-stories]")||currentSidebar).prepend(currentStories);
    }
    applyConversationFilter(root);

    const conversationId = activeConversationId;
    if (!keepThread || !conversationId || conversationId !== conversationAtStart ||
        !data.conversations.some((row) => row.id === conversationId)) {
      root.dispatchEvent(new CustomEvent("looply:chat-rendered"));
      return true;
    }

    const { messages, participants, conversation } = await loadThread(client, conversationId);
    if (requestId !== refreshSequence || activeConversationId !== conversationId) return;
    await signThreadAvatar(client, participants);
    if (requestId !== refreshSequence || activeConversationId !== conversationId) return;
    const peer = peerParticipantFor(participants, userId);
    const isGroup = conversation.kind === "group";
    const markup = `${threadHeadingMarkup(root, participants, userId, conversation)}<div class="chat-premium-history" data-chat-premium-history role="log" aria-label="Histórico da conversa">${messages.length === 100 ? olderMessagesButton(conversationId, messages[0]) : ""}${threadMarkup(messages, userId, peer?.last_read_at || null, peer?.profile || null, participants, isGroup)}</div>${messageComposerMarkup(conversationId)}`;
    updateThreadMarkup(root.querySelector("[data-chat-thread]"), markup, conversationId);
    root.dispatchEvent(new CustomEvent("looply:chat-rendered"));
    return true;
  } catch (error) {
    console.error("Looply conversation refresh failed", error);
    const status = root.querySelector("[data-chat-live]");
    if (status) status.textContent = "Sem atualização; tentando novamente";
    // Keep the current conversation and draft intact if a refresh fails.
    return false;
  }
}

/** Refresh authenticated conversation summaries without remounting chat controllers. */
export async function refreshChatInPlace(root, client, userId) {
  return (await refreshChat(root, client, userId, {keepThread:Boolean(activeConversationId)})) === true;
}

function scheduleRefresh(root, client, userId) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    void refreshChat(root, client, userId, { keepThread: Boolean(activeConversationId) });
  }, 450);
}

export function setupChatRealtime(client, userId, root) {
  if (!client || !userId || (realtimeChannel && realtimeUserId === userId)) return;
  if (realtimeChannel) void client.removeChannel(realtimeChannel);
  stopNotificationChanges?.();
  stopNotificationChanges = notificationBus.subscribeDebounced(({ sources }) => {
    if (sources.includes("chat")) scheduleRefresh(root, client, userId);
  });
  realtimeUserId = userId;
  let selectedRoomId = "";
  let connecting = 0;
  const activate = conversationId => {
    if (!client.supportsRealtime) return;
    if (!conversationId || !/^[a-f0-9-]{36}$/i.test(conversationId)) return;
    if (selectedRoomId === conversationId && realtimeChannel) return;
    selectedRoomId = conversationId;
    const sequence = ++connecting;
    if (realtimeChannel) void client.removeChannel(realtimeChannel);
    realtimeChannel = client.channel(`looply-chat-${conversationId}`);
    realtimeChannel.on("broadcast", { event: "invalidate" }, () => {
      if (selectedRoomId === conversationId) scheduleRefresh(root, client, userId);
    }).subscribe(state => {
      if (sequence !== connecting) return;
      const status = root.querySelector("[data-chat-live]");
      if (status) status.textContent = state === "SUBSCRIBED" ? "Atualizações ao vivo" : "Reconectando...";
    });
  };
  root.addEventListener("looply:conversation-activated", event => {
    activate(event.detail?.conversationId);
  });
  root.addEventListener("looply:chat-message-saved", event => {
    if (event.detail?.conversationId !== selectedRoomId || !realtimeChannel) return;
    void realtimeChannel.send({ type: "broadcast", event: "invalidate", payload: {} });
  });
  // Active calls use this same authenticated Cloudflare room, while Neon
  // remains the source of truth for message bodies and read receipts.
  const existingId = root.querySelector("[data-chat-send]")?.dataset.conversationId;
  if (existingId) activate(existingId);
  // A bounded refresh also catches incoming messages when no room is open yet.
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible" && root.isConnected)
      scheduleRefresh(root, client, userId);
  }, 25000);
  window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
}

export function disposeChatRealtime(client) {
  if (realtimeChannel && client) client.removeChannel(realtimeChannel);
  stopNotificationChanges?.();
  stopNotificationChanges = null;
  realtimeChannel = null;
  realtimeUserId = null;
  activeConversationId = null;
  refreshSequence += 1;
  activeThreadRequest += 1;
  conversationSearch = "";
  conversationFilter = "all";
  clearTimeout(refreshTimer);
  for (const form of voiceRecordings.keys()) cancelVoiceRecording(form);
}

/** Coordinates for an Android visualViewport with a resizing or overlay keyboard. */
export function measureChatVisualViewport({height,top=0,layoutHeight,baseline,typing=false}) {
  const safeHeight=Math.max(170,Math.round(Number(height)||Number(layoutHeight)||170));
  const safeTop=Math.max(0,Math.round(Number(top)||0));
  const obscured=Boolean(typing && (Number(baseline)-safeHeight>110 || Number(layoutHeight)-safeHeight-safeTop>90));
  return {height:safeHeight,top:safeTop,keyboardOpen:obscured};
}

export function bindChatEvents(root, client, getUserId) {
  bindStickerCatalog(root,client,getUserId);
  root.dataset.chatUserId = getUserId?.() || "";
  // Signed avatar URLs may expire or the stored object may be missing. Replace only
  // failed images with the same visual fallback used when no avatar is configured.
  root.addEventListener("error", async (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches(".chat-conversation-avatar, .chat-person-avatar, .chat-group-option-avatar, .chat-thread-avatar, .chat-message-avatar")) return;
    if (!image.dataset.avatarRetried && (image.dataset.profileAvatarId || image.dataset.groupCoverId)) {
      image.dataset.avatarRetried = "true";
      try {
        let path = null, bucket = "looply-avatars";
        if (image.dataset.profileAvatarId) {
          const {data,error} = await client.from("profiles").select("avatar_path")
            .eq("id",image.dataset.profileAvatarId).maybeSingle();
          if (error) throw error;
          path = data?.avatar_path || null;
        } else {
          const {data,error} = await client.from("group_covers").select("storage_path")
            .eq("conversation_id",image.dataset.groupCoverId).maybeSingle();
          if (error) throw error;
          path = data?.storage_path || null;
          bucket = "looply-chat";
        }
        if (path) {
          // A fresh direct signature bypasses an expired in-memory URL cache.
          const {data,error} = await client.storage.from(bucket).createSignedUrl(path,1800);
          if (error) throw error;
          if (image.isConnected && data?.signedUrl && data.signedUrl !== image.src) {
            image.src = data.signedUrl;
            return;
          }
        }
      } catch (error) {
        console.warn("Chat registered avatar/cover could not be recovered.",error);
      }
    }
    if (!image.isConnected) return;
    console.warn("Chat avatar or group cover could not be displayed.", image.dataset.profileAvatarId || image.dataset.groupCoverId || "");
    const container = image.closest(".chat-conversation, .chat-person, .chat-group-option, .chat-thread-heading, .chat-message-row");
    const label = container?.querySelector(".chat-conversation-copy strong, .chat-person strong, .chat-group-option strong, .chat-thread-heading strong, .chat-message-meta strong");
    const initial = (label?.textContent?.trim() || "?").slice(0, 1).toLocaleUpperCase("pt-BR");
    const fallback = document.createElement("span");
    fallback.className = image.className;
    fallback.setAttribute("aria-hidden", "true");
    fallback.textContent = initial;
    image.replaceWith(fallback);
  }, true);
  if (window.visualViewport) {
    const viewport = window.visualViewport;
    let viewportBaseline = Math.max(window.innerHeight,viewport.height);
    let frame = 0;
    const updateViewport = () => {
      frame = 0;
      const typing = Boolean(document.activeElement?.closest(".chat-message-form"));
      if(!typing)viewportBaseline=Math.max(viewportBaseline,window.innerHeight,viewport.height);
      const geometry=measureChatVisualViewport({height:viewport.height,top:viewport.offsetTop,
        layoutHeight:window.innerHeight,baseline:viewportBaseline,typing});
      root.style.setProperty("--looply-visible-height", geometry.height+"px");
      root.style.setProperty("--looply-visible-top", geometry.top+"px");
      root.classList.toggle("chat-keyboard-open",geometry.keyboardOpen);
      document.documentElement.classList.toggle("chat-keyboard-open",geometry.keyboardOpen);
    };
    const queueViewport = () => {if(!frame)frame=requestAnimationFrame(updateViewport);};
    viewport.addEventListener("resize", queueViewport);
    viewport.addEventListener("scroll", queueViewport);
    window.addEventListener("resize",queueViewport);
    window.addEventListener("orientationchange",()=>{
      viewportBaseline=Math.max(window.innerHeight,viewport.height);
      queueViewport();
    });
    updateViewport();
    window.addEventListener("pagehide", () => {
      viewport.removeEventListener("resize", queueViewport);
      viewport.removeEventListener("scroll", queueViewport);
      window.removeEventListener("resize",queueViewport);
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove("chat-keyboard-open");
    }, { once: true });
    root.addEventListener("input", event => {
      const textarea = event.target.closest(".chat-message-form textarea");
      if (!textarea) return;
      textarea.style.height = "44px";
      textarea.style.height = Math.min(150,Math.max(44,textarea.scrollHeight)) + "px";
      queueViewport();
    });
    root.addEventListener("focusin", (event) => {
      if (event.target.matches(".chat-message-form textarea")) queueViewport();
    });
    root.addEventListener("focusout", (event) => {
      if (event.target.matches(".chat-message-form textarea")) queueViewport();
    });
    root.addEventListener("looply:conversation-activated",queueViewport);
    root.addEventListener("looply:chat-rendered",queueViewport);
  }
  root.addEventListener("looply:open-conversation", async (event) => {
    const conversationId = event.detail?.conversationId;
    const userId = getUserId?.();
    if (!client || !userId || !conversationId) return;
    await openConversation(root, client, conversationId, userId);
  });

  const groupCoverDrafts=new WeakMap();
  async function saveNewGroupCover(conversationId,userId,file,status,alreadyCropped=false){
    let messageId=null,uploadedPath="",persisted=false;
    try{
      status("Preparando foto do grupo…");
      const cropped=alreadyCropped?file:await editGroupCover(file);
      if(!cropped){status("Grupo criado sem foto.");return false;}
      const image=await normalizeGroupCover(cropped);
      const message=await client.from("chat_messages").insert({
        conversation_id:conversationId,sender_id:userId,body:"Atualizou a foto do grupo."
      }).select("id").single();
      if(message.error||!message.data?.id)throw message.error||Error("message_not_confirmed");
      messageId=message.data.id;
      uploadedPath="conversations/"+conversationId+"/"+messageId+"/"+crypto.randomUUID()+".webp";
      await uploadResumable(client,uploadedPath,image);
      const media=await client.from("chat_media").insert({
        conversation_id:conversationId,message_id:messageId,created_by:userId,
        storage_path:uploadedPath,mime_type:"image/webp",byte_size:image.size,file_name:"capa-grupo.webp"
      }).select("id").maybeSingle();
      if(media.error||!media.data?.id)throw media.error||Error("cover_media_unconfirmed");
      const saved=await client.rpc("v10_set_group_cover",{
        p_conversation_id:conversationId,p_storage_path:uploadedPath
      });
      if(saved.error||saved.data!==uploadedPath)throw saved.error||Error("cover_rpc_unconfirmed");
      persisted=true;
      const read=await client.from("group_covers").select("storage_path")
        .eq("conversation_id",conversationId).maybeSingle();
      if(read.error||read.data?.storage_path!==uploadedPath)throw read.error||Error("cover_read_unconfirmed");
      status("Foto do grupo salva.");return true;
    }catch(error){
      console.error("Looply group cover during creation failed",error);
      if(!persisted&&uploadedPath){
        try{await client.storage.from("looply-chat").remove([uploadedPath]);}catch{}
      }
      if(!persisted&&messageId){
        try{await client.from("chat_messages").delete()
          .eq("id",messageId).eq("conversation_id",conversationId);}catch{}
      }
      status("Grupo criado, mas não foi possível adicionar a foto.");
      return false;
    }
  }
  const previewNewGroupCover=(form,file)=>{
    const preview=form.querySelector('[data-chat-create-cover-preview]');
    if(!preview)return;
    preview.replaceChildren();
    const url=URL.createObjectURL(file),img=document.createElement('img');
    img.alt='Prévia da foto de grupo';img.src=url;
    img.onload=()=>URL.revokeObjectURL(url);
    img.onerror=()=>{URL.revokeObjectURL(url);preview.textContent='+';};
    preview.append(img);
  };
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-chat-create-cover-editor]');
    if(!button||button.disabled)return;
    const form=button.closest('[data-chat-group-create]');
    if(!form)return;
    button.disabled=true;
    try{
      const cropped=await editGroupCover();
      if(!cropped)return;
      groupCoverDrafts.set(form,cropped);
      previewNewGroupCover(form,cropped);
      setStatus(form,'Foto pronta. Crie o grupo para salvar.','info');
    }finally{button.disabled=false;}
  });
  root.addEventListener('change',async event=>{
    const input=event.target.closest('form[data-chat-group-create] input[name="groupCover"]');
    if(!input)return;
    const form=input.form,file=input.files?.[0];input.value='';
    if(!file)return;
    const cropped=await editGroupCover(file);
    if(cropped){groupCoverDrafts.set(form,cropped);previewNewGroupCover(form,cropped);}
  });
  // The group creator can replace the cover. The image is stored once in
  // the already-authorized chat-media bucket, and the cover points to it.
  root.addEventListener("click",async event=>{
    const button=event.target.closest("[data-chat-group-cover-choose]");
    if(!button||button.disabled)return;
    const conversationId=button.closest(".chat-thread-heading")?.dataset.conversationId;
    const file=await editGroupCover();
    const heading=root.querySelector('.chat-thread-heading');
    if(file&&heading?.dataset.conversationId===conversationId)
      root.dispatchEvent(new CustomEvent("looply:group-cover-ready",{detail:{file,heading}}));
  });
  root.addEventListener("change", async event=>{
    const input=event.target.closest("[data-chat-group-cover-input]");
    if(!input||!input.files?.length)return;
    const original=input.files[0],heading=input.closest(".chat-thread-heading");
    input.value="";
    const file=await editGroupCover(original);
    if(file&&heading?.isConnected)
      root.dispatchEvent(new CustomEvent("looply:group-cover-ready",{detail:{file,heading}}));
  });
  root.addEventListener("looply:group-cover-ready",async event=>{
    const {file,heading}=event.detail||{};
    if(!file||!heading?.isConnected)return;
    const conversationId = heading?.dataset.conversationId;
    const userId = getUserId?.();
    const status = heading?.querySelector("[data-chat-cover-status]");
    const button = heading?.querySelector("[data-chat-group-cover-choose]");
    if (!conversationId || !userId || !status || !button || button.disabled) return;
    button.disabled = true;
    let messageId = null;
    let uploadedPath = "";
    let persisted = false;
    try {
      status.textContent = "Salvando foto…";
      const image = await normalizeGroupCover(file);
      const message = await client.from("chat_messages").insert({
        conversation_id:conversationId,sender_id:userId,body:"Atualizou a foto do grupo."
      }).select("id").single();
      if (message.error || !message.data?.id) throw message.error || Error("message_not_confirmed");
      messageId = message.data.id;
      uploadedPath = `conversations/${conversationId}/${messageId}/${crypto.randomUUID()}.webp`;
      await uploadResumable(client,uploadedPath,image);
      const media = await client.from("chat_media").insert({
        conversation_id:conversationId,message_id:messageId,created_by:userId,
        storage_path:uploadedPath,mime_type:"image/webp",byte_size:image.size,file_name:"capa-grupo.webp"
      }).select("id").maybeSingle();
      if (media.error || !media.data?.id) throw media.error || Error("cover_media_unconfirmed");
      const saved = await client.rpc("v10_set_group_cover",{
        p_conversation_id:conversationId,p_storage_path:uploadedPath
      });
      if (saved.error || saved.data !== uploadedPath) throw saved.error || Error("cover_rpc_unconfirmed");
      persisted = true;
      const read = await client.from("group_covers").select("storage_path")
        .eq("conversation_id",conversationId).maybeSingle();
      if (read.error || read.data?.storage_path !== uploadedPath)
        throw read.error || Error("cover_read_unconfirmed");
      status.textContent = "Foto do grupo atualizada.";
      root.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId}}));
      await refreshChat(root,client,userId,{keepThread:true});
    } catch (error) {
      console.error("Looply group cover failed",error);
      if (!persisted && messageId) {
        if (uploadedPath) {
          const removed = await client.storage.from("looply-chat").remove([uploadedPath]);
          if (removed.error) console.warn("Cover upload cleanup failed",removed.error);
        }
        const deleted = await client.from("chat_messages").delete()
          .eq("id",messageId).eq("conversation_id",conversationId);
        if (deleted.error) console.warn("Cover message cleanup failed",deleted.error);
      }
      if (status.isConnected) status.textContent = persisted
        ? "Foto salva, mas não foi possível atualizar a tela. Reabra o grupo."
        : "Não foi possível alterar a foto. Confira o acesso.";
    } finally { button.disabled=false; }
  });
  // Keep attachment selection isolated from conversation and call controls.
  root.addEventListener("click", (event) => {
    const stickerButton = event.target.closest("[data-chat-choose-sticker]");
    if (stickerButton) {
      const picker = stickerButton.closest("[data-chat-send]")?.querySelector("[data-chat-sticker-picker]");
      if (picker && !picker.open) picker.showModal();
      return;
    }
    const closeStickerPicker = event.target.closest("[data-chat-sticker-close]");
    if (closeStickerPicker) {
      closeStickerPicker.closest("[data-chat-sticker-picker]")?.close();
      return;
    }
    const browseStickers = event.target.closest("[data-chat-sticker-browse]");
    if (browseStickers) {
      browseStickers.closest("[data-chat-send]")?.querySelector('input[name="sticker"]')?.click();
      return;
    }
    const confirmSticker = event.target.closest("[data-chat-sticker-confirm]");
    if (confirmSticker) {
      const picker = confirmSticker.closest("[data-chat-sticker-picker]");
      const form = picker?.closest("[data-chat-send]");
      const file = form?._looplyStickerFile;
      const filesInput = form?.querySelector('input[name="files"]');
      if (!file || !filesInput) return;
      const transfer = new DataTransfer();
      for (const existing of filesInput.files) transfer.items.add(existing);
      transfer.items.add(file);
      filesInput.files = transfer.files;
      form._looplyStickerFile = null;
      const preview = picker.querySelector("[data-chat-sticker-preview]");
      if (preview?.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
      picker.close();
      setStatus(form, "Figurinha pronta para enviar.", "info");
      form.querySelector('textarea[name="body"]')?.focus();
      return;
    }
    const button = event.target.closest("[data-chat-choose-files]");
    if (!button) return;
    event.preventDefault();
    const input = button.closest("[data-chat-send]")?.querySelector('input[name="files"]');
    input?.click();
  });

  root.addEventListener("click", async (event) => {
    // Favorite is an interactive button inside the conversation card. It must
    // never trigger opening/changing conversations on touch devices.
    if (event.target.closest("[data-v2-favorite]")) return;
    const openButton = event.target.closest("[data-chat-open]");
    const startButton = event.target.closest("[data-chat-start]");
    const replyButton = event.target.closest("[data-chat-reply]");
    const copyButton = event.target.closest("[data-chat-copy]");
    const editOpenButton = event.target.closest("[data-chat-edit-open]");
    const editCancelButton = event.target.closest("[data-chat-edit-cancel]");
    const deleteMessageButton = event.target.closest("[data-chat-delete]");
    const conversationFilterButton = event.target.closest("[data-chat-filter]");
    const clearReplyButton = event.target.closest("[data-chat-reply-clear]");
    const olderButton = event.target.closest("[data-chat-load-older]");
    const recordStartButton = event.target.closest("[data-chat-record-start]");
    const recordStopButton = event.target.closest("[data-chat-record-stop]");
    const recordPauseButton = event.target.closest("[data-chat-record-pause]");
    const recordCancelButton = event.target.closest("[data-chat-record-cancel]");
    const userId = getUserId?.();
    if (!client || !userId) return;
    if (deleteMessageButton) {
      if (!window.confirm("Excluir esta mensagem? Essa ação não pode ser desfeita.")) return;
      deleteMessageButton.disabled = true;
      try {
        const messageId=deleteMessageButton.dataset.chatDelete;
        // Read first: FK cascade removes chat_media metadata on message deletion.
        const {data:attachments,error:attachmentsError}=await client.from("chat_media")
          .select("storage_path").eq("message_id",messageId)
          .eq("conversation_id",deleteMessageButton.dataset.conversationId);
        if(attachmentsError)throw attachmentsError;
        const { data, error } = await client.from("chat_messages").delete()
          .eq("id", messageId)
          .eq("conversation_id", deleteMessageButton.dataset.conversationId).select("id").maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("message delete unavailable");
        const paths=(attachments||[]).map(item=>item.storage_path).filter(Boolean);
        if(paths.length) {
          // Immediate removal; the database trigger persists a retry job if S3 fails.
          const result=await client.storage.from("looply-chat").remove(paths);
          if(result.error)console.warn("Chat attachment queued for storage reconciliation",result.error.code||"network");
        }
        await openConversation(root, client, deleteMessageButton.dataset.conversationId, userId);
      } catch (error) {
        console.error("Looply chat message delete failed", error);
        deleteMessageButton.disabled = false;
        const status = deleteMessageButton.closest(".chat-message")?.querySelector("[data-delete-status]");
        if (status) { status.textContent = "Não foi possível excluir esta mensagem. Confira sua conexão e permissões."; status.dataset.kind = "error"; }
      }
      return;
    }
    if (editOpenButton) {
      const message = editOpenButton.closest(".chat-message");
      const form = message?.querySelector("[data-chat-edit-message]");
      if (form) { form.hidden = false; editOpenButton.hidden = true; form.querySelector("textarea")?.focus(); }
      return;
    }
    if (editCancelButton) {
      const message = editCancelButton.closest(".chat-message");
      const form = message?.querySelector("[data-chat-edit-message]");
      if (form) { form.reset(); form.hidden = true; message.querySelector("[data-chat-edit-open]")?.removeAttribute("hidden"); }
      return;
    }
    if (conversationFilterButton) {
      conversationFilter = "all";
      root.querySelectorAll("[data-chat-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button === conversationFilterButton)));
      applyConversationFilter(root);
      return;
    }
    const emojiButton = event.target.closest("[data-chat-emoji]");
    if (emojiButton) {
      toggleEmojiPicker(emojiButton, {
        userId: getUserId?.(),
        onSelect(emoji) {
          const input = emojiButton.closest("[data-chat-send]")?.querySelector('textarea[name="body"]');
          if (!input) return;
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? start;
          input.setRangeText(emoji, start, end, "end");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.focus();
        }
      });
      return;
    }
    if (copyButton) {
      const text = copyButton.closest(".chat-message")?.querySelector("p")?.textContent || "";
      try {
        if (!text || !navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(text);
        copyButton.textContent = "Copiada";
        setTimeout(() => { if (copyButton.isConnected) copyButton.textContent = "Copiar"; }, 1600);
      } catch {
        copyButton.textContent = "Cópia indisponível";
        setTimeout(() => { if (copyButton.isConnected) copyButton.textContent = "Copiar"; }, 2200);
      }
      return;
    }
    if (recordStartButton) {
      const form = recordStartButton.closest("[data-chat-send]");
      if (form) await startVoiceRecording(form);
      return;
    }
    if (recordStopButton) {
      const form = recordStopButton.closest("[data-chat-send]");
      const state = voiceRecordings.get(form);
      if (state && ["recording", "paused"].includes(state.recorder.state)) state.recorder.stop();
      return;
    }
    if (recordPauseButton) {
      const form = recordPauseButton.closest("[data-chat-send]");
      const state = voiceRecordings.get(form);
      if (state?.recorder.state === "recording") {
        state.recorder.pause();
        state.pausedAt = Date.now();
        recordPauseButton.textContent = "Retomar";
        recordPauseButton.setAttribute("aria-pressed", "true");
        setStatus(form, "Gravação pausada.", "info");
      } else if (state?.recorder.state === "paused") {
        state.recorder.resume();
        state.pausedTotal += Math.max(0, Date.now() - state.pausedAt);
        state.pausedAt = 0;
        recordPauseButton.textContent = "Pausar";
        recordPauseButton.setAttribute("aria-pressed", "false");
        setStatus(form, "Gravando áudio…", "info");
      }
      return;
    }
    if (recordCancelButton) {
      const form = recordCancelButton.closest("[data-chat-send]");
      if (form) cancelVoiceRecording(form);
      return;
    }
    if (olderButton) {
      const conversationId = olderButton.dataset.conversationId;
      const before = olderButton.dataset.before;
      olderButton.disabled = true;
      try {
        const { messages, participants, conversation } = await loadThread(client, conversationId, before);
        await signThreadAvatar(client, participants);
        const thread = root.querySelector("[data-chat-thread]");
        if (!thread || activeConversationId !== conversationId) return;
        const history=thread.querySelector("[data-chat-premium-history]")||thread;
        const scrollHeight=history.scrollHeight;
        olderButton.remove();
        const nextButton = messages.length === 100 ? olderMessagesButton(conversationId, messages[0]) : "";
        const peer = peerParticipantFor(participants, userId);
        history.insertAdjacentHTML("afterbegin", `${nextButton}${threadMarkup(messages, userId, peer?.last_read_at || null, peer?.profile || null, participants, conversation?.kind === "group")}`);
        history.scrollTop += history.scrollHeight-scrollHeight;
      } catch (error) {
        console.error("Looply older messages failed", error);
        olderButton.disabled = false;
        olderButton.textContent = "Não foi possível carregar; tente de novo";
      }
      return;
    }
    if (replyButton) {
      const form = replyButton.closest("[data-chat-thread]")?.querySelector("[data-chat-send]");
      const message = replyButton.closest(".chat-message");
      const input = form?.querySelector('input[name="replyTo"]');
      const context = form?.querySelector("[data-chat-reply-context]");
      if (input && context && message) {
        input.value = replyButton.dataset.chatReply;
        context.querySelector("span").textContent = `Respondendo: ${(message.querySelector("p")?.textContent || "mensagem").slice(0, 140)}`;
        context.hidden = false;
        form.querySelector("textarea[name='body']")?.focus();
      }
      return;
    }
    if (clearReplyButton) {
      const form = clearReplyButton.closest("[data-chat-send]");
      if (form) {
        form.querySelector('input[name="replyTo"]').value = "";
        form.querySelector("[data-chat-reply-context]").hidden = true;
      }
      return;
    }
    if (openButton) {
      event.preventDefault();
      const conversationId = openButton.dataset.chatOpen;
      await openConversation(root, client, conversationId, userId);
      return;
    }
    if (startButton) {
      startButton.disabled = true;
      try {
        const { data, error } = await client.functions.invoke("looply-chat", { body: { action: "create_direct", targetId: startButton.dataset.chatStart } });
        if (error) throw error;
        if (!data?.conversationId) throw new Error(data?.errorCode || "conversation unavailable");
        activeConversationId = data.conversationId;
        await refreshChat(root, client, userId);
        await openConversation(root, client, data.conversationId, userId);
      } catch (error) {
        console.error("Looply direct conversation failed", error);
        startButton.insertAdjacentHTML("afterend", `<small class="chat-inline-error">Não foi possível iniciar agora.</small>`);
      } finally { startButton.disabled = false; }
    }
  });

  root.addEventListener("click", (event) => {
    const back = event.target.closest("[data-chat-back]");
    if (!back) return;
    if (root.dataset.conversationPage === "true") {
      window.location.replace("chat.html");
      return;
    }
    if(window.history.state?.looplyChatThread){window.history.back();return;}
    activeConversationId = null;
    activeThreadRequest += 1;
    refreshSequence += 1;
    root.querySelector("[data-chat-area]")?.classList.remove("is-conversation-open");
    root.dispatchEvent(new CustomEvent("looply:chat-rendered"));
    const thread = root.querySelector("[data-chat-thread]");
    if (thread) thread.innerHTML = `<div class="chat-empty chat-thread-empty"><strong>Nenhuma conversa selecionada.</strong><span>Escolha uma conversa ou encontre uma pessoa.</span></div>`;
  });

  // Pilha de voltar previsível: [anterior] > RAIZ > LISTA > CONVERSA.
  // Voltar na conversa fecha a conversa; voltar na lista leva ao início.
  const inConversationPage = root.dataset.conversationPage === "true";
  try {
    window.history.replaceState({...window.history.state,looplyChatRoot:true,looplyChatThread:false},"",window.location.href);
    window.history.pushState({...window.history.state,looplyChatRoot:false,looplyChatList:true,looplyChatThread:false},"",window.location.href);
  } catch (error) { console.warn("Looply chat history unavailable", error); }
  const onChatBack=(event)=>{
    if(event?.state?.looplyChatRoot){window.location.replace(inConversationPage?"chat.html":"home.html");return;}
    if(root.dataset.conversationPage === "true")return;
    if(event?.state?.looplyChatThread)return;
    activeConversationId=null;
    activeThreadRequest+=1;
    refreshSequence+=1;
    root.querySelector("[data-chat-area]")?.classList.remove("is-conversation-open");
    root.dispatchEvent(new CustomEvent("looply:chat-rendered"));
  };
  window.addEventListener("popstate",onChatBack);
  window.addEventListener("pagehide",()=>window.removeEventListener("popstate",onChatBack),{once:true});
  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-chat-conversation-search]")) {
      conversationSearch = event.target.value;
      applyConversationFilter(root);
      return;
    }

  });

  root.addEventListener("change", (event) => {
    const select = event.target.closest("[data-chat-audio-rate]");
    if (select) {
      const audio = select.closest(".chat-audio-player")?.querySelector("audio");
      if (audio) audio.playbackRate = Math.min(2, Math.max(0.5, Number(select.value) || 1));
      return;
    }
    const attachmentInput = event.target.closest('input[name="files"]');
    const stickerInput = event.target.closest('input[name="sticker"]');
    if (stickerInput) {
      const form = stickerInput.closest("[data-chat-send]");
      const picker = form?.querySelector("[data-chat-sticker-picker]");
      const file = stickerInput.files?.[0];
      if (!form || !picker) return;
      if (!file) { setStatus(form, "Seleção de figurinha cancelada.", "info"); return; }
      const normalized = normalizedAttachment(file);
      if (!normalized || !normalized.type.startsWith("image/") || !["image/jpeg", "image/png", "image/webp"].includes(normalized.type) || normalized.size > 10 * 1024 * 1024) {
        stickerInput.value = "";
        setStatus(form, "Escolha uma imagem JPG, PNG ou WebP de até 10 MiB. Figurinhas animadas ainda não são aceitas pelo armazenamento seguro do chat.", "error");
        return;
      }
      const stickerFile = new File([normalized], `sticker-${Date.now()}.${fileExtensions.get(normalized.type)}`, { type: normalized.type, lastModified: Date.now() });
      const preview = picker.querySelector("[data-chat-sticker-preview]");
      if (preview?.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
      const objectUrl = URL.createObjectURL(stickerFile);
      form._looplyStickerFile = stickerFile;
      if (preview) {
        preview.replaceChildren();
        const image = document.createElement("img");
        image.src = objectUrl;
        image.alt = "Prévia da figurinha";
        preview.append(image);
        preview.dataset.objectUrl = objectUrl;
        preview.hidden = false;
      }
      const confirm = picker.querySelector("[data-chat-sticker-confirm]");
      if (confirm) confirm.disabled = false;
      stickerInput.value = "";
      setStatus(form, "Prévia pronta. Confirme para anexar a figurinha.", "info");
      return;
    }
    if (!attachmentInput) return;
    const form = attachmentInput.closest("[data-chat-send]");
    if (!form) return;
    const files = [...attachmentInput.files];
    if (!files.length) {
      setStatus(form, "Seleção de arquivo cancelada.", "info");
      return;
    }
    try {
      const accepted = selectedFiles(new FormData(form));
      setStatus(form, `${accepted.length} arquivo${accepted.length === 1 ? "" : "s"} pronto${accepted.length === 1 ? "" : "s"} para enviar.`, "info");
    } catch {
      setStatus(form, "Formato inválido, arquivo acima de 25 MiB ou mais de 8 anexos.", "error");
    }
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-chat-search], form[data-chat-group-create], form[data-letter-send], form[data-chat-send], form[data-chat-edit-message]");
    const userId = getUserId?.();
    if (!form || !client || !userId) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const values = new FormData(form);
      if (form.matches("[data-chat-send]")) appendRecordedAudio(form, values);
      if (form.matches("[data-chat-edit-message]")) {
        const body = String(values.get("body") || "").trim();
        if (!body) throw new Error("empty message");
        const { data, error } = await client.from("chat_messages").update({ body })
          .eq("id", form.dataset.messageId).eq("conversation_id", form.dataset.conversationId).select("id").maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("message update unavailable");
        await openConversation(root, client, form.dataset.conversationId, userId);
      } else if (form.matches("[data-chat-group-create]")) {
        const subject = String(values.get("subject") || "").trim();
        const targetIds = values.getAll("memberIds").map((value) => String(value));
        if (!subject || subject.length > 120 || targetIds.length < 2 || targetIds.length > 49 || new Set(targetIds).size !== targetIds.length) throw new Error("invalid group");
        const { data, error } = await client.functions.invoke("looply-chat", { body: { action: "create_group", subject, targetIds } });
        if (error) throw error;
        if (!data?.conversationId) throw new Error(data?.errorCode || "group unavailable");
        const draft=groupCoverDrafts.get(form);
        const cover=draft||values.get("groupCover");
        if(cover instanceof File&&cover.size){
          await saveNewGroupCover(data.conversationId,userId,cover,text=>setStatus(form,text),Boolean(draft));
        }
        groupCoverDrafts.delete(form);
        form.reset();
        activeConversationId = data.conversationId;
        setStatus(form, "Grupo criado.");
        await refreshChat(root, client, userId);
        if (root.dataset.conversationPage !== "true") {
          window.location.assign(`conversa.html?id=${encodeURIComponent(data.conversationId)}`);
          return;
        }
        await openConversation(root, client, data.conversationId, userId);
      } else if (form.matches("[data-chat-search]")) {
        const query = String(values.get("query") || "").trim().toLowerCase();
        if (!/^[a-z0-9_]{3,30}$/.test(query)) throw new Error("invalid query");
        const { data, error } = await client.from("profiles").select("id,username,display_name,avatar_path").ilike("username", `${query}%`).neq("id", userId).order("username").limit(20);
        if (error) throw error;
        const profiles = data || [];
        const avatarProfiles = profiles.filter((profile) => profile.avatar_path);
        if (avatarProfiles.length) {
          const { data: signed } = await cachedSignedUrls(client, "looply-avatars", avatarProfiles.map((profile) => profile.avatar_path), 1800);
          if (signed) avatarProfiles.forEach((profile, index) => { profile.avatarUrl = signed[index]?.signedUrl || ""; });
        }
        const container = root.querySelector("[data-chat-people]");
        if (container) container.innerHTML = profiles.map((profile) => `<article class="chat-person">${profile.avatarUrl ? `<img class="chat-person-avatar" data-profile-avatar-id="${escapeHtml(profile.id)}" src="${escapeHtml(profile.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="chat-person-avatar" aria-hidden="true">${escapeHtml((profile.display_name || profile.username || "?").slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>`}<span><a href="perfil.html?usuario=${encodeURIComponent(profile.id)}"><strong data-profile-name-id="${escapeHtml(profile.id)}">${escapeHtml(profile.display_name || profile.username)}</strong><small>@${escapeHtml(profile.username)}</small></a></span><button class="text-button" type="button" data-chat-start="${escapeHtml(profile.id)}">Conversar</button></article>`).join("") || `<p class="chat-empty">Nenhum perfil visível correspondeu à busca.</p>`;
        setStatus(form, `${profiles.length} perfil(is) encontrado(s).`);
      } else if (form.matches("[data-letter-send]")) {
        const subject = String(values.get("subject") || "").trim();
        const body = String(values.get("body") || "").trim();
        const { data, error } = await client.functions.invoke("looply-chat", { body: { action: "create_letter", subject, body } });
        if (error) throw error;
        if (!data?.conversationId) throw new Error(data?.errorCode || "letter unavailable");
        form.reset();
        activeConversationId = data.conversationId;
        setStatus(form, "Carta enviada e guardada numa conversa privada.");
        await refreshChat(root, client, userId);
        await openConversation(root, client, data.conversationId, userId);
      } else {
        const conversationId = form.dataset.conversationId;
        const files = selectedFiles(values);
        const body = String(values.get("body") || "").trim() || (files.length ? "Compartilhou arquivos." : "");
        if (!body) throw new Error("empty message");
        const message = await insertChatMessage(client, conversationId, userId, body, String(values.get("replyTo") || "") || null);
        const uploadedPaths = [];
        try {
          for (const [index, file] of files.entries()) {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "arquivo";
            const path = `conversations/${conversationId}/${message.id}/${crypto.randomUUID()}.${fileExtensions.get(file.type.split(";")[0])}`;
            setStatus(form, `Enviando arquivo ${index + 1} de ${files.length}: 0%`);
            await uploadResumable(client, path, file, (percentage) => setStatus(form, `Enviando arquivo ${index + 1} de ${files.length}: ${percentage}%`));
            uploadedPaths.push(path);
            const { error: mediaError } = await client.from("chat_media").insert({
              conversation_id: conversationId, message_id: message.id, created_by: userId, storage_path: path,
              mime_type: file.type.split(";")[0], byte_size: file.size, file_name: safeName
            });
            if (mediaError) throw mediaError;
          }
        } catch (error) {
          if (uploadedPaths.length) await client.storage.from("looply-chat").remove(uploadedPaths);
          await client.from("chat_messages").delete().eq("id", message.id);
          throw error;
        }
        if (form._looplyRecordedFile) {
          const preview = form.querySelector("[data-chat-record-preview]");
          if (preview?.src?.startsWith("blob:")) URL.revokeObjectURL(preview.src);
          delete form._looplyRecordedFile;
        }
        const stickerPreview = form.querySelector("[data-chat-sticker-preview]");
        if (stickerPreview?.dataset.objectUrl) URL.revokeObjectURL(stickerPreview.dataset.objectUrl);
        if (stickerPreview) { stickerPreview.replaceChildren(); stickerPreview.hidden = true; delete stickerPreview.dataset.objectUrl; }
        form._looplyStickerFile = null;
        form.reset();
        setStatus(form, files.length ? "Mensagem e anexos enviados." : "Mensagem enviada.");
        publishChatMessage(root, client, conversationId, message.id);
        await openConversation(root, client, conversationId, userId);
      }
    } catch (error) {
      console.error("Looply chat action failed", error);
      let message;
      if (/invalid group/.test(String(error?.message || ""))) message = "Informe um nome e selecione de duas a 49 pessoas para o grupo.";
      else if (/profile_unavailable/i.test(String(error?.message || ""))) message = "Um dos perfis selecionados não está disponível para participar do grupo.";
      else if (/unsupported attachment/.test(String(error?.message || ""))) message = "Formato inválido, arquivo acima de 25 MiB ou mais de 8 anexos.";
      else if (/empty message/.test(String(error?.message || ""))) message = "Escreva uma mensagem ou escolha ao menos um arquivo.";
      else if (/message update unavailable/i.test(String(error?.message || ""))) message = "A mensagem não foi atualizada. Ela pode ter sido removida ou você não tem permissão.";
      else if (/peixinho_admin_not_ready/i.test(String(error?.message || ""))) message = "A caixa de cartas abrirá assim que Peixinho concluir a nova conta administrativa.";
      else message = "Não foi possível concluir. Confira sua conexão e as permissões e tente novamente.";
      setStatus(form, message, "error");
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function applyConversationFilter(root) {
  const items = [...root.querySelectorAll("[data-chat-conversations] [data-chat-open]")];
  let visible = 0;
  const query = conversationSearch.trim().toLocaleLowerCase("pt-BR");
  const activeFilter = root.querySelector('[data-chat-filter][aria-pressed="true"]')?.dataset.chatFilter || conversationFilter;
  const favorites = new Set();
  try {
    const userId = root.dataset.chatUserId || "";
    const stored = userId ? localStorage.getItem(`looply-chat-v2:${userId}:favorites`) : null;
    const parsed = stored ? JSON.parse(stored) : [];
    if (Array.isArray(parsed)) parsed.forEach((id) => favorites.add(String(id)));
  } catch { /* Local favorites are optional; other filters remain usable. */ }
  for (const item of items) {
    const matchesQuery = !query || item.textContent.toLocaleLowerCase("pt-BR").includes(query);
    const matchesFilter = matchesConversationFilter({
      id: item.dataset.chatOpen,
      kind: item.dataset.chatKind,
      unreadCount: item.dataset.chatUnreadCount
    }, activeFilter, favorites);
    item.hidden = !(matchesQuery && matchesFilter);
    if (!item.hidden) visible += 1;
  }
  const noMatches = root.querySelector("[data-chat-no-matches]");
  if (noMatches) {
    const emptyMessage = activeFilter === "favorites"
      ? "Nenhuma conversa favorita. Toque na estrela de uma conversa para favoritar."
      : activeFilter === "groups"
        ? "Nenhum grupo encontrado."
        : activeFilter === "unread"
          ? "Nenhuma mensagem não lida."
          : "Nenhuma conversa corresponde à busca.";
    if (noMatches.textContent !== emptyMessage) noMatches.textContent = emptyMessage;
    noMatches.hidden = !items.length || visible > 0;
  }
}

