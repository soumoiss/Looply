const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateChatReadReceiptRpc(name, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  const keys = Object.keys(args);

  if (name === "mark_conversation_read"
      && keys.length === 1
      && keys[0] === "p_conversation_id"
      && UUID.test(String(args.p_conversation_id || ""))) {
    return { name, body: { p_conversation_id: args.p_conversation_id } };
  }

  if (name === "mark_conversations_delivered"
      && keys.length === 1
      && keys[0] === "p_conversation_ids"
      && Array.isArray(args.p_conversation_ids)
      && args.p_conversation_ids.length <= 50
      && args.p_conversation_ids.every(id => UUID.test(String(id)))) {
    return { name, body: { p_conversation_ids: args.p_conversation_ids } };
  }

  return null;
}

export async function invokeChatReadReceiptRpc(dataApiUrl, accessToken, name, args, fetchImpl = fetch) {
  const request = validateChatReadReceiptRpc(name, args);
  if (!request) return { data: null, error: { message: "neon_feature_not_migrated" } };
  if (!accessToken) return { data: null, error: { message: "neon_session_required", status: 401 } };

  try {
    const response = await fetchImpl(dataApiUrl + "/rpc/" + request.name, {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: "Bearer " + accessToken,
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(request.body)
    });
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      return { data: null, error: { message: value?.message || "neon_chat_receipt_rejected", status: response.status, code: value?.code || "" } };
    }
    return { data: value, error: null };
  } catch {
    return { data: null, error: { message: "neon_chat_receipt_unavailable" } };
  }
}

export function countUnreadNotificationsByConversation(notifications = []) {
  const counts = new Map();
  for (const notification of notifications) {
    if (notification?.read_at || !notification?.conversation_id) continue;
    const id = String(notification.conversation_id);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}
