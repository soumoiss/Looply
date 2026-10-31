// Authenticated Neon/Cloudflare Realtime bridge for DIRECT conversations.
// Replaces the former no-op Supabase channel compatibility adapter.
// A Cloudflare Durable Object relays ephemeral call/game signals only after a
// Neon-validated, one-time membership ticket. It never stores access tokens.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOM = /^looply-(call|game|chat)-([0-9a-f-]{36})$/i;
const CALL_TYPES = new Set(["offer","answer","ice","hangup","decline","failed"]);
const allowedEndpoint = endpoint => {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw Error("invalid_realtime_endpoint");
  return url.origin;
};
export function createNeonRealtimeBridge({ endpoint, getSession, fetcher, Socket, setTimeoutFn, clearTimeoutFn, fallback = null }) {
  const origin = allowedEndpoint(endpoint);
  const fetchImpl = fetcher || ((...args) => fetch(...args));
  const timeout = setTimeoutFn || setTimeout;
  const clear = clearTimeoutFn || clearTimeout;
  const channels = new Set();
  let sessionToken = "";
  const realtime = Object.freeze({
    setAuth: async token => {
      if (typeof token !== "string" || token.length < 10) throw Error("neon_session_required");
      sessionToken = token;
    }
  });
  const channel = (name, options = {}) => {
    const match = ROOM.exec(name);
    const conversationId = match && UUID.test(match[2]) ? match[2] : "";
    // Global inbox monitors every room through one Neon RPC. Parallel
    // Cloudflare subscriptions are fast when available, but must not spawn
    // a separate Neon fallback poll for every existing conversation.
    const useFallback = Boolean(fallback && options?.config?.disableFallback !== true);
    const roomKind = match?.[1] || "";
    const listeners = [];
    let ws = null;
    let ready = null;
    let closed = false;
    let callback = null;
    let retryTimer = null;
    let refreshTimer = null;
    let attempt = 0;
    let intentionalClose = false;
    const report = (state, error) => { try { callback?.(state,error); } catch (e) { console.warn("Looply channel callback failed",e); } };
    const deliver = (wire) => {
      if (!wire || !conversationId || typeof wire !== "object") return;
      const peerId = String(wire.user_id || "");
      if (!UUID.test(peerId)) return;
      let event = "";
      let payload = null;
      if (wire.type === "signal") {
        event = "signal";
        try { payload = JSON.parse(wire.value); } catch { return; }
        if (!payload || typeof payload !== "object") return;
        const wireType = wire.signal_type === "candidate" ? "ice" : wire.signal_type;
        if (!CALL_TYPES.has(wireType)) return;
        payload.type = wireType;
      } else if (wire.type === "broadcast" && wire.event === "ttt") {
        event = "ttt";
        payload = wire.payload;
      } else if (wire.type === "invalidate") {
        event = "invalidate";
        payload = {};
      } else return;
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return;
      // Never trust identity supplied inside a relayed payload.
      payload = { ...payload, senderId: peerId, conversationId };
      for (const item of listeners) if (item.type === "broadcast" && item.event === event) {
        try { item.fn({payload}); } catch (error) { console.error("Looply Realtime listener failed",error); }
      }
    };
    const open = async () => {
      if (!conversationId || closed) throw Error("realtime_conversation_required");
      let token = sessionToken;
      if (typeof getSession === "function") {
        const session = await getSession();
        token = session?.access_token || token;
      }
      if (!token) throw Error("neon_session_required");
      const response = await fetchImpl(origin+"/api/realtime-ticket",{
        method:"POST",cache:"no-store",credentials:"omit",
        // Do not exhaust the call controller's 10-second timeout before the
        // independent Neon RPC fallback gets a chance to connect.
        signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(useFallback ? 850 : 1400) : undefined,
        headers:{"authorization":"Bearer "+token,"content-type":"application/json","accept":"application/json"},
        body:JSON.stringify({conversation_id:conversationId})
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const code = /^[a-z_]{3,80}$/.test(detail?.error || "") ? detail.error : "unknown";
        throw Error("realtime_ticket_http_"+response.status+"_"+code);
      }
      const ticket = await response.json();
      if (!/^[a-f0-9]{64}$/.test(ticket?.ticket || "")) throw Error("invalid_realtime_ticket");
      const WebSocketClass = Socket || globalThis.WebSocket;
      if (typeof WebSocketClass !== "function") throw Error("websocket_unavailable");
      const socketUrl = origin.replace(/^https:/,"wss:")+"/api/realtime?conversation_id="+encodeURIComponent(conversationId);
      const candidate = new WebSocketClass(socketUrl,"looply.ticket."+ticket.ticket);
      ws = candidate;
      await new Promise((resolve,reject) => {
        const timer = timeout(() => { cleanup(); try {candidate.close();}catch{} reject(Error("realtime_connection_timeout")); },useFallback ? 850 : 1400);
        const cleanup = () => { clear(timer); candidate.removeEventListener("open",onOpen); candidate.removeEventListener("error",onError); candidate.removeEventListener("close",onClose); };
        const onOpen = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(Error("realtime_websocket_error")); };
        const onClose = () => { cleanup(); reject(Error("realtime_websocket_closed")); };
        candidate.addEventListener("open",onOpen,{once:true});
        candidate.addEventListener("error",onError,{once:true});
        candidate.addEventListener("close",onClose,{once:true});
      });
      if (closed) {candidate.close();throw Error("channel_closed");}
      candidate.addEventListener("message",event=>{
        try {deliver(JSON.parse(event.data));}catch{}
      });
      candidate.addEventListener("close",()=>{
        if (ws !== candidate) return;
        ws = null; ready = null;
        if (closed || intentionalClose) return;
        report("CLOSED");
        retryTimer = timeout(()=>{retryTimer=null; if (!closed) void start();},1300);
      });
      // Reauthorize conversation membership periodically, not only on page load.
      refreshTimer = timeout(()=>{
        refreshTimer=null;
        if (!closed && ws===candidate) {
          try {candidate.close(1000,"reauthorize");}catch{}
        }
      },4*60*1000);
      attempt=0;
      report("SUBSCRIBED");
      return candidate;
    };
    const start = () => {
      if (closed) return Promise.resolve(null);
      if (ready) return ready;
      ready = open().catch(async cloudflareError=>{
        // Preserve the October 19 WebRTC offer/answer/ICE contract. When the
        // optional Cloudflare WebSocket is blocked, use a separate authenticated
        // Neon signaling RPC (which checks membership independently).
        let error = cloudflareError;
        if (!closed && useFallback && conversationId) {
          try {
            const backup = await fallback.connect(conversationId, deliver, fallbackError=>{
              console.warn("Looply Neon fallback reconnecting", fallbackError?.message);
            }, roomKind === "call" ? 700 : roomKind === "game" ? 1100 : 3200);
            if (closed) { backup.close(); return null; }
            ws = backup;
            report("SUBSCRIBED");
            return backup;
          } catch (fallbackError) {
            error = new Error("cloudflare_" + cloudflareError.message + ";neon_" + fallbackError.message);
          }
        }
        if (!closed) {
          report("CHANNEL_ERROR",error);
          ws = null;
          // Do not loop forever on access denial or missing credentials.
          if (useFallback && !/membership_required|session_required|conversation_required|http_40[13]_/.test(error.message) && ++attempt <= 2) {
            retryTimer = timeout(()=>{retryTimer=null;ready=null; if (!closed) void start();},Math.min(5000,1200*attempt));
          }
        }
        return null;
      });
      return ready;
    };
    const instance = {
      on(type,filter,fn) {
        if (type==="broadcast" && filter && typeof filter.event==="string" && typeof fn==="function") {
          listeners.push({type,event:filter.event,fn});
        }
        // Postgres change feeds remain deliberately unsupported until a
        // separate authoritative Neon invalidation transport is added.
        return instance;
      },
      subscribe(cb) {
        if (typeof cb === "function") callback = cb;
        if (!ready) void start();
        return instance;
      },
      async send(item) {
        if (closed || !conversationId || !item || item.type!=="broadcast") return "error";
        const live = await (ready || start());
        if (!live || live.readyState !== 1) return "error";
        const payload = item.payload;
        if (!payload || typeof payload!=="object" || Array.isArray(payload)) return "error";
        if (live.kind === "neon") return live.send({ event: item.event, payload });
        let wire;
        if (item.event==="signal" && CALL_TYPES.has(payload.type)) {
          const signal_type=payload.type==="ice"?"candidate":payload.type;
          const value=JSON.stringify(payload);
          if (value.length>12000) return "error";
          wire={type:"signal",signal_type,value};
        } else if (item.event==="ttt") {
          if (JSON.stringify(payload).length>12000) return "error";
          wire={type:"broadcast",event:"ttt",payload};
        } else if (item.event==="invalidate") wire={type:"invalidate"};
        else return "error";
        let socketSent = false;
        try { live.send(JSON.stringify(wire)); socketSent = true; }
        catch (error) { console.warn("Looply call room send failed", error?.message); }
        // Cloudflare WebSockets carry fast offers only to *current* subscribers.
        // The global incoming-call overlay listens to the Neon inbox instead.
        // Persist the same authenticated offer there so a recipient navigating
        // from another page can hear the ring and accept the call.
        if (item.event === "signal" && payload.type === "offer" &&
            roomKind === "call" && typeof fallback?.publish === "function") {
          const mirrored = await fallback.publish(conversationId,{event:"signal",payload});
          if (mirrored !== "ok") console.warn("Looply call offer inbox mirror unavailable");
          return socketSent || mirrored === "ok" ? "ok" : "error";
        }
        return socketSent ? "ok" : "error";
      },
      async unsubscribe() {
        closed = true; intentionalClose = true;
        if (retryTimer) clear(retryTimer);
        if (refreshTimer) clear(refreshTimer);
        try {ws?.close(1000,"done");}catch{}
        ws=null; ready=null; channels.delete(instance);
        report("CLOSED");
        return "ok";
      }
    };
    channels.add(instance);
    return instance;
  };
  const removeChannel=async c=>c?.unsubscribe?.();
  return { realtime, channel, removeChannel, supportsRealtime:true };
}
