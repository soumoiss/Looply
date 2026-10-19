import { hasCallScope, isSignalForCall } from "./call-protocol.js";
import { createCallRingtone } from "./call-ringtone.js";

const pendingKey = (userId) => `looply:pending-call:${userId}`;

export function setupGlobalCallListener(client, userId) {
  if (!client || !userId || window.__looplyGlobalCallListener) return;
  window.__looplyGlobalCallListener = true;
  const channels = new Map();
  let incoming = null;
  let overlay = null;
  let closed = false;
  const ringtone = createCallRingtone({ onBlocked: () => {
    const button = overlay?.querySelector("[data-global-call-enable-ring]");
    if (button) button.hidden = false;
  } });

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
    overlay.innerHTML = '<section class="looply-global-call-card"><span class="looply-global-call-kicker">Looply · Chamada recebida</span><h2 id="looplyGlobalCallTitle"></h2><p data-global-call-description></p><button type="button" data-global-call-enable-ring>Ativar toque</button><div class="looply-global-call-actions"><button type="button" data-global-call-decline>Recusar</button><button type="button" data-global-call-accept>Atender</button></div></section>';
    document.body.append(overlay);
    return overlay;
  };
  const hideOverlay = () => {
    ringtone.stop();
    if (overlay) overlay.hidden = true;
    incoming = null;
  };
  const signal = async (call, type) => {
    if (!call?.channel || !call?.id) return false;
    try {
      const result = await call.channel.send({ type: "broadcast", event: "signal", payload: {
        type, conversationId: call.conversationId, callId: call.id, senderId: userId
      } });
      return result === "ok" || result?.status === "ok";
    } catch (error) {
      console.warn("Looply global call response failed", error);
      return false;
    }
  };
  const showIncoming = (call, payload) => {
    const incomingCall = { ...call, id: payload.callId, payload };
    if (incoming && isSignalForCall(payload, incoming)) return; // Retried offer.
    if (incoming) {
      void signal(incomingCall, "busy");
      return;
    }
    incoming = incomingCall;
    const modal = ensureOverlay();
    const sender = call.participants.find((participant) => participant.user_id === payload.senderId)?.profile;
    const name = payload.senderName || sender?.display_name || sender?.username || "Alguém";
    modal.querySelector("#looplyGlobalCallTitle").textContent = name;
    modal.querySelector("[data-global-call-description]").textContent = `${name} está ligando por ${payload.mode === "video" ? "vídeo" : "áudio"}.`;
    modal.hidden = false;
    modal.querySelector("[data-global-call-enable-ring]").hidden = false;
    modal.querySelector("[data-global-call-accept]").focus();
    void ringtone.start();
  };
  const subscribeConversation = async (conversation) => {
    if (closed || channels.has(conversation.id) || conversation.kind !== "direct") return;
    const participants = conversation.participants || [];
    if (!participants.some((participant) => participant.user_id === userId)) return;
    const channel = client.channel(`looply-call-${conversation.id}`, { config: { private: true, broadcast: { ack: true, self: false } } });
    const call = { channel, conversationId: conversation.id, participants };
    channels.set(conversation.id, call);
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      if (!hasCallScope(payload) || payload.conversationId !== conversation.id || payload.senderId === userId) return;
      if (!participants.some((participant) => participant.user_id === payload.senderId)) return;
      // The chat page owns signaling for its active thread.
      if (activeConversationId() === conversation.id) return;
      if (payload.type === "offer") {
        if (!payload.description || !["audio", "video"].includes(payload.mode)) return;
        showIncoming(call, payload);
      } else if (["hangup", "decline", "cancel", "failed"].includes(payload.type) && incoming && isSignalForCall(payload, incoming)) {
        hideOverlay();
      }
    });
    channel.subscribe((status) => {
      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) console.warn("Looply global call channel unavailable", conversation.id, status);
    });
  };

  overlay = ensureOverlay();
  overlay.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || !incoming) return;
    const call = incoming;
    if (button.matches("[data-global-call-enable-ring]")) { await ringtone.start(); button.hidden = true; return; }
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
        sessionStorage.setItem(pendingKey(userId), JSON.stringify({ ...call.payload, conversationId: call.conversationId, accepted: true, savedAt: Date.now() }));
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
      const { data: memberships, error: membershipsError } = await client.from("conversation_participants").select("conversation_id").eq("user_id", userId);
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
    for (const { channel } of channels.values()) void client.removeChannel(channel);
    channels.clear();
    window.__looplyGlobalCallListener = false;
  }, { once: true });
}
