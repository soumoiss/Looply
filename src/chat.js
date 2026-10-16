const fileExtensions = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"],
  ["video/mp4", "mp4"], ["video/webm", "webm"], ["audio/mp4", "mp4"],
  ["audio/mpeg", "mp3"], ["audio/ogg", "ogg"], ["audio/webm", "webm"],
  ["application/pdf", "pdf"], ["text/plain", "txt"]
]);
const maxFileSize = 100 * 1024 * 1024;
const maxFilesPerMessage = 8;

let activeConversationId = null;
let realtimeChannel = null;
let realtimeUserId = null;
let refreshTimer = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export async function loadChatData(client, userId) {
  const [participantResult, notificationResult, profilesResult] = await Promise.all([
    client.from("conversation_participants").select("conversation_id,last_read_at").eq("user_id", userId),
    client.from("chat_notifications").select("id,conversation_id,kind,preview,created_at,read_at").order("created_at", { ascending: false }).limit(50),
    client.from("profiles").select("id,username,display_name").order("username").limit(100)
  ]);
  if (participantResult.error) throw participantResult.error;
  const participants = participantResult.data || [];
  const ids = participants.map((row) => row.conversation_id);
  let conversations = [];
  if (ids.length) {
    const { data, error } = await client.from("conversations")
      .select("id,kind,subject,created_by,created_at,updated_at,participants:conversation_participants(user_id,profile:profiles!conversation_participants_user_id_fkey(id,username,display_name))")
      .in("id", ids).order("updated_at", { ascending: false }).limit(50);
    if (error) throw error;
    conversations = data || [];
  }
  const readByConversation = new Map(participants.map((row) => [row.conversation_id, row.last_read_at]));
  const unreadByConversation = new Map();
  for (const notification of notificationResult.data || []) {
    if (!notification.read_at) unreadByConversation.set(notification.conversation_id, (unreadByConversation.get(notification.conversation_id) || 0) + 1);
  }
  return {
    conversations: conversations.map((conversation) => ({
      ...conversation,
      lastReadAt: readByConversation.get(conversation.id),
      unreadCount: unreadByConversation.get(conversation.id) || 0
    })),
    notifications: notificationResult.data || [],
    profiles: profilesResult.data || [],
    profilesError: profilesResult.error
  };
}

function conversationLabel(conversation, userId) {
  if (conversation.kind === "letter") return `Carta · ${conversation.subject || "para Peixinho"}`;
  const other = (conversation.participants || []).find((row) => row.user_id !== userId)?.profile;
  return other ? `${other.display_name || other.username} · @${other.username}` : "Conversa privada";
}

function notificationsMarkup(notifications) {
  const unread = notifications.filter((item) => !item.read_at).length;
  if (!notifications.length) return `<p class="chat-empty">Suas notificações de conversas aparecerão aqui.</p>`;
  return `<div class="chat-notification-list">${notifications.slice(0, 5).map((item) => `<button type="button" class="chat-notification ${item.read_at ? "is-read" : ""}" data-chat-open="${escapeHtml(item.conversation_id)}">
    <span class="chat-notification-kind">${item.kind === "letter" ? "Carta" : "Mensagem"}</span><span>${escapeHtml(item.preview)}</span><time>${escapeHtml(formatDate(item.created_at))}</time>
  </button>`).join("")}</div><span class="chat-count">${unread} não lida${unread === 1 ? "" : "s"}</span>`;
}

