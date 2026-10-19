import { icon } from "./icons.js";
import { CALL_STATES, canTransitionCall, createCallId, hasCallScope, isSignalForCall } from "./call-protocol.js";
import { createCallRingtone } from "./call-ringtone.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);

export function setupChatCalls(root, client, userId) {
  if (!root || root.dataset.chatCalls === "true") return;
  root.dataset.chatCalls = "true";

  let channel = null;
  let channelConversationId = "";
  let channelReady = null;
  let pc = null;
  let localStream = null;
  let remoteStream = null;
  let incomingOffer = null;
  let activeCall = null;
  let callState = CALL_STATES.IDLE;
  let pendingCandidates = new Map();
  let offerRetryTimer = null;
  let callTimeout = null;
  let disconnectTimer = null;
  let closing = false;
  let callMode = "audio";
  let callPeerName = "Contato";

  const activeConversation = () => root.querySelector(".chat-thread-heading")?.dataset.conversationId || root.querySelector("[data-chat-send]")?.dataset.conversationId || "";
  const isGroup = () => root.querySelector(".chat-thread-heading")?.dataset.chatKind === "group";
  const peerName = () => root.querySelector(".chat-thread-heading strong")?.textContent?.trim() || "Contato";
  const clearTimer = (timer) => { if (timer) clearTimeout(timer); return null; };
  const clearOfferRetry = () => { if (offerRetryTimer) clearInterval(offerRetryTimer); offerRetryTimer = null; };
  const ringtone = createCallRingtone({ onBlocked: () => {
    const button = root.querySelector("[data-call-enable-ring]");
    if (button) button.hidden = false;
  } });

  const toast = (message) => {
    let node = root.querySelector("[data-call-toast]");
    if (!node) {
      node = document.createElement("div");
      node.className = "chat-v2-toast";
      node.dataset.callToast = "";
      node.setAttribute("role", "status");
      root.append(node);
    }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.hidden = true; }, 3200);
  };

  const setCallState = (nextState) => {
    if (callState === nextState) return true;
    if (!canTransitionCall(callState, nextState)) {
      console.warn("Looply ignored invalid call state transition", callState, nextState);
      return false;
    }
    callState = nextState;
    return true;
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
  const updateStatus = (message) => { const status = root.querySelector("[data-call-status]"); if (status) status.textContent = message; };

  const send = async (type, extra = {}, call = activeCall) => {
    if (!call || !channel || call.conversationId !== channelConversationId) return false;
    try {
      const result = await channel.send({
        type: "broadcast",
        event: "signal",
        payload: { type, conversationId: call.conversationId, callId: call.id, senderId: userId, ...extra }
      });
      return result === "ok" || result?.status === "ok";
    } catch (error) {
      console.warn("Looply call signaling failed", error);
      return false;
    }
  };

  const releaseMedia = () => {
    clearOfferRetry();
    callTimeout = clearTimer(callTimeout);
    disconnectTimer = clearTimer(disconnectTimer);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    const local = root.querySelector("[data-call-local]");
    const remote = root.querySelector("[data-call-remote]");
    if (local) local.srcObject = null;
    if (remote) remote.srcObject = null;
    remoteStream = null;
    pendingCandidates.clear();
  };

  const finishCall = async ({ signal = null, message = "Chamada encerrada.", terminalState = CALL_STATES.ENDED } = {}) => {
    if (closing || callState === CALL_STATES.IDLE) return;
    closing = true;
    const call = activeCall;
    ringtone.stop();
    if (signal && call) await send(signal, {}, call);
    setCallState(terminalState);
    releaseMedia();
    incomingOffer = null;
    activeCall = null;
    setCallState(CALL_STATES.IDLE);
    closeModal();
    if (message) toast(message);
    closing = false;
  };

  const renderIncoming = (message = "Deseja atender a esta chamada?") => {
    showModal(`<span class="chat-v2-kicker">Chamada recebida</span><h2 id="chatCallTitle">${escape(callPeerName)} está ligando</h2><p>${escape(message)}</p><button type="button" class="chat-v2-button" data-call-enable-ring>Ativar toque</button><div class="chat-v2-actions"><button type="button" class="chat-v2-button" data-call-decline>Recusar</button><button type="button" class="chat-v2-button is-primary" data-call-accept>Atender</button></div>`);
  };

  const attachMedia = () => {
    const local = root.querySelector("[data-call-local]");
    const remote = root.querySelector("[data-call-remote]");
    if (local && localStream) {
      local.srcObject = localStream;
      local.muted = true;
      void local.play().catch(() => {});
    }
    if (!pc) return;
    if (!remoteStream) remoteStream = new MediaStream();
    if (remote) {
      remote.srcObject = remoteStream;
      remote.muted = false;
      remote.volume = 1;
      remote.autoplay = true;
      remote.playsInline = true;
      if (remoteStream.getTracks().length) void remote.play().catch(() => {
        updateStatus("Toque em “Ativar áudio” para ouvir o outro participante.");
        const enableAudio = root.querySelector("[data-call-enable-audio]");
        if (enableAudio) enableAudio.hidden = false;
      });
    }
    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (stream) remoteStream = stream;
      else if (event.track && !remoteStream.getTracks().some((track) => track.id === event.track.id)) remoteStream.addTrack(event.track);
      const target = root.querySelector("[data-call-remote]");
      if (!target) return;
      target.srcObject = remoteStream;
      target.muted = false;
      target.volume = 1;
      void target.play().then(() => {
        const enableAudio = root.querySelector("[data-call-enable-audio]");
        if (enableAudio) enableAudio.hidden = true;
      }).catch(() => {
        updateStatus("Toque em “Ativar áudio” para ouvir o outro participante.");
        const enableAudio = root.querySelector("[data-call-enable-audio]");
        if (enableAudio) enableAudio.hidden = false;
      });
    };
  };

  const callView = (statusText) => {
    showModal(`<span class="chat-v2-kicker">${callMode === "video" ? "Chamada de vídeo" : "Chamada de áudio"}</span><h2 id="chatCallTitle">${escape(callPeerName)}</h2><p data-call-status role="status">${escape(statusText)}</p><div class="chat-call-videos"><video data-call-remote autoplay playsinline aria-label="Vídeo e áudio recebidos"></video><video data-call-local autoplay playsinline muted aria-label="Prévia da sua câmera"></video></div><button type="button" class="chat-v2-button" data-call-enable-audio hidden>Ativar áudio</button><div class="chat-v2-actions"><button type="button" class="chat-v2-button" data-call-toggle-mic aria-pressed="false">${icon("mic")} Silenciar microfone</button><button type="button" class="chat-v2-button" data-call-toggle-speaker aria-pressed="false">${icon("volume")} Áudio ligado</button>${callMode === "video" ? '<button type="button" class="chat-v2-button" data-call-toggle-camera aria-pressed="false">' + icon("camera") + ' Desligar câmera</button><button type="button" class="chat-v2-button" data-call-flip-camera>' + icon("cameraSwitch") + ' Trocar câmera</button>' : ""}<button type="button" class="chat-v2-button is-primary" data-call-hangup>${icon("hangup")} Encerrar chamada</button></div>`);
    const local = root.querySelector("[data-call-local]");
    if (local && callMode !== "video") local.hidden = true;
    attachMedia();
  };

  const configuredIceServers = () => Array.isArray(window.LOOPLY_CONFIG?.rtcIceServers)
    ? window.LOOPLY_CONFIG.rtcIceServers.filter((server) => server && (
      (typeof server.urls === "string" && /^turns?:/i.test(server.urls))
      || (Array.isArray(server.urls) && server.urls.some((url) => typeof url === "string" && /^turns?:/i.test(url)))
    ) && typeof server.username === "string" && typeof server.credential === "string")
    : [];

  const createPeerConnection = (call) => {
    if (!window.RTCPeerConnection) throw new Error("webrtc unavailable");
    const peer = new RTCPeerConnection({ iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      ...configuredIceServers()
    ] });
    pc = peer;
    peer.onicecandidate = (event) => { if (event.candidate) void send("ice", { candidate: event.candidate.toJSON() }, call); };
    peer.onconnectionstatechange = () => {
      if (peer !== pc || !activeCall || activeCall.id !== call.id) return;
      if (peer.connectionState === "connected") {
        disconnectTimer = clearTimer(disconnectTimer);
        setCallState(CALL_STATES.CONNECTED);
        updateStatus("Conectado");
      } else if (peer.connectionState === "connecting") {
        setCallState(CALL_STATES.CONNECTING);
        updateStatus("Conectando…");
      } else if (peer.connectionState === "disconnected") {
        updateStatus("Reconectando…");
        disconnectTimer = clearTimer(disconnectTimer);
        disconnectTimer = setTimeout(() => {
          if (peer === pc && peer.connectionState === "disconnected") void finishCall({ signal: "failed", message: "A conexão da chamada foi perdida.", terminalState: CALL_STATES.FAILED });
        }, 8000);
      } else if (peer.connectionState === "failed") {
        void finishCall({ signal: "failed", message: "Não foi possível estabelecer a conexão da chamada.", terminalState: CALL_STATES.FAILED });
      }
    };
    if (localStream) localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
    attachMedia();
    return peer;
  };

  const waitForIceGatheringComplete = (peer, timeout = 5000) => new Promise((resolve) => {
    if (!peer || peer.iceGatheringState === "complete") { resolve(); return; }
    let timer;
    const finish = () => { peer.removeEventListener("icegatheringstatechange", check); if (timer) clearTimeout(timer); resolve(); };
    const check = () => { if (peer.iceGatheringState === "complete") finish(); };
    peer.addEventListener("icegatheringstatechange", check);
    timer = setTimeout(finish, timeout);
  });

  const addPendingCandidates = async (call) => {
    if (!pc?.remoteDescription || !call) return;
    const queued = pendingCandidates.get(call.id) || [];
    pendingCandidates.delete(call.id);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch (error) { console.warn("Looply ICE candidate ignored", error); }
    }
  };

  const queueCandidate = (callId, candidate) => {
    const queued = pendingCandidates.get(callId) || [];
    queued.push(candidate);
    pendingCandidates.set(callId, queued);
  };

  const startCall = async (mode) => {
    if (!activeConversation() || isGroup()) { toast("Chamadas estão disponíveis apenas em conversas individuais."); return; }
    if (callState !== CALL_STATES.IDLE) { toast("Já existe uma chamada em andamento."); return; }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { toast("Chamadas exigem HTTPS e suporte a microfone/câmera."); return; }
    if (!window.RTCPeerConnection) { toast("Este navegador não oferece suporte a chamadas WebRTC."); return; }
    callMode = mode;
    callPeerName = peerName();
    activeCall = { id: createCallId(), conversationId: activeConversation(), direction: "outgoing" };
    setCallState(CALL_STATES.DIALING);
    try {
      const liveChannel = await ensureChannel();
      if (!liveChannel || activeCall?.conversationId !== activeConversation()) throw new Error("signaling unavailable");
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
      const peer = createPeerConnection(activeCall);
      callView("Chamando…");
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGatheringComplete(peer);
      const call = activeCall;
      const offerPayload = { description: peer.localDescription.toJSON(), mode, senderName: root.querySelector(".looply-account strong")?.textContent?.trim() || "Contato" };
      if (!await send("offer", offerPayload, call)) throw new Error("offer could not be sent");
      const retryUntil = Date.now() + 45000;
      offerRetryTimer = setInterval(() => {
        if (activeCall?.id !== call.id || !pc || pc.remoteDescription || Date.now() >= retryUntil) { clearOfferRetry(); return; }
        void send("offer", offerPayload, call);
      }, 1800);
      callTimeout = setTimeout(() => {
        if (activeCall?.id === call.id && callState === CALL_STATES.DIALING) void finishCall({ signal: "cancel", message: "A chamada não foi atendida." });
      }, 45000);
    } catch (error) {
      console.error("Looply call start failed", error);
      await finishCall({ message: error?.name === "NotAllowedError" ? "Permita o microfone e a câmera para iniciar a chamada." : "Não foi possível iniciar a chamada. Confira a conexão e as permissões.", terminalState: CALL_STATES.FAILED });
    }
  };

  const acceptCall = async () => {
    const offer = incomingOffer;
    const call = activeCall;
    if (!offer || !call || call.direction !== "incoming" || callState !== CALL_STATES.RINGING) return;
    callMode = offer.mode === "video" ? "video" : "audio";
    callPeerName = offer.senderName || peerName();
    setCallState(CALL_STATES.ACCEPTING);
    ringtone.stop();
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callMode === "video" });
      const peer = createPeerConnection(call);
      await peer.setRemoteDescription(offer.description);
      await addPendingCandidates(call);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForIceGatheringComplete(peer);
      if (!await send("answer", { description: peer.localDescription.toJSON() }, call)) throw new Error("answer could not be sent");
      if (activeCall?.id !== call.id) return;
      setCallState(CALL_STATES.CONNECTING);
      callView("Conectando…");
    } catch (error) {
      console.error("Looply call accept failed", error);
      if (["NotAllowedError", "PermissionDeniedError"].includes(error?.name)) {
        releaseMedia();
        incomingOffer = offer;
        activeCall = call;
        callState = CALL_STATES.RINGING;
        renderIncoming(`Permita o acesso ao microfone${callMode === "video" ? " e à câmera" : ""} no navegador e toque em Atender para continuar.`);
        return;
      }
      await finishCall({ signal: "failed", message: "Não foi possível atender a chamada. Confira a conexão e os dispositivos.", terminalState: CALL_STATES.FAILED });
    }
  };

  const restorePendingIncomingCall = (conversationId) => {
    if (!conversationId || activeConversation() !== conversationId || incomingOffer || activeCall) return;
    let pending = null;
    try {
      const key = `looply:pending-call:${userId}`;
      pending = JSON.parse(sessionStorage.getItem(key) || "null");
      if (pending) sessionStorage.removeItem(key);
    } catch (error) {
      console.warn("Looply pending call could not be restored", error);
      return;
    }
    if (!hasCallScope(pending) || pending.conversationId !== conversationId || pending.senderId === userId
      || pending.accepted !== true || !Number.isFinite(pending.savedAt) || Date.now() - pending.savedAt > 90000
      || !pending.description || !["audio", "video"].includes(pending.mode)) return;
    incomingOffer = pending;
    activeCall = { id: pending.callId, conversationId, direction: "incoming" };
    callMode = pending.mode;
    callPeerName = pending.senderName || peerName();
    setCallState(CALL_STATES.RINGING);
    // A navigation can consume transient user activation. Requesting media only after
    // this explicit tap avoids treating a browser permission block as a declined call.
    renderIncoming();
    void ringtone.start();
  };

  const handleSignal = async (payload) => {
    if (!hasCallScope(payload) || payload.conversationId !== channelConversationId || payload.senderId === userId) return;
    if (payload.type === "offer") {
      if (!payload.description || !["audio", "video"].includes(payload.mode)) return;
      if (activeCall && isSignalForCall(payload, activeCall)) return; // Retry of the same offer.
      if (activeCall || callState !== CALL_STATES.IDLE) {
        await send("busy", {}, { id: payload.callId, conversationId: payload.conversationId });
        return;
      }
      incomingOffer = payload;
      activeCall = { id: payload.callId, conversationId: payload.conversationId, direction: "incoming" };
      callMode = payload.mode;
      callPeerName = payload.senderName || peerName();
      setCallState(CALL_STATES.RINGING);
      renderIncoming();
      void ringtone.start();
      return;
    }
    if (!isSignalForCall(payload, activeCall)) return; // Never let an old call control a new one.
    if (payload.type === "answer" && activeCall.direction === "outgoing" && pc && callState === CALL_STATES.DIALING && payload.description) {
      try {
        clearOfferRetry();
        callTimeout = clearTimer(callTimeout);
        await pc.setRemoteDescription(payload.description);
        await addPendingCandidates(activeCall);
        setCallState(CALL_STATES.CONNECTING);
        updateStatus("Conectando…");
      } catch (error) {
        console.error("Looply call answer failed", error);
        await finishCall({ signal: "failed", message: "A resposta da chamada não pôde ser processada.", terminalState: CALL_STATES.FAILED });
      }
    } else if (payload.type === "ice" && payload.candidate) {
      if (pc?.remoteDescription) {
        try { await pc.addIceCandidate(payload.candidate); } catch (error) { console.warn("Looply ICE candidate ignored", error); }
      } else queueCandidate(activeCall.id, payload.candidate);
    } else if (payload.type === "decline") {
      await finishCall({ message: "A chamada foi recusada." });
    } else if (payload.type === "busy") {
      await finishCall({ message: "A outra pessoa já está em uma chamada." });
    } else if (payload.type === "cancel") {
      await finishCall({ message: "A chamada foi cancelada." });
    } else if (payload.type === "hangup") {
      await finishCall({ message: "A outra pessoa encerrou a chamada." });
    } else if (payload.type === "failed") {
      await finishCall({ message: "A chamada falhou no outro dispositivo.", terminalState: CALL_STATES.FAILED });
    }
  };

  const ensureChannel = async () => {
    const id = activeConversation();
    if (!id || isGroup() || !client) { toast("Abra uma conversa individual para chamar."); return null; }
    if (channel && channelConversationId === id) {
      const ready = channelReady ? await channelReady : Boolean(channel);
      if (ready) restorePendingIncomingCall(id);
      return ready ? channel : null;
    }
    if (activeCall && activeCall.conversationId !== id) await finishCall({ signal: activeCall.direction === "outgoing" ? "cancel" : "hangup", message: "A chamada foi encerrada ao trocar de conversa." });
    if (channel) await client.removeChannel(channel);
    channel = null;
    channelReady = null;
    channelConversationId = id;
    const session = await client.auth.getSession();
    if (session.data?.session?.access_token) await client.realtime.setAuth(session.data.session.access_token);
    const next = client.channel(`looply-call-${id}`, { config: { private: true, broadcast: { ack: true, self: false } } });
    channel = next;
    next.on("broadcast", { event: "signal" }, ({ payload }) => { void handleSignal(payload); });
    channelReady = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Realtime call channel timed out")), 10000);
      next.subscribe((status, error) => {
        if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(true); }
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) { clearTimeout(timer); reject(error || new Error(status)); }
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
    if (!heading.querySelector("[data-call-video]")) heading.insertAdjacentHTML("beforeend", '<button type="button" class="chat-v2-icon-button" data-call-video aria-label="Ligar por vídeo" title="Chamada de vídeo">' + icon("video") + "</button>");
  };

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.matches("[data-call-audio]")) { await startCall("audio"); return; }
    if (button.matches("[data-call-video]")) { await startCall("video"); return; }
    if (button.matches("[data-call-enable-ring]")) { await ringtone.start(); button.hidden = true; return; }
    if (button.matches("[data-call-enable-audio]")) {
      const remote = root.querySelector("[data-call-remote]");
      if (!remote) return;
      remote.muted = false;
      remote.volume = 1;
      try { await remote.play(); button.hidden = true; updateStatus("Áudio remoto ativado."); }
      catch (error) { console.warn("Looply remote audio playback remains blocked", error); updateStatus("O navegador bloqueou o áudio. Confira as permissões e toque novamente."); }
      return;
    }
    if (button.matches("[data-call-accept]")) { await acceptCall(); return; }
    if (button.matches("[data-call-decline]")) { await finishCall({ signal: "decline", message: "Chamada recusada." }); return; }
    if (button.matches("[data-call-hangup]") || button.matches("[data-call-close]")) {
      const signal = callState === CALL_STATES.DIALING ? "cancel" : "hangup";
      await finishCall({ signal });
      return;
    }
    if (button.matches("[data-call-toggle-mic]")) {
      const track = localStream?.getAudioTracks()[0];
      if (track) { track.enabled = !track.enabled; button.setAttribute("aria-pressed", String(!track.enabled)); button.innerHTML = icon(track.enabled ? "mic" : "micOff") + (track.enabled ? " Silenciar microfone" : " Ativar microfone"); }
      return;
    }
    if (button.matches("[data-call-toggle-speaker]")) {
      const remote = root.querySelector("[data-call-remote]");
      if (remote) { remote.muted = !remote.muted; button.setAttribute("aria-pressed", String(remote.muted)); button.innerHTML = icon(remote.muted ? "volumeOff" : "volume") + (remote.muted ? " Ativar áudio" : " Áudio ligado"); }
      return;
    }
    if (button.matches("[data-call-toggle-camera]")) {
      const track = localStream?.getVideoTracks()[0];
      if (track) { track.enabled = !track.enabled; button.setAttribute("aria-pressed", String(!track.enabled)); button.innerHTML = icon(track.enabled ? "camera" : "cameraOff") + (track.enabled ? " Desligar câmera" : " Ligar câmera"); }
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
    }
  });

  const observer = new MutationObserver(() => { addButtons(); if (activeConversation() && !isGroup()) void ensureChannel(); });
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener("looply:open-conversation", () => { setTimeout(() => { addButtons(); void ensureChannel(); }, 0); });
  root.addEventListener("looply:chat-rendered", () => { addButtons(); void ensureChannel(); });
  root.addEventListener("click", (event) => { if (event.target.matches("[data-call-modal]")) void finishCall({ signal: callState === CALL_STATES.DIALING ? "cancel" : "hangup" }); });
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    ringtone.stop();
    if (pc || localStream || activeCall) void finishCall({ message: "" });
    if (channel) void client.removeChannel(channel);
  }, { once: true });
  addButtons();
}
