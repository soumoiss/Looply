function base64ToBytes(value) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0)); }
export async function registerPushSubscription(client, { vapidPublicKey } = {}) {
  if (!client || !vapidPublicKey || !navigator.serviceWorker || !window.PushManager) return { ok: false, reason: "unsupported" };
  if (Notification.permission === "denied") return { ok: false, reason: "denied" };
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(vapidPublicKey) });
  const json = subscription.toJSON();
  const { error } = await client.from("push_subscriptions").upsert({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }, { onConflict: "user_id,endpoint" });
  return error ? { ok: false, reason: "storage" } : { ok: true };
}
export async function removePushSubscription(client, endpoint) { if (!client || !endpoint) return; await client.from("push_subscriptions").delete().eq("endpoint", endpoint); }
