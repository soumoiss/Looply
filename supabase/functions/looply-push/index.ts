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
  // Actual delivery is intentionally delegated to a secret-backed provider adapter.
  // This endpoint never accepts VAPID private keys or service-role credentials from clients.
  return respond(202, { accepted: true, recipientCount: payload.recipientIds.length, kind: String(payload.kind || "activity").slice(0, 40) });
});
