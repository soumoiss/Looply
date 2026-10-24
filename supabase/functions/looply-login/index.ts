import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function namedKey(pluralName: string, legacyNames: string[]) {
  const encoded = Deno.env.get(pluralName);
  if (encoded) {
    try {
      const keys = JSON.parse(encoded);
      if (typeof keys?.default === "string") return keys.default;
    } catch (error) {
      console.error(`Invalid ${pluralName} configuration.`, error);
    }
  }
  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return "";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { error: "Use POST." });

  try {
    const payload = await request.json();
    const username = String(payload?.username || "").trim().toLowerCase();
    const password = String(payload?.password || "");
    if (!/^[a-z0-9_]{3,30}$/.test(username) || password.length < 1 || password.length > 256) {
      return respond(400, { error: "invalid_credentials" });
    }

    const projectUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = namedKey("SUPABASE_SECRET_KEYS", ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]);
    const publicKey = namedKey("SUPABASE_PUBLISHABLE_KEYS", ["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"]);
    if (!projectUrl || !serviceKey || !publicKey) {
      return respond(503, { error: "login_unavailable" });
    }

    const service = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = createClient(projectUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await service
      .from("profiles").select("id").eq("username", username).maybeSingle();
    if (profileError || !profile?.id) return respond(401, { error: "invalid_credentials" });

    const { data: account, error: accountError } = await service.auth.admin.getUserById(profile.id);
    const email = account?.user?.email;
    if (accountError || !email) return respond(401, { error: "invalid_credentials" });

    const { data: session, error: signInError } = await auth.auth.signInWithPassword({ email, password });
    if (signInError || !session.session) return respond(401, { error: "invalid_credentials" });
    return respond(200, {
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      expires_in: session.session.expires_in,
      token_type: session.session.token_type
    });
  } catch {
    return respond(400, { error: "invalid_request" });
  }
});
