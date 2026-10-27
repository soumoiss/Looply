// Fast, authenticated incoming calls across every Looply page (Neon only).
// One inbox RPC covers all direct conversations the signed-in user belongs to.
// Server verifies auth.uid(), identity links and participant membership before
// returning ephemeral call offers; no private user data is cached in the browser.
const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const TYPES = new Set(["offer", "hangup", "decline", "failed"]);

export function createFastIncomingPoller({
  client, onSignal, fetcher = (...args) => fetch(...args),
  schedule = setTimeout, cancel = clearTimeout,
  visibility = () => globalThis.document?.visibilityState || "visible",
  visibleInterval = 750, hiddenInterval = 2500,
  onError = error => console.warn("Looply incoming-call inbox unavailable", error)
}) {
  if (!client?.dataApiUrl || typeof onSignal !== "function") throw Error("fast_calls_invalid_client");
  const url = new URL(client.dataApiUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".neon.tech") || url.search || url.hash) {
    throw Error("fast_calls_invalid_neon_origin");
  }
  const rpcUrl = url.href.replace(/\/$/, "") + "/rpc/v3_call_signal_inbox";
  const afterStart = new Date(Date.now() - 5000).toISOString();
  let cursor = 0, stopped = true, timer = null, inFlight = false, failures = 0;
  const scheduleNext = () => {
    if (stopped) return;
    timer = schedule(() => { timer = null; void poll(); }, failures ?
      Math.min(6000, 700 * failures) : visibility() === "visible" ? visibleInterval : hiddenInterval);
  };
  const poll = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const {data,error} = await client.auth.getSession();
      if (error || !data?.session?.access_token) throw Error("incoming_call_session_missing");
      const response = await fetcher(rpcUrl, {
        method:"POST", cache:"no-store", credentials:"omit",
        headers:{authorization:"Bearer "+data.session.access_token,
          "content-type":"application/json",accept:"application/json"},
        body:JSON.stringify({p_after:cursor,p_from:afterStart}),
        signal:typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(4000) : undefined
      });
      if (!response.ok) throw Error("incoming_call_http_"+response.status);
      const items = await response.json();
      if (!Array.isArray(items)) throw Error("incoming_call_invalid_response");
      if (!stopped) {
        for (const item of items) {
          const id = Number(item?.id);
          if (!Number.isSafeInteger(id) || id < 1) continue;
          cursor = Math.max(cursor,id);
          if (!UUID.test(item?.conversation_id || "") || !UUID.test(item?.sender_id || "")) continue;
          if (item?.kind !== "signal" || !item.payload || typeof item.payload !== "object") continue;
          if (!TYPES.has(item.payload.type)) continue;
          try {
            onSignal({conversationId:item.conversation_id,senderId:item.sender_id,payload:{
              ...item.payload, senderId:item.sender_id,conversationId:item.conversation_id
            }});
          } catch (error) { onError(error); }
        }
      }
      failures = 0;
    } catch(error) {
      if (!stopped && (++failures === 1 || failures === 5)) onError(error);
    } finally {
      inFlight = false;
      scheduleNext();
    }
  };
  const send = async ({conversationId,type}) => {
    if (!UUID.test(conversationId || "") || !TYPES.has(type)) return false;
    try {
      const {data,error} = await client.auth.getSession();
      if (error || !data?.session?.access_token) return false;
      const response = await fetcher(url.href.replace(/\/$/,"")+"/rpc/v3_call_signal_send",{
        method:"POST",cache:"no-store",credentials:"omit",
        headers:{authorization:"Bearer "+data.session.access_token,
          "content-type":"application/json",accept:"application/json"},
        body:JSON.stringify({p_conversation_id:conversationId,p_kind:"signal",p_payload:{type,conversationId}})
      });
      return response.ok;
    } catch (error) { onError(error); return false; }
  };
  const start = () => { if (!stopped) return; stopped = false; void poll(); };
  const stop = () => { stopped = true; if (timer !== null) cancel(timer); timer = null; };
  return {start,stop,refresh:poll,send,get isRunning(){return !stopped;}};
}
