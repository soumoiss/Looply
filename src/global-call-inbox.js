// A SINGLE authenticated Neon poll across all direct conversations, independent
// of the active tab. Cloudflare's WebSockets still provide the faster push path.
// This poll is only a recovery path when WebSockets cannot connect on mobile.
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EVENT_TYPES = new Set(["ring","offer","hangup","decline","failed"]);
export function startGlobalCallInbox({
  dataApiUrl, getSession, onEvent, onError = () => {},
  fetcher = (...args) => fetch(...args),
  scheduler = setTimeout, unschedule = clearTimeout,
  visible = () => !globalThis.document?.hidden,
  now = () => Date.now(),
  foregroundDelay = 1100, backgroundDelay = 3500
}) {
  const target = new URL(dataApiUrl);
  if (target.protocol !== "https:" || target.username || target.password ||
      target.search || target.hash || !target.hostname.endsWith(".neon.tech")) {
    throw new Error("invalid_neon_call_inbox_api");
  }
  let cursor = 0, stopped = false, timer = null, failures = 0;
  const since = new Date(now() - 5000).toISOString();
  const url = target.href.replace(/\/$/, "") + "/rpc/v3_call_signal_inbox";
  const poll = async () => {
    const session = await getSession();
    if (!session?.access_token) throw new Error("neon_inbox_session_required");
    const response = await fetcher(url, {
      method: "POST", cache: "no-store", credentials: "omit",
      headers: { authorization: "Bearer " + session.access_token,
        "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ p_after: cursor, p_from: since })
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      const code = /^[0-9a-z_]{1,80}$/i.test(problem.code || "") ? problem.code : "unknown";
      throw new Error("neon_inbox_http_" + response.status + "_" + code);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("invalid_neon_inbox_response");
    if (stopped) return;
    for (const row of rows) {
      if (!Number.isSafeInteger(Number(row.id)) || Number(row.id) <= cursor) continue;
      cursor = Number(row.id);
      if (!ID.test(row.conversation_id || "") || !ID.test(row.sender_id || "") ||
          row.kind !== "signal" || !row.payload || typeof row.payload !== "object" ||
          Array.isArray(row.payload) || !EVENT_TYPES.has(row.payload.type)) continue;
      try {
        onEvent({
          conversationId: row.conversation_id, senderId: row.sender_id,
          type: row.payload.type, payload: {
            ...row.payload, senderId: row.sender_id, conversationId: row.conversation_id
          }
        });
      } catch (error) { onError(error); }
    }
  };
  const tick = async () => {
    if (stopped) return;
    try { await poll(); failures = 0; }
    catch (error) {
      failures++;
      if (failures === 1 || failures % 8 === 0) onError(error);
    }
    if (!stopped) timer = scheduler(tick,
      failures ? Math.min(15000, 2000 * failures) :
        visible() ? foregroundDelay : backgroundDelay);
  };
  const ready = tick();
  return {
    ready,
    pollNow: () => stopped ? Promise.resolve() : poll(),
    stop() {
      stopped = true;
      if (timer !== null) unschedule(timer);
      timer = null;
    }
  };
}
