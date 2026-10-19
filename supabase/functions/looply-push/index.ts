import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Content-Type": "application/json" };
const respond = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
const allowedUrl = (url: string) => /^(?:home|notificacoes|conversa|galeria|cartas|musicas)\.html(?:[?#].*)?$/.test(url);
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });
  const auth = request.headers.get("Authorization");
  if (!auth) return respond(401, { error: "unauthorized" });
  const payload = await request.json().catch(() => null);
  if (!payload || !Array.isArray(payload.recipientIds) || payload.recipientIds.length < 1 || payload.recipientIds.length > 100 || !allowedUrl(String(payload.url || "notificacoes.html"))) return respond(400, { error: "invalid_payload" });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return respond(401, { error: "unauthorized" });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: subscriptions, error } = await service.from("push_subscriptions").select("id,endpoint,p256dh,auth").in("user_id", payload.recipientIds);
  if (error) return respond(202, { accepted: true });
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@looply.app";
  if (!vapidPublic || !vapidPrivate) return respond(503, { error: "push_not_configured" });
  const webpush = await import("npm:web-push");
  webpush.default.setVapidDetails(subject, vapidPublic, vapidPrivate);
  const body = JSON.stringify({ title: String(payload.title || "Looply").slice(0, 80), body: String(payload.body || "Nova atividade").slice(0, 180), url: String(payload.url) });
  let delivered = 0;
  for (const subscription of subscriptions || []) {
    try {
      await webpush.default.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, body);
      delivered += 1;
    } catch (sendError) {
      const status = Number(sendError?.statusCode || 0);
      if (status === 404 || status === 410) await service.from("push_subscriptions").delete().eq("id", subscription.id);
    }
  }
  return respond(202, { accepted: true, delivered });
});
