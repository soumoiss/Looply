import { createFastIncomingPoller } from "./fast-incoming-calls.js";
import { routeIncomingCallToOpenChat } from "./call-incoming-router.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const pendingKey = (userId) => `looply:pending-call:${userId}`;

export function setupGlobalCallListener(client, userId, profile) {
  if (!client || client.supportsRealtime === false || !userId || window.__looplyGlobalCallListener) return;
  window.__looplyGlobalCallListener = true;
  const channels = new Map();
  let incoming = null;
  let overlay = null;
  let closed = false;
  let fastInbox = null;
  let ringTimer = null;
  let ringContext = null;

  const stopRinging = () => {
    if (ringTimer !== null) clearInterval(ringTimer);
    ringTimer = null;
    if (ringContext) { void ringContext.close().catch(() => {}); ringContext = null; }
  };
  const startRinging = () => {
    if (ringTimer !== null || document.visibilityState === "hidden") return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      ringContext = new Ctx();
      const ping = () => {
        if (!ringContext || ringContext.state !== "running") return;
        const now = ringContext.currentTime;
        for (const offset of [0, 0.23]) {
          const oscillator = ringContext.createOscillator();
          const gain = ringContext.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = 720;
          gain.gain.setValueAtTime(0.0001,now+offset);
          gain.gain.exponentialRampToValueAtTime(0.12,now+offset+0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001,now+offset+0.19);
          oscillator.connect(gain).connect(ringContext.destination);
          oscillator.start(now+offset);
          oscillator.stop(now+offset+0.2);
        }
      };
      void ringContext.resume().then(ping).catch(() => {});
      ringTimer = window.setInterval(ping, 1750);
      if (navigator.vibrate) navigator.vibrate([160,140,160]);
    } catch(error) {
      console.warn("Looply ringtone requires browser audio permission", error);
    }
  };

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
    stopRinging();
    incoming = null;
  };
  const signal = async (call, type) => {
    if (!call?.conversationId) return;
    try {
      if (call.channel) {
        const response = await call.channel.send({ type: "broadcast", event: "signal", payload: {
          type, conversationId: call.conversationId, senderId: userId
        } });
        if (response === "ok" || response?.status === "ok") return;
      }
      // The quick incoming inbox may ring before individual room subscriptions
      // are ready. Replies still use authenticated Neon membership checks.
      await fastInbox?.send({conversationId:call.conversationId,type});
    } catch (error) {
      console.warn("Looply global call response failed", error);
      await fastInbox?.send({conversationId:call.conversationId,type});
    }
  };
  const showIncoming = (call, payload) => {
    // Call offers are repeated for unreliable networks. Never restart ringing
    // or rebuild the dialog when the same offer is delivered by both channels.
    if (incoming?.conversationId === call.conversationId) return;
    if (incoming && incoming.conversationId !== call.conversationId) {
      void signal(call, "decline");
      return;
    }
    incoming = { ...call, payload };
    const modal = ensureOverlay();
    const sender = (call.participants || []).find((p) => p.user_id === payload.senderId)?.profile;
    const name = payload.senderName || sender?.display_name || sender?.username || "Alguém";
    modal.querySelector("#looplyGlobalCallTitle").textContent = name;
    modal.querySelector("[data-global-call-description]").textContent =
      `${name} está ligando por ${payload.mode === "video" ? "vídeo" : "áudio"}.`;
    modal.hidden = false;
    startRinging();
    if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
      try {
        const notification = new Notification("Chamada recebida no Looply", {body:name+" está ligando.",tag:"looply-call-"+call.conversationId});
        notification.onclick = () => {window.focus(); notification.close();};
      } catch (error) {console.warn("Looply call notification unavailable",error);}
    }
    modal.querySelector("[data-global-call-accept]").focus({preventScroll:true});
  };
  const subscribeConversation = async (conversation) => {
    if (closed || channels.has(conversation.id) || conversation.kind !== "direct") return;
    const participants = conversation.participants || [];
    if (!participants.some((p) => p.user_id === userId)) return;
    const channel = client.channel(`looply-call-${conversation.id}`, {
      config: { private: true, broadcast: { ack: true, self: false }, disableFallback: true }
    });
    const call = { channel, conversationId: conversation.id, participants };
    channels.set(conversation.id, call);
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      if (!payload || payload.conversationId !== conversation.id || payload.senderId === userId) return;
      if (!participants.some((p) => p.user_id === payload.senderId)) return;
      if (payload.type === "offer") {
        if (!payload.description || !["audio", "video"].includes(payload.mode)) return;
        // Deliver to the open conversation even if its Neon call room is not
        // subscribed yet. If no controller handles it, use the global overlay.
        if (routeIncomingCallToOpenChat(document.getElementById("pageContent"),conversation.id,payload)) {
          if (incoming?.conversationId === conversation.id) hideOverlay();
          return;
        }
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
  // A single authenticated Neon query checks *all* direct conversations. This
  // starts independently of loading metadata and independent of which Looply
  // page is open. It also catches offers missed by a reconnecting WebSocket.
  fastInbox = createFastIncomingPoller({
    client,
    onSignal:({conversationId,senderId,payload})=>{
      if (closed || senderId === userId) return;
      const call = channels.get(conversationId) || {conversationId,participants:[],channel:null};
      if (payload.type === "offer") {
        if (!payload.description || !["audio","video"].includes(payload.mode)) return;
        if (routeIncomingCallToOpenChat(document.getElementById("pageContent"),conversationId,payload)) {
          if (incoming?.conversationId === conversationId) hideOverlay();
          return;
        }
        showIncoming(call,payload);
      } else if (incoming?.conversationId === conversationId) {
        hideOverlay();
      }
    }
  });
  fastInbox.start();
  const wake = () => {
    if (!closed && document.visibilityState === "visible") {
      void fastInbox.refresh();
      if (incoming) startRinging();
    } else if (document.visibilityState === "hidden") stopRinging();
  };
  document.addEventListener("visibilitychange",wake);
  window.addEventListener("focus",wake);
  window.addEventListener("pageshow",wake);
  window.addEventListener("online",wake);

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
    fastInbox.stop();
    document.removeEventListener("visibilitychange",wake);
    window.removeEventListener("focus",wake);
    window.removeEventListener("pageshow",wake);
    window.removeEventListener("online",wake);
    hideOverlay();
    for (const { channel } of channels.values()) void client.removeChannel(channel);
    channels.clear();
    window.__looplyGlobalCallListener = false;
  }, { once: true });
}
