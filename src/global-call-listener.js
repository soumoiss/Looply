const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const pendingKey = (userId) => `looply:pending-call:${userId}`;

export function setupGlobalCallListener(client, userId, profile) {
  if (!client || client.supportsRealtime === false || !userId || window.__looplyGlobalCallListener) return;
  window.__looplyGlobalCallListener = true;
  const channels = new Map();
  let incoming = null;
  let overlay = null;
  let closed = false;

  const activeConversationId = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || params.get("conversation")
      || document.querySelector(".chat-thread-heading")?.dataset.conversationId
      || document.querySelector("[data-chat-send]")?.dataset.conversationId
      || "";
  };
  const ensureOverlay = () => {
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.className = "looply-global-call-notice";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "looplyGlobalCallTitle");
    overlay.hidden = true;
    overlay.innerHTML = `<section class="looply-global-call-card"><span class="looply-global-call-kicker">Looply · Chamada recebida</span><h2 id="looplyGlobalCallTitle"></h2><p data-global-call-description></p><div class="looply-global-call-actions"><button type="button" data-global-call-decline>Recusar</button><button type="button" data-global-call-accept>Atender</button></div></section>`;
    document.body.append(overlay);
    return overlay;
  };
  const hideOverlay = () => {
    if (overlay) overlay.hidden = true;
    incoming = null;
  };
  const signal = async (call, type) => {
    if (!call?.conversationId) return;
    let sent = false;
    if (call.channel) {
      try {
        const result = await call.channel.send({ type: "broadcast", event: "signal", payload: {
          type, conversationId: call.conversationId, senderId: userId
        } });
        sent = result === "ok" || result?.status === "ok";
      } catch (error) { console.warn("Looply global channel response failed", error); }
    }
    // Declining from Home / Cartas / Músicas must also work if the WebSocket
    // is unavailable: write the signal through the membership-scoped Neon RPC.
    if (!sent) await client.sendIncomingCallSignal?.(call.conversationId, type);
  };
  const showIncoming = (call, payload) => {
    // The same offer can arrive from both the fast WebSocket and the Neon inbox.
    // Do not ring twice, reset focus, or replace the modal every retry.
    if (incoming?.conversationId === call.conversationId &&
        incoming?.payload?.senderId === payload.senderId) return;
    if (incoming && incoming.conversationId !== call.conversationId) {
      void signal(call, "decline");
      return;
    }
    incoming = { ...call, payload };
    const modal = ensureOverlay();
    const sender = call.participants.find((p) => p.user_id === payload.senderId)?.profile;
    const name = payload.senderName || sender?.display_name || sender?.username || "Alguém";
    modal.querySelector("#looplyGlobalCallTitle").textContent = name;
    modal.querySelector("[data-global-call-description]").textContent =
      `${name} está ligando por ${payload.mode === "video" ? "vídeo" : "áudio"}.`;
    modal.hidden = false;
    modal.querySelector("[data-global-call-accept]").focus();
  };
  const subscribeConversation = async (conversation) => {
    if (closed || channels.has(conversation.id) || conversation.kind !== "direct") return;
    const participants = conversation.participants || [];
    if (!participants.some((p) => p.user_id === userId)) return;
    const channel = client.channel(`looply-call-${conversation.id}`, {
      config: { private: true, broadcast: { ack: true, self: false } },
      // The single global Neon inbox below replaces one DB poll per room.
      skipFallback: true
    });
    const call = { channel, conversationId: conversation.id, participants };
    channels.set(conversation.id, call);
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      if (!payload || payload.conversationId !== conversation.id || payload.senderId === userId) return;
      if (!participants.some((p) => p.user_id === payload.senderId)) return;
      // The chat page already has its own WebRTC controller for the open thread.
      if (activeConversationId() === conversation.id) return;
      if (payload.type === "offer") {
        if (!payload.description || !["audio", "video"].includes(payload.mode)) return;
        showIncoming(call, payload);
      } else if (payload.type === "hangup" || payload.type === "decline" || payload.type === "failed") {
        if (incoming?.conversationId === conversation.id) hideOverlay();
      }
    });
    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.warn("Looply global call channel unavailable", conversation.id, status);
      }
    });
  };

  overlay = ensureOverlay();

  // Start ONE low-latency, authorization-checked Neon inbox immediately.
  // It works even while the user is on Home, Cartas, Músicas or another tab,
  // including when Cloudflare cannot establish private WebSocket channels.
  const stopInbox = typeof client.subscribeCallInbox === "function"
    ? client.subscribeCallInbox(({ conversationId, senderId, payload }) => {
        if (closed || !conversationId || senderId === userId ||
            activeConversationId() === conversationId) return;
        const call = channels.get(conversationId) || {
          conversationId, participants: [], channel: null
        };
        if (payload.type === "offer") {
          if (!payload.description || !["audio","video"].includes(payload.mode)) return;
          showIncoming(call, payload);
        } else if (["hangup","decline","failed"].includes(payload.type) &&
                   incoming?.conversationId === conversationId) {
          hideOverlay();
        }
      }, error => console.warn("Looply global Neon incoming-call inbox", error?.message))
    : () => {};

  overlay.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || !incoming) return;
    const call = incoming;
    if (button.matches("[data-global-call-decline]")) {
      hideOverlay();
      await signal(call, "decline");
      return;
    }
    if (button.matches("[data-global-call-accept]")) {
      button.disabled = true;
      try {
        const session = await client.auth.getSession();
        if (session.error || !session.data?.session?.access_token) throw new Error("session unavailable");
        sessionStorage.setItem(pendingKey(userId), JSON.stringify({
          ...call.payload, conversationId: call.conversationId, accepted: true, savedAt: Date.now()
        }));
        hideOverlay();
        window.location.assign(`conversa.html?id=${encodeURIComponent(call.conversationId)}`);
      } catch (error) {
        console.error("Looply incoming call handoff failed", error);
        button.disabled = false;
        const description = overlay.querySelector("[data-global-call-description]");
        if (description) description.textContent = "Não foi possível abrir a chamada. Tente novamente.";
      }
    }
  });

  void (async () => {
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) return;
      await client.realtime.setAuth(sessionData.session.access_token);
      const { data: memberships, error: membershipsError } = await client
        .from("conversation_participants").select("conversation_id").eq("user_id", userId);
      if (membershipsError) throw membershipsError;
      const ids = [...new Set((memberships || []).map((row) => row.conversation_id).filter(Boolean))];
      if (!ids.length || closed) return;
      const { data: conversations, error: conversationsError } = await client.from("conversations")
        .select("id,kind,participants:conversation_participants(user_id,profile:profiles!conversation_participants_user_id_fkey(username,display_name))")
        .in("id", ids);
      if (conversationsError) throw conversationsError;
      await Promise.all((conversations || []).filter((item) => item.kind === "direct").map(subscribeConversation));
    } catch (error) {
      console.error("Looply global incoming-call listener failed", error);
    }
  })();

  window.addEventListener("pagehide", () => {
    closed = true;
    hideOverlay();
    stopInbox();
    for (const { channel } of channels.values()) void client.removeChannel(channel);
    channels.clear();
    window.__looplyGlobalCallListener = false;
  }, { once: true });
}
