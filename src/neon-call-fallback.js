// Neon Postgres-only signaling fallback for voice/video calls, chat invalidations,
// and live game invitations. The DB functions validate auth.uid() and conversation
// membership independently of Cloudflare; clients cannot choose the sender ID.
// This code sends only ephemeral signals (never message text or stored media).
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EVENTS = new Set(["signal","ttt","invalidate"]);
const CALLS = new Set(["offer","answer","ice","hangup","decline","failed"]);

export function createNeonSignalFallback({
  dataApiUrl, getSession, fetcher = (...args) => fetch(...args),
  delay = 1300, schedule = setTimeout, cancel = clearTimeout
}) {
  const api = new URL(dataApiUrl);
  if (api.protocol !== "https:" || api.username || api.password || api.search || api.hash || !api.hostname.endsWith(".neon.tech")) {
    throw new Error("invalid_neon_data_api");
  }
  const base = api.href.replace(/\/$/, "");
  const rpc = async (name, payload) => {
    const session = await getSession();
    if (!session?.access_token) throw new Error("neon_signal_session_required");
    const response = await fetcher(base + "/rpc/" + name, {
      method: "POST", cache: "no-store", credentials: "omit",
      headers: { authorization: "Bearer " + session.access_token,
        "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const code = /^[a-z0-9_]{1,80}$/i.test(detail?.code || "") ? detail.code : "unknown";
      throw new Error("neon_signal_http_" + response.status + "_" + code);
    }
    return response.json();
  };
  const connect = async (conversationId, onWire, onStatus) => {
    if (!UUID.test(conversationId)) throw new Error("invalid_conversation_id");
    let stopped = false, timer = null, cursor = 0, failures = 0;
    // Ignore stale hangups, old offers or invitations from previous sessions.
    const since = new Date(Date.now() - 3000).toISOString();
    const poll = async () => {
      const data = await rpc("v3_call_signal_list", {
        p_conversation_id: conversationId, p_after: cursor, p_from: since
      });
      if (!Array.isArray(data)) throw new Error("invalid_signal_poll_result");
      if (stopped) return;
      for (const item of data) {
        if (Number.isSafeInteger(Number(item.id)) && Number(item.id) > cursor) cursor = Number(item.id);
        if (!UUID.test(item.sender_id || "") || !EVENTS.has(item.kind) || !item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) continue;
        let wire;
        if (item.kind === "signal" && CALLS.has(item.payload.type)) {
          wire = { type: "signal", signal_type: item.payload.type === "ice" ? "candidate" : item.payload.type,
            value: JSON.stringify(item.payload), user_id: item.sender_id };
        } else if (item.kind === "ttt") {
          wire = { type: "broadcast", event: "ttt", payload: item.payload, user_id: item.sender_id };
        } else if (item.kind === "invalidate") {
          wire = { type: "invalidate", user_id: item.sender_id };
        }
        if (wire) onWire(wire);
      }
    };
    const tick = async () => {
      if (stopped) return;
      try {
        await poll(); failures = 0;
      } catch (error) {
        failures += 1;
        if (failures === 3) onStatus?.(error);
      }
      if (!stopped) timer = schedule(tick, failures ? Math.min(8000, delay * (1 + failures)) : delay);
    };
    // Validate current Neon membership before signaling a successful connection.
    await poll();
    if (stopped) throw new Error("fallback_channel_closed");
    timer = schedule(tick, delay);
    return {
      kind: "neon", readyState: 1,
      async send({event,payload}) {
        if (stopped || !EVENTS.has(event) || !payload || typeof payload !== "object" || Array.isArray(payload)) return "error";
        if (event === "signal" && !CALLS.has(payload.type)) return "error";
        if (JSON.stringify(payload).length > 12000) return "error";
        try {
          await rpc("v3_call_signal_send", {
            p_conversation_id: conversationId, p_kind: event, p_payload: payload
          });
          return "ok";
        } catch (error) {
          onStatus?.(error);
          return "error";
        }
      },
      close() {
        stopped = true;
        if (timer !== null) cancel(timer);
        timer = null;
      }
    };
  };
  return { connect };
}