export function chatMarkup(data, userId) {
  if (data.error) return `<section class="chat-area" data-chat-area aria-labelledby="chatTitle"><div class="chat-heading"><div><span class="section-kicker">Mensagens</span><h2 id="chatTitle">Conversas e cartas</h2></div></div><div class="chat-empty" role="alert">Não foi possível carregar as conversas. Atualize a página e tente novamente.</div></section>`;
  const conversations = data.conversations.length
    ? data.conversations.map((conversation) => `<button type="button" class="chat-conversation ${conversation.id === activeConversationId ? "is-active" : ""}" data-chat-open="${escapeHtml(conversation.id)}">
        <span class="chat-conversation-avatar" aria-hidden="true">${conversation.kind === "letter" ? "✉" : "↗"}</span>
        <span class="chat-conversation-copy"><strong>${escapeHtml(conversationLabel(conversation, userId))}</strong><small>${conversation.kind === "letter" ? "Carta privada" : "Conversa privada"} · ${escapeHtml(formatDate(conversation.updated_at))}</small></span>
        ${conversation.unreadCount ? `<span class="chat-unread">${conversation.unreadCount}</span>` : ""}
      </button>`).join("")
    : `<p class="chat-empty">Nenhuma conversa. Inicie uma conversa ou escreva uma carta.</p>`;
  const people = (data.profiles || []).filter((profile) => profile.id !== userId).map((profile) => `<article class="chat-person">
    <span><strong>${escapeHtml(profile.display_name || profile.username)}</strong><small>@${escapeHtml(profile.username)}</small></span>
    <button class="text-button" type="button" data-chat-start="${escapeHtml(profile.id)}">Conversar</button>
  </article>`).join("");
  const searchMessage = data.profilesError
    ? `<p class="chat-empty" role="alert">Não foi possível carregar os perfis para iniciar uma conversa.</p>`
    : `<div class="chat-people-list" data-chat-people>${people || `<p class="chat-empty">Nenhum outro perfil está visível agora.</p>`}</div>`;
  return `<section class="chat-area" data-chat-area aria-labelledby="chatTitle">
    <div class="chat-heading"><div><span class="section-kicker">Mensagens</span><h2 id="chatTitle">Conversas e cartas</h2></div><span class="chat-live" data-chat-live role="status">Atualizações ao vivo</span></div>
    <div class="chat-layout">
      <aside class="chat-sidebar">
        <section class="chat-panel" aria-label="Suas conversas"><div class="chat-panel-heading"><h3>Conversas</h3><span>${data.conversations.length}</span></div><div class="chat-conversation-list" data-chat-conversations>${conversations}</div></section>
        <details class="chat-panel chat-search-panel"><summary>Encontrar uma pessoa</summary>
          <form class="chat-search-form" data-chat-search><label class="visually-hidden" for="chatSearch">Username</label><input id="chatSearch" name="query" type="text" minlength="3" maxlength="30" pattern="[A-Za-z0-9_]{3,30}" required placeholder="Buscar pelo username"><button class="text-button" type="submit">Buscar</button></form>
          ${searchMessage}
        </details>
        <details class="chat-panel letter-compose-panel"><summary>Escrever uma carta para Peixinho</summary>
          <form class="letter-form" data-letter-send><div class="field"><label for="letterSubject">Assunto</label><input id="letterSubject" name="subject" maxlength="120" required placeholder="Um título para sua carta"></div>
            <div class="field"><label for="letterBody">Mensagem</label><textarea id="letterBody" name="body" maxlength="5000" rows="5" required placeholder="Escreva sua carta"></textarea></div>
            <p class="field-hint">Somente você e Peixinho poderão abrir esta carta. A resposta continuará na conversa privada.</p>
            <button class="primary-button compact-button" type="submit">Enviar carta <span aria-hidden="true">↗</span></button><span class="form-status" data-status role="status" aria-live="polite"></span>
          </form>
        </details>
        <details class="chat-panel chat-notifications-panel"><summary>Notificações <span class="chat-summary-unread">${data.notifications.filter((item) => !item.read_at).length}</span></summary>${notificationsMarkup(data.notifications)}</details>
      </aside>
      <section class="chat-thread-panel" aria-label="Mensagens da conversa"><div class="chat-thread" data-chat-thread><div class="chat-empty chat-thread-empty"><strong>Nenhuma conversa selecionada.</strong><span>Escolha uma conversa ou encontre uma pessoa.</span></div></div></section>
    </div>
  </section>`;
}

