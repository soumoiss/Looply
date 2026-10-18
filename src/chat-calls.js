import { icon } from "./icons.js";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
export function setupChatCalls(root, client, userId) {
  if (!root || root.dataset.chatCalls === "true") return;
  root.dataset.chatCalls = "true";
  let channel = null;
  let channelConversationId = "";
  let channelReady = null;
  let pc = null;
  let localStream = null;
  let incomingOffer = null;
  let callMode = "audio";
  let callPeerName = "Contato";
  let pendingCandidates = [];
  let isCaller = false;
  let closing = false;
  let offerRetryTimer = null;
  const clearOfferRetry = () => { if (offerRetryTimer) clearInterval(offerRetryTimer); offerRetryTimer = null; };
  const activeConversation = () => root.querySelector(".chat-thread-heading")?.dataset.conversationId || root.querySelector("[data-chat-send]")?.dataset.conversationId || "";
  const isGroup = () => root.querySelector(".chat-thread-heading")?.dataset.chatKind === "group";
  const peerName = () => root.querySelector(".chat-thread-heading strong")?.textContent?.trim() || "Contato";
  const toast = (message) => {
    let node = root.querySelector("[data-call-toast]");
    if (!node) { node = document.createElement("div"); node.className = "chat-v2-toast"; node.dataset.callToast = ""; node.setAttribute("role", "status"); root.append(node); }
    node.textContent = message; node.hidden = false; clearTimeout(node._timer); node._timer = setTimeout(() => { node.hidden = true; }, 3200);
  };
  const getModal = () => {
    let modal = root.querySelector("[data-call-modal]");
    if (!modal) {
      modal = document.createElement("div");
      modal.className = "chat-v2-modal-backdrop chat-call-backdrop";
      modal.dataset.callModal = "";
      modal.hidden = true;
      modal.innerHTML = '<section class="chat-v2-modal chat-call-modal" role="dialog" aria-modal="true" aria-labelledby="chatCallTitle"><button type="button" class="chat-v2-modal-close" data-call-close aria-label="Encerrar chamada">' + icon("hangup") + '</button><div data-call-content></div></section>';
      root.append(modal);
    }
    return modal;
  };
  const showModal = (markup) => {
    const modal = getModal();
    modal.querySelector("[data-call-content]").innerHTML = markup;
    modal.hidden = false;
  };
  const closeModal = () => { const modal = root.querySelector("[data-call-modal]"); if (modal) modal.hidden = true; };
  const send = async (type, extra = {}) => {
    const topic = activeConversation();
    if (!channel || !topic || topic !== channelConversationId) return false;
    try {
      const result = await channel.send({ type: "broadcast", event: "signal", payload: { type, conversationId: topic, senderId: userId, ...extra } });
      return result === "ok" || result?.status === "ok";
    } catch (error) { console.warn("Looply call signaling failed", error); return false; }
  };
  const releaseMedia = () => {
    clearOfferRetry();
    if (pc) { pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); pc = null; }
    if (localStream) { localStream.getTracks().forEach((track) => track.stop()); localStream = null; }
    const local = root.querySelector("[data-call-local]");
    const remote = root.querySelector("[data-call-remote]");
    if (local) local.srcObject = null;
    if (remote) remote.srcObject = null;
    pendingCandidates = [];
    incomingOffer = null;
    isCaller = false;
  };
  const endCall = async (notify = true, message = "Chamada encerrada.") => {
    if (closing) return;
    closing = true;
    if (notify) await send("hangup");
    releaseMedia();
    closeModal();
    toast(message);
    closing = false;
  };
  const updateStatus = (message) => {
    const status = root.querySelector("[data-call-status]");
    if (status) status.textContent = message;
  };
  const attachMedia = () => {
    const local = root.querySelector("[data-call-local]");
    const remote = root.querySelector("[data-call-remote]");
    if (local && localStream) { local.srcObject = localStream; local.muted = true; local.play().catch(() => {}); }
    if (remote && pc) {
      if (!remote.srcObject) remote.srcObject = new MediaStream();
      pc.ontrack = (event) => {
        const stream = event.streams?.[0];
        if (stream) remote.srcObject = stream;
        else if (event.track && !remote.srcObject.getTracks().some((track) => track.id === event.track.id)) remote.srcObject.addTrack(event.track);
        remote.play().catch(() => updateStatus("Toque no vídeo remoto para ativar o áudio."));
      };
    }
  };
  const callView = (statusText) => {
    showModal(`<span class="chat-v2-kicker">${callMode === "video" ? "Chamada de vídeo" : "Chamada de áudio"}</span><h2 id="chatCallTitle">${escape(callPeerName)}</h2><p data-call-status role="status">${escape(statusText)}</p><div class="chat-call-videos"><video data-call-remote autoplay playsinline aria-label="Vídeo e áudio recebidos"></video><video data-call-local autoplay playsinline muted aria-label="Prévia da sua câmera"></video></div><div class="chat-v2-actions"><button type="button" class="chat-v2-button" data-call-toggle-mic aria-pressed="false">${icon("mic")} Silenciar microfone</button><button type="button" class="chat-v2-button" data-call-toggle-speaker aria-pressed="false">${icon("volume")} Áudio ligado</button>${callMode === "video" ? '<button type="button" class="chat-v2-button" data-call-toggle-camera aria-pressed="false">' + icon("camera") + ' Desligar câmera</button><button type="button" class="chat-v2-button" data-call-flip-camera>' + icon("cameraSwitch") + ' Trocar câmera</button>' : ""}<button type="button" class="chat-v2-button is-primary" data-call-hangup>${icon("hangup")} Encerrar chamada</button></div>`);
    const local = root.querySelector("[data-call-local]");
    if (local && callMode !== "video") local.hidden = true;
    attachMedia();
  };
  const createPeerConnection = () => {
    if (!window.RTCPeerConnection) throw new Error("webrtc unavailable");
    const configuredIceServers = Array.isArray(window.LOOPLY_CONFIG?.rtcIceServers)
      ? window.LOOPLY_CONFIG.rtcIceServers.filter((server) => server && (
          (typeof server.urls === "string" && /^turns?:/i.test(server.urls))
          || (Array.isArray(server.urls) && server.urls.some((url) => typeof url === "string" && /^turns?:/i.test(url)))
        ) && (typeof server.username === "string") && (typeof server.credential === "string"))
      : [];
    pc = new RTCPeerConnection({ iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      ...configuredIceServers
    ] });
    pc.onicecandidate = (event) => { if (event.candidate) send("ice", { candidate: event.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === "connected") updateStatus("Conectado");
      else if (pc.connectionState === "connecting") updateStatus("Conectando…");
      else if (["failed", "disconnected"].includes(pc.connectionState)) updateStatus("Conexão instável. Verifique a rede e as permissões.");
      else if (pc.connectionState === "closed") updateStatus("Chamada encerrada");
    };
    if (localStream) localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    attachMedia();
    return pc;
  };
  const waitForIceGatheringComplete = (peer, timeout = 5000) => new Promise((resolve) => {
    if (!peer || peer.iceGatheringState === "complete") { resolve(); return; }
    let timer;
    const finish = () => {
      peer.removeEventListener("icegatheringstatechange", check);
      if (timer) clearTimeout(timer);
      resolve();
    };
    const check = () => { if (peer.iceGatheringState === "complete") finish(); };
    peer.addEventListener("icegatheringstatechange", check);
    timer = setTimeout(finish, timeout);
  });
  const addPendingCandidates = async () => {
    if (!pc?.remoteDescription) return;
    const queued = pendingCandidates.splice(0);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch (error) { console.warn("Looply ICE candidate ignored", error); }
    }
  };
  const startCall = async (mode) => {
    if (!activeConversation() || isGroup()) { toast("Chamadas estão disponíveis apenas em conversas individuais."); return; }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { toast("Chamadas exigem HTTPS e suporte a microfone/câmera."); return; }
    if (!window.RTCPeerConnection) { toast("Este navegador não oferece suporte a chamadas WebRTC."); return; }
    callMode = mode; callPeerName = peerName(); isCaller = true;
    try {
      const liveChannel = await ensureChannel();
      if (!liveChannel) throw new Error("signaling unavailable");
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
      createPeerConnection();
      callView("Chamando…");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Include gathered candidates in the SDP as a fallback for missed ephemeral ICE broadcasts.
      await waitForIceGatheringComplete(pc);
      const offerPayload = {
        description: pc.localDescription.toJSON(),
        mode,
        senderName: root.querySelector(".looply-account strong")?.textContent?.trim() || "Contato"
      };
      const sent = await send("offer", offerPayload);
      if (!sent) throw new Error("offer could not be sent");
      // Broadcast is ephemeral. Retry the offer while waiting so a listener that is
      // still loading its conversation memberships can still receive the call.
      clearOfferRetry();
      const retryUntil = Date.now() + 30000;
      offerRetryTimer = window.setInterval(() => {
        if (!pc || !isCaller || pc.remoteDescription || Date.now() >= retryUntil) {
          clearOfferRetry();
          return;
        }
        void send("offer", offerPayload);
      }, 1800);
    } catch (error) {
      console.error("Looply call start failed", error);
      await endCall(false, error?.name === "NotAllowedError" ? "Permita o microfone e a câmera para iniciar a chamada." : "Não foi possível iniciar a chamada. Confira a conexão e as permissões.");
    }
  };
  const acceptCall = async () => {
    if (!incomingOffer) return;
    callMode = incomingOffer.mode === "video" ? "video" : "audio";
    callPeerName = incomingOffer.senderName || peerName();
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callMode === "video" });
      createPeerConnection();
      await pc.setRemoteDescription(incomingOffer.description);
      await addPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGatheringComplete(pc);
      const sent = await send("answer", { description: pc.localDescription.toJSON() });
      if (!sent) throw new Error("answer could not be sent");
      callView("Conectando…");
    } catch (error) {
      console.error("Looply call accept failed", error);
      await send("decline");
      await endCall(false, error?.name === "NotAllowedError" ? "Permita o microfone e a câmera para atender." : "Não foi possível atender a chamada.");
    }
  };
  const restorePendingIncomingCall = (conversationId) => {
    if (!conversationId || activeConversation() !== conversationId || incomingOffer || pc) return;
    let pending = null;
    try {
      const key = `looply:pending-call:${userId}`;
      pending = JSON.parse(sessionStorage.getItem(key) || "null");
      if (pending) sessionStorage.removeItem(key);
    } catch (error) {
      console.warn("Looply pending call could not be restored", error);
      return;
    }
    if (!pending || pending.conversationId !== conversationId || pending.senderId === userId
      || pending.accepted !== true || !Number.isFinite(pending.savedAt)
      || Date.now() - pending.savedAt > 90000 || !pending.description) return;
    incomingOffer = pending;
    callMode = pending.mode === "video" ? "video" : "audio";
    callPeerName = pending.senderName || peerName();
    window.setTimeout(() => {
      if (incomingOffer === pending && activeConversation() === conversationId) void acceptCall();
    }, 0);
  };

  const ensureChannel = async () => {
    const id = activeConversation();
    if (!id || isGroup() || !client) { toast("Abra uma conversa individual para chamar."); return null; }
    if (channel && channelConversationId === id) {
      const ready = channelReady ? await channelReady : Boolean(channel);
      if (ready) restorePendingIncomingCall(id);
      return ready ? channel : null;
    }
    if (channel) await client.removeChannel(channel);
    channel = null; channelReady = null; channelConversationId = id;
    const session = await client.auth.getSession();
    if (session.data?.session?.access_token) await client.realtime.setAuth(session.data.session.access_token);
    const next = client.channel(`looply-call-${id}`, { config: { private: true, broadcast: { ack: true, self: false } } });
    channel = next;
    next.on("broadcast", { event: "signal" }, async ({ payload }) => {
      if (!payload || payload.conversationId !== channelConversationId || payload.senderId === userId) return;
      if (payload.type === "offer") {
        if (pc) {
          if (incomingOffer?.senderId === payload.senderId && incomingOffer?.conversationId === payload.conversationId) return;
          await send("decline");
          return;
        }
        if (incomingOffer?.senderId === payload.senderId && incomingOffer?.conversationId === payload.conversationId) return;
        incomingOffer = payload;
        callMode = payload.mode === "video" ? "video" : "audio";
        callPeerName = payload.senderName || peerName();
        showModal(`<span class="chat-v2-kicker">Chamada recebida</span><h2 id="chatCallTitle">${escape(callPeerName)} está ligando</h2><p>Deseja atender à chamada de ${callMode === "video" ? "vídeo" : "áudio"}?</p><div class="chat-v2-actions"><button type="button" class="chat-v2-button" data-call-decline>Recusar</button><button type="button" class="chat-v2-button is-primary" data-call-accept>Atender</button></div>`);
      } else if (payload.type === "answer" && pc && isCaller) {
        try {
          clearOfferRetry();
          await pc.setRemoteDescription(payload.description);
          await addPendingCandidates();
          updateStatus("Conectando…");
        } catch (error) { console.error("Looply call answer failed", error); }
      } else if (payload.type === "ice" && payload.candidate) {
        if (pc?.remoteDescription) { try { await pc.addIceCandidate(payload.candidate); } catch (error) { console.warn("Looply ICE candidate ignored", error); } }
        else pendingCandidates.push(payload.candidate);
      } else if (payload.type === "decline") {
        await endCall(false, "A chamada foi recusada.");
      } else if (payload.type === "hangup") {
        await endCall(false, "A outra pessoa encerrou a chamada.");
      }
    });
    channelReady = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Realtime call channel timed out")), 10000);
      next.subscribe((status, error) => {
        if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(true); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") { clearTimeout(timer); reject(error || new Error(status)); }
      });
    }).catch(async (error) => {
      console.error("Looply private call channel failed", error);
      toast("Não foi possível conectar o canal privado de chamadas.");
      if (channel === next) channel = null;
      await client.removeChannel(next);
      return false;
    });
    const subscribed = await channelReady;
    if (subscribed) restorePendingIncomingCall(id);
    return subscribed ? channel : null;
  };
  const addButtons = () => {
    const heading = root.querySelector(".chat-thread-heading");
    if (!heading || heading.dataset.chatKind === "group") return;
    if (!heading.querySelector("[data-call-audio]")) heading.insertAdjacentHTML("beforeend", '<button type="button" class="chat-v2-icon-button" data-call-audio aria-label="Ligar por áudio" title="Chamada de áudio">☎</button>');
    if (!heading.querySelector("[data-call-video]")) heading.insertAdjacentHTML("beforeend", '<button type="button" class="chat-v2-icon-button" data-call-video aria-label="Ligar por vídeo" title="Chamada de vídeo">' + icon("video") + '</button>');
  };
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.matches("[data-call-audio]")) { await startCall("audio"); return; }
    if (button.matches("[data-call-video]")) { await startCall("video"); return; }
    if (button.matches("[data-call-accept]")) { await acceptCall(); return; }
    if (button.matches("[data-call-decline]")) { await send("decline"); await endCall(false, "Chamada recusada."); return; }
    if (button.matches("[data-call-hangup]") || button.matches("[data-call-close]")) { await endCall(true); return; }
    if (button.matches("[data-call-toggle-mic]")) {
      const track = localStream?.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        button.setAttribute("aria-pressed", String(!track.enabled));
        button.innerHTML = icon(track.enabled ? "mic" : "micOff") + (track.enabled ? " Silenciar microfone" : " Ativar microfone");
      }
      return;
    }
    if (button.matches("[data-call-toggle-speaker]")) {
      const remote = root.querySelector("[data-call-remote]");
      if (remote) {
        remote.muted = !remote.muted;
        button.setAttribute("aria-pressed", String(remote.muted));
        button.innerHTML = icon(remote.muted ? "volumeOff" : "volume") + (remote.muted ? " Ativar áudio" : " Áudio ligado");
      }
      return;
    }
    if (button.matches("[data-call-toggle-camera]")) {
      const track = localStream?.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        button.setAttribute("aria-pressed", String(!track.enabled));
        button.innerHTML = icon(track.enabled ? "camera" : "cameraOff") + (track.enabled ? " Desligar câmera" : " Ligar câmera");
      }
      return;
    }
    if (button.matches("[data-call-flip-camera]")) {
      if (!localStream || callMode !== "video" || !navigator.mediaDevices?.getUserMedia) return;
      const oldTrack = localStream.getVideoTracks()[0];
      if (!oldTrack) return;
      button.disabled = true;
      try {
        const facing = oldTrack.getSettings?.().facingMode;
        const nextFacing = facing === "environment" ? "user" : "environment";
        const replacementStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: nextFacing } }, audio: false });
        const nextTrack = replacementStream.getVideoTracks()[0];
        if (!nextTrack) throw new Error("camera unavailable");
        const sender = pc?.getSenders().find((item) => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(nextTrack);
        localStream.removeTrack(oldTrack);
        oldTrack.stop();
        localStream.addTrack(nextTrack);
        const local = root.querySelector("[data-call-local]");
        if (local) { local.srcObject = localStream; await local.play().catch(() => {}); }
        toast(nextFacing === "environment" ? "Câmera traseira selecionada." : "Câmera frontal selecionada.");
      } catch (error) {
        console.warn("Looply camera switch failed", error);
        toast("Não foi possível trocar a câmera neste dispositivo.");
      } finally { button.disabled = false; }
      return;
    }
  });
  const observer = new MutationObserver(() => { addButtons(); if (activeConversation() && !isGroup()) ensureChannel(); });
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener("looply:open-conversation", () => { setTimeout(() => { addButtons(); ensureChannel(); }, 0); });
  root.addEventListener("looply:chat-rendered", () => { addButtons(); ensureChannel(); });
  root.addEventListener("click", (event) => {
    if (event.target.matches("[data-call-modal]")) endCall(true);
  });
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    if (pc || localStream) endCall(false, "");
    if (channel) client.removeChannel(channel);
  }, { once: true });
  addButtons();
}
