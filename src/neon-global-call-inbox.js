// Single Neon-authenticated incoming-call inbox for all direct conversations.
// Replaces per-conversation fallback polling on Home, Cartas, Músicas, etc.
// WebRTC offer/answer/ICE still use existing signaling channels on the call page.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["offer", "hangup", "decline", "failed"]);
const validUrl = input => {
  const url = new URL(input);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".neon.tech") || url.username || url.password) {
    throw new Error("invalid_neon_signal_endpoint");
  }
  return url.href.replace(/\/$/, "");
};
export function createGlobalCallInbox({
  dataApiUrl, getSession, fetcher = (...args) => fetch(...args),
  schedule = setTimeout, cancel = clearTimeout, visibleDelay = 850, hiddenDelay = 9000,
  isVisible = () => typeof document === "undefined" || document.visibilityState === "visible"
}) {
  const base = validUrl(dataApiUrl);
  const rpc = async (name, args) => {
    const session = await getSession();
    if (!session?.access_token) throw new Error("neon_inbox_session_required");
    const response = await fetcher(base + "/rpc/" + name, {
      method: "POST", cache: "no-store", credentials: "omit",
      headers: {
        authorization: "Bearer " + session.access_token,
        "content-type": "application/json", accept: "application/json"
      },
      body: JSON.stringify(args),
      signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(9000) : undefined
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error("neon_call_inbox_http_" + response.status + "_" +
        String(detail?.code || "unknown").replace(/[^a-z0-9_]/gi, "").slice(0, 25));
    }
    return response.json();
  };
  async function sendSignal(conversationId, type) {
    if (!UUID.test(conversationId) || !["decline", "hangup"].includes(type)) return false;
    try {
      await rpc("v3_call_signal_send", {
        p_conversation_id: conversationId, p_kind: "signal",
        p_payload: { type, conversationId }
      });
      return true;
    } catch (error) {
      console.warn("Looply incoming-call response failed", error);
      return false;
    }
  }
  function subscribe(onSignal, onFailure = () => {}) {
    if (typeof onSignal !== "function") throw new Error("call_listener_required");
    let cursor = 0, stopped = false, timer = null, failures = 0;
    const from = new Date(Date.now() - 15000).toISOString();
    const poll = async () => {
      if (stopped) return;
      try {
        const rows = await rpc("v3_call_signal_inbox", { p_after: cursor, p_from: from });
        if (!Array.isArray(rows)) throw new Error("invalid_call_inbox_response");
        if (stopped) return;
        for (const row of rows) {
          const next = Number(row.id);
          if (Number.isSafeInteger(next) && next > cursor) cursor = next;
          if (!UUID.test(row.conversation_id) || !UUID.test(row.sender_id) ||
            row.kind !== "signal" || !row.payload || typeof row.payload !== "object" ||
            Array.isArray(row.payload) || !TYPES.has(row.payload.type)) continue;
          onSignal({
            conversationId: row.conversation_id, senderId: row.sender_id,
            payload: { ...row.payload, senderId: row.sender_id, conversationId: row.conversation_id }
          });
        }
        failures = 0;
      } catch (error) {
        failures++;
        if (failures === 1 || failures === 5) onFailure(error);
      }
      if (!stopped) timer = schedule(poll, failures
        ? Math.min(10000, visibleDelay * (failures + 1))
        : isVisible() ? visibleDelay : hiddenDelay);
    };
    void poll();
    const wake = () => {
      if (stopped || !isVisible() || timer === null) return;
      cancel(timer);
      timer = schedule(poll, 0);
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      if (timer !== null) cancel(timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", wake);
    };
  }
  return { subscribe, sendSignal };
}