function setStatus(form, message, kind = "success") {
  const status = form.querySelector("[data-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function selectedFiles(formData) {
  const files = formData.getAll("files").filter((file) => file instanceof File && file.size > 0);
  if (files.length > maxFilesPerMessage || files.some((file) => !fileExtensions.has(file.type) || file.size > maxFileSize)) {
    throw new Error("unsupported attachment");
  }
  return files;
}

async function uploadResumable(client, path, file, onProgress) {
  const { data, error } = await client.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (error || !accessToken) throw new Error("session expired");
  const projectUrl = new URL(window.LOOPLY_CONFIG.supabaseUrl);
  const endpoint = projectUrl.hostname.endsWith(".supabase.co")
    ? `${projectUrl.protocol}//${projectUrl.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")}/storage/v1/upload/resumable`
    : new URL("/storage/v1/upload/resumable", projectUrl).toString();
  const tus = await import("https://esm.sh/tus-js-client@4.3.1");
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${accessToken}` },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: "looply-chat", objectName: path, contentType: file.type, cacheControl: "3600" },
      onError: reject,
      onProgress: (uploaded, total) => onProgress(Math.floor(uploaded / total * 100)),
      onSuccess: resolve
    });
    upload.start();
  });
}

function renderMedia(media) {
  if (!media.signedUrl) return `<span class="chat-media-unavailable">Anexo temporariamente indisponível.</span>`;
  const url = escapeHtml(media.signedUrl);
  const fileName = escapeHtml(media.file_name);
  if (media.mime_type.startsWith("image/")) return `<a class="chat-image-link" href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="${fileName}" loading="lazy" referrerpolicy="no-referrer"></a>`;
  if (media.mime_type.startsWith("video/")) return `<video src="${url}" controls preload="metadata" aria-label="${fileName}"></video>`;
  if (media.mime_type.startsWith("audio/")) return `<audio src="${url}" controls preload="metadata" aria-label="${fileName}"></audio>`;
  return `<a class="chat-file-link" href="${url}" target="_blank" rel="noopener noreferrer">↗ ${fileName}</a>`;
}

async function loadThread(client, conversationId, before = null) {
  let messageQuery = client.from("chat_messages")
    .select("id,conversation_id,sender_id,reply_to,body,created_at,author:profiles!chat_messages_sender_id_fkey(username,display_name),media:chat_media!chat_media_message_fk(id,storage_path,mime_type,file_name,byte_size)")
    .eq("conversation_id", conversationId);
  if (before) messageQuery = messageQuery.lt("created_at", before);
  const [messageResult, participantResult] = await Promise.all([
    messageQuery.order("created_at", { ascending: false }).limit(100),
    client.from("conversation_participants").select("user_id,last_read_at").eq("conversation_id", conversationId)
  ]);
  if (messageResult.error) throw messageResult.error;
  if (participantResult.error) throw participantResult.error;
  const messages = (messageResult.data || []).reverse();
  const media = messages.flatMap((message) => message.media || []);
  if (media.length) {
    const { data: signed, error: signedError } = await client.storage.from("looply-chat").createSignedUrls(media.map((item) => item.storage_path), 1800);
    if (!signedError && signed) media.forEach((item, index) => { item.signedUrl = signed[index]?.signedUrl || null; });
  }
  return { messages, participants: participantResult.data || [] };
}

function olderMessagesButton(conversationId, oldestMessage) {
  return `<button class="chat-load-older" type="button" data-chat-load-older data-conversation-id="${escapeHtml(conversationId)}" data-before="${escapeHtml(oldestMessage.created_at)}">Carregar mensagens anteriores</button>`;
}

function threadMarkup(messages, userId, peerReadAt = null) {
  if (!messages.length) return `<div class="chat-empty"><strong>Esta conversa está pronta.</strong><span>Envie a primeira mensagem.</span></div>`;
  const byId = new Map(messages.map((message) => [message.id, message]));
  return messages.map((message) => {
    const parent = message.reply_to ? byId.get(message.reply_to) : null;
    const replyContext = message.reply_to ? `<small class="chat-reply-preview">↳ ${escapeHtml(parent ? (parent.body || "mensagem").slice(0, 120) : "Respondeu a uma mensagem anterior")}</small>` : "";
    return `<article class="chat-message ${message.sender_id === userId ? "is-mine" : ""}">
    <div class="chat-message-meta"><strong>${escapeHtml(message.sender_id === userId ? "Você" : message.author?.display_name || message.author?.username || "Perfil restrito")}</strong><time>${escapeHtml(formatDate(message.created_at))}</time></div>
    ${replyContext}<p>${escapeHtml(message.body)}</p>${message.media?.length ? `<div class="chat-message-media">${message.media.map(renderMedia).join("")}</div>` : ""}${message.sender_id === userId ? `<small class="chat-delivery">${peerReadAt && new Date(peerReadAt) >= new Date(message.created_at) ? "Lida" : "Enviada"}</small>` : ""}
    <button class="chat-reply-button" type="button" data-chat-reply="${escapeHtml(message.id)}">Responder</button>
  </article>`;
  }).join("");
}

function messageComposerMarkup(conversationId) {
  return `<form class="chat-message-form" data-chat-send data-conversation-id="${escapeHtml(conversationId)}">
    <input type="hidden" name="replyTo" value=""><p class="chat-reply-context" data-chat-reply-context hidden><span></span><button type="button" data-chat-reply-clear aria-label="Cancelar resposta">×</button></p>
    <label class="visually-hidden" for="message-${escapeHtml(conversationId)}">Mensagem</label><textarea id="message-${escapeHtml(conversationId)}" name="body" maxlength="5000" rows="2" placeholder="Escreva uma mensagem..."></textarea>
    <div class="chat-message-actions"><label class="chat-attachment-label" for="files-${escapeHtml(conversationId)}">Anexar fotos, vídeos, áudio ou arquivos</label><input id="files-${escapeHtml(conversationId)}" name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mp4,audio/mpeg,audio/ogg,audio/webm,application/pdf,text/plain"><span class="field-hint">Até 8 arquivos, 100 MiB cada.</span><button class="primary-button compact-button" type="submit">Enviar <span aria-hidden="true">↗</span></button></div>
    <span class="form-status" data-status role="status" aria-live="polite"></span></form>`;
}

async function openConversation(root, client, conversationId, userId) {
  activeConversationId = conversationId;
  const thread = root.querySelector("[data-chat-thread]");
  if (!thread) return;
  thread.innerHTML = `<p class="chat-empty" role="status">Carregando mensagens...</p>`;
  try {
    const { messages, participants } = await loadThread(client, conversationId);
    if (activeConversationId !== conversationId || !root.querySelector("[data-chat-thread]")) return;
    const peerReadAt = participants.find((participant) => participant.user_id !== userId)?.last_read_at || null;
    thread.innerHTML = `${messages.length === 100 ? olderMessagesButton(conversationId, messages[0]) : ""}${threadMarkup(messages, userId, peerReadAt)}${messageComposerMarkup(conversationId)}`;
    thread.scrollTop = thread.scrollHeight;
    await Promise.all([
      client.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("user_id", userId),
      client.from("chat_notifications").update({ read_at: new Date().toISOString() }).eq("conversation_id", conversationId).is("read_at", null)
    ]);
    await refreshChat(root, client, userId, { keepThread: true });
  } catch (error) {
    console.error("Looply conversation load failed", error);
    if (thread.isConnected) thread.innerHTML = `<p class="chat-empty" role="alert">Não foi possível carregar esta conversa. Confira o acesso e tente novamente.</p>`;
  }
}

async function refreshChat(root, client, userId, { keepThread = false } = {}) {
  const area = root.querySelector("[data-chat-area]");
  if (!area) return;
  try {
    const data = await loadChatData(client, userId);
    if (!root.querySelector("[data-chat-area]")) return;
    area.outerHTML = chatMarkup(data, userId);
    if (keepThread && activeConversationId && data.conversations.some((row) => row.id === activeConversationId)) {
      const { messages, participants } = await loadThread(client, activeConversationId);
      const peerReadAt = participants.find((participant) => participant.user_id !== userId)?.last_read_at || null;
      const thread = root.querySelector("[data-chat-thread]");
      if (thread) thread.innerHTML = `${messages.length === 100 ? olderMessagesButton(activeConversationId, messages[0]) : ""}${threadMarkup(messages, userId, peerReadAt)}${messageComposerMarkup(activeConversationId)}`;
    } else activeConversationId = null;
  } catch (error) {
    console.error("Looply conversation refresh failed", error);
    area.innerHTML = `<div class="chat-empty" role="alert">Não foi possível atualizar as conversas agora.</div>`;
  }
}

function scheduleRefresh(root, client, userId) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await refreshChat(root, client, userId, { keepThread: Boolean(activeConversationId) });
    if (activeConversationId && root.querySelector("[data-chat-thread]")) {
      const thread = root.querySelector("[data-chat-thread]");
      thread.scrollTop = thread.scrollHeight;
    }
  }, 400);
}

export function setupChatRealtime(client, userId, root) {
  if (!client || !userId || (realtimeChannel && realtimeUserId === userId)) return;
  if (realtimeChannel) client.removeChannel(realtimeChannel);
  realtimeUserId = userId;
  realtimeChannel = client.channel(`looply-chat-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => scheduleRefresh(root, client, userId))
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_notifications", filter: `user_id=eq.${userId}` }, () => scheduleRefresh(root, client, userId))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_participants" }, () => scheduleRefresh(root, client, userId))
    .subscribe((state) => {
      const status = root.querySelector("[data-chat-live]");
      if (status) status.textContent = state === "SUBSCRIBED" ? "Atualizações ao vivo" : "Reconectando...";
    });
}

