// Looply ORIGINAL — authenticated Cloudflare real-time staging.
// Neon PG17 stores authoritative data; this Worker relays ephemeral events only.
// One-time tickets are never placed in URLs or readable client-side storage.
import readGateway from "./worker.mjs";

const AUTH_API = "https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1";
const ORIGINS = ["https://soumoiss.github.io", "https://looply-mu.vercel.app"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TICKET = /^looply\.ticket\.([a-f0-9]{64})$/;

function respond(payload, code = 200, origin = null) {
  return new Response(JSON.stringify(payload), {
    status: code,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(origin ? { "access-control-allow-origin": origin, "vary": "Origin" } : {})
    }
  });
}
function cors(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || ORIGINS.join(","))
    .split(",").map(x => x.trim()).filter(Boolean);
  const origin = request.headers.get("origin") || "";
  return allowed.includes(origin) ? origin : null;
}
function apiUrl(env) {
  const url = String(env.NEON_DATA_API_URL || AUTH_API).replace(/\/$/, "");
  if (!/^https:\/\/[-\w.]+\.neon\.tech\/[-\w/]+$/.test(url)) throw new Error("invalid_neon_configuration");
  return url;
}
async function neonFetch(api, path, jwt, { method = "GET", body } = {}) {
  return fetch(api + "/" + path, {
    method, redirect: "error", signal: AbortSignal.timeout(8000),
    headers: {
      authorization: "Bearer " + jwt,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
async function authorizedConversation(jwt, conversationId, env) {
  const api = apiUrl(env);
  // Auth identity is derived solely from a Neon-validated bearer token.
  const identity = await neonFetch(api,
    "v3_self_profile?select=id&limit=2", jwt);
  if (!identity.ok) return null;
  const profiles = await identity.json();
  if (!Array.isArray(profiles) || profiles.length !== 1 || !UUID.test(profiles[0]?.id || "")) return null;
  // SECURITY DEFINER RPC checks the session identity and membership; never trust user IDs from the browser.
  const membership = await neonFetch(api, "rpc/v3_is_conversation_member", jwt, {
    method: "POST", body: { p_conversation_id: conversationId }
  });
  if (!membership.ok || await membership.text() !== "true") return null;
  return profiles[0].id;
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/realtime-ticket" && url.pathname !== "/api/realtime") {
      return readGateway.fetch(request, env, ctx);
    }
    const origin = cors(request, env);
    if (!origin) return respond({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": "Authorization, Content-Type",
        "access-control-max-age": "600", "vary": "Origin"
      } });
    }
    if (!env.LOOPLY_ROOMS) return respond({ error: "realtime_unconfigured" }, 503, origin);
    const conversationId = url.pathname === "/api/realtime"
      ? url.searchParams.get("conversation_id")
      : null;
    if (url.pathname === "/api/realtime-ticket") {
      if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405, origin);
      const bearer = request.headers.get("authorization") || "";
      if (!/^Bearer [A-Za-z0-9._~-]{10,8090}$/.test(bearer)) {
        return respond({ error: "authentication_required" }, 401, origin);
      }
      let body;
      try {
        if (Number(request.headers.get("content-length") || 0) > 1024) throw Error();
        body = await request.json();
      } catch { return respond({ error: "invalid_request" }, 400, origin); }
      if (!UUID.test(body?.conversation_id || "")) return respond({ error: "invalid_conversation" }, 400, origin);
      let userId;
      try { userId = await authorizedConversation(bearer.slice(7), body.conversation_id, env); }
      catch { return respond({ error: "backend_unavailable" }, 503, origin); }
      if (!userId) return respond({ error: "forbidden" }, 403, origin);
      const stub = env.LOOPLY_ROOMS.get(env.LOOPLY_ROOMS.idFromName("conversation:" + body.conversation_id));
      const ticket = await stub.issueTicket(userId);
      return respond({ ticket, expires_in: 30 }, 200, origin);
    }
    if (request.method !== "GET" || !UUID.test(conversationId || "")) {
      return respond({ error: "invalid_request" }, 400, origin);
    }
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
      return respond({ error: "upgrade_required" }, 426, origin);
    }
    const protocol = (request.headers.get("sec-websocket-protocol") || "").trim();
    const matched = TICKET.exec(protocol);
    if (!matched) return respond({ error: "ticket_required" }, 401, origin);
    const stub = env.LOOPLY_ROOMS.get(env.LOOPLY_ROOMS.idFromName("conversation:" + conversationId));
    return stub.connect(matched[1], protocol);
  }
};

// Authenticated, room-scoped ephemeral fanout. No old chat media are restored.
export class LooplyConversationRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async issueTicket(userId) {
    if (!UUID.test(userId)) throw new Error("invalid_user");
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const secret = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    // Storage survives hibernation. Use a one-time ticket with strict TTL.
    this.ctx.storage.kv.put("ticket:" + secret, { userId, until: Date.now() + 30000 });
    return secret;
  }

  async connect(secret, protocol) {
    const key = "ticket:" + secret;
    const ticket = this.ctx.storage.kv.get(key);
    // One-time use, including failed/expired attempts.
    this.ctx.storage.kv.delete(key);
    if (!ticket || ticket.until < Date.now() || !UUID.test(ticket.userId)) {
      return respond({ error: "ticket_invalid_or_expired" }, 401);
    }
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId: ticket.userId, connectedAt: Date.now() });
    server.send(JSON.stringify({ type: "connected", user_id: ticket.userId }));
    this.broadcast({ type: "presence", user_id: ticket.userId, online: true }, server);
    return new Response(null, {
      status: 101, webSocket: client,
      headers: { "sec-websocket-protocol": protocol }
    });
  }

  broadcast(event, skip = null) {
    const data = JSON.stringify(event);
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== skip) {
        try { peer.send(data); } catch { /* disconnected socket */ }
      }
    }
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 16384) {
      ws.close(1009, "message_too_large"); return;
    }
    const attach = ws.deserializeAttachment();
    if (!UUID.test(attach?.userId || "")) { ws.close(1008, "unauthorized"); return; }
    // Periodic reconnect is required to reauthorize membership, minimizing stale access.
    if (Date.now() - attach.connectedAt > 5 * 60 * 1000) {
      ws.close(1000, "reauthorize"); return;
    }
    let payload;
    try { payload = JSON.parse(message); } catch { return; }
    if (!payload || typeof payload !== "object") return;
    if (payload.type === "typing") {
      this.broadcast({ type: "typing", user_id: attach.userId, active: payload.active === true }, ws);
    } else if (payload.type === "invalidate") {
      // No client-supplied message body is ever accepted as authoritative.
      this.broadcast({ type: "invalidate", user_id: attach.userId }, ws);
    } else if (payload.type === "signal") {
      // WebRTC signaling only; no SDP persistence in the Worker.
      if (!["offer", "answer", "candidate", "hangup"].includes(payload.signal_type)) return;
      if (typeof payload.value !== "string" || payload.value.length > 12000) return;
      this.broadcast({
        type: "signal", signal_type: payload.signal_type,
        value: payload.value, user_id: attach.userId
      }, ws);
    }
  }

  async webSocketClose(ws) {
    const user = ws.deserializeAttachment()?.userId;
    if (user) this.broadcast({ type: "presence", user_id: user, online: false }, ws);
  }
  async webSocketError(ws) {
    const user = ws.deserializeAttachment()?.userId;
    if (user) this.broadcast({ type: "presence", user_id: user, online: false }, ws);
  }
}