export function disposeChatRealtime(client) {
  if (realtimeChannel && client) client.removeChannel(realtimeChannel);
  realtimeChannel = null;
  realtimeUserId = null;
  activeConversationId = null;
  clearTimeout(refreshTimer);
}

export function bindChatEvents(root, client, getUserId) {
  root.addEventListener("looply:open-conversation", async (event) => {
    const conversationId = event.detail?.conversationId;
    const userId = getUserId?.();
    if (!client || !userId || !conversationId) return;
    activeConversationId = conversationId;
    await refreshChat(root, client, userId);
    await openConversation(root, client, conversationId, userId);
  });

  root.addEventListener("click", async (event) => {
    const openButton = event.target.closest("[data-chat-open]");
    const startButton = event.target.closest("[data-chat-start]");
    const replyButton = event.target.closest("[data-chat-reply]");
    const clearReplyButton = event.target.closest("[data-chat-reply-clear]");
    const olderButton = event.target.closest("[data-chat-load-older]");
    const userId = getUserId?.();
    if (!client || !userId) return;
    if (olderButton) {
      const conversationId = olderButton.dataset.conversationId;
      const before = olderButton.dataset.before;
      olderButton.disabled = true;
      try {
        const { messages, participants } = await loadThread(client, conversationId, before);
        const thread = root.querySelector("[data-chat-thread]");
        if (!thread || activeConversationId !== conversationId) return;
        const scrollHeight = thread.scrollHeight;
        olderButton.remove();
        const nextButton = messages.length === 100 ? olderMessagesButton(conversationId, messages[0]) : "";
        const peerReadAt = participants.find((participant) => participant.user_id !== userId)?.last_read_at || null;
        thread.insertAdjacentHTML("afterbegin", `${nextButton}${threadMarkup(messages, userId, peerReadAt)}`);
        thread.scrollTop += thread.scrollHeight - scrollHeight;
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
    if (openButton) await openConversation(root, client, openButton.dataset.chatOpen, userId);
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

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-chat-search], form[data-letter-send], form[data-chat-send]");
    const userId = getUserId?.();
    if (!form || !client || !userId) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const values = new FormData(form);
      if (form.matches("[data-chat-search]")) {
        const query = String(values.get("query") || "").trim().toLowerCase();
        if (!/^[a-z0-9_]{3,30}$/.test(query)) throw new Error("invalid query");
        const { data, error } = await client.from("profiles").select("id,username,display_name").ilike("username", `${query}%`).neq("id", userId).order("username").limit(20);
        if (error) throw error;
        const container = root.querySelector("[data-chat-people]");
        if (container) container.innerHTML = (data || []).map((profile) => `<article class="chat-person"><span><strong>${escapeHtml(profile.display_name || profile.username)}</strong><small>@${escapeHtml(profile.username)}</small></span><button class="text-button" type="button" data-chat-start="${escapeHtml(profile.id)}">Conversar</button></article>`).join("") || `<p class="chat-empty">Nenhum perfil visível correspondeu à busca.</p>`;
        setStatus(form, `${(data || []).length} perfil(is) encontrado(s).`);
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
        const { data: message, error } = await client.from("chat_messages")
          .insert({ conversation_id: conversationId, reply_to: String(values.get("replyTo") || "") || null, body })
          .select("id").single();
        if (error) throw error;
        const uploadedPaths = [];
        try {
          for (const [index, file] of files.entries()) {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "arquivo";
            const path = `conversations/${conversationId}/${message.id}/${crypto.randomUUID()}.${fileExtensions.get(file.type)}`;
            setStatus(form, `Enviando arquivo ${index + 1} de ${files.length}: 0%`);
            await uploadResumable(client, path, file, (percentage) => setStatus(form, `Enviando arquivo ${index + 1} de ${files.length}: ${percentage}%`));
            uploadedPaths.push(path);
            const { error: mediaError } = await client.from("chat_media").insert({
              conversation_id: conversationId, message_id: message.id, storage_path: path,
              mime_type: file.type, byte_size: file.size, file_name: safeName
            });
            if (mediaError) throw mediaError;
          }
        } catch (error) {
          if (uploadedPaths.length) await client.storage.from("looply-chat").remove(uploadedPaths);
          await client.from("chat_messages").delete().eq("id", message.id);
          throw error;
        }
        form.reset();
        setStatus(form, files.length ? "Mensagem e anexos enviados." : "Mensagem enviada.");
        await openConversation(root, client, conversationId, userId);
      }
    } catch (error) {
      console.error("Looply chat action failed", error);
      const message = /unsupported attachment/.test(String(error?.message || ""))
        ? "Formato inválido, arquivo acima de 100 MiB ou mais de 8 anexos."
        : /empty message/.test(String(error?.message || ""))
          ? "Escreva uma mensagem ou escolha ao menos um arquivo."
          : /peixinho_admin_not_ready/i.test(String(error?.message || ""))
            ? "A caixa de cartas abrirá assim que Peixinho concluir a nova conta administrativa."
            : "Não foi possível concluir. Confira sua conexão e as permissões e tente novamente.";
      setStatus(form, message, "error");
    } finally {
      if (button) button.disabled = false;
    }
  });
}
