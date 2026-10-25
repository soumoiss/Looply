// Looply original: first read-only Cloudflare gateway for the Neon migration.
// Staging only: it does NOT replace existing Supabase endpoints or create sessions.
// Requires JWTs issued by Neon Auth, checked again by Neon's Data API policies.
const DEFAULT_DATA_API = "https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1";
const DEFAULT_ORIGINS = ["https://soumoiss.github.io", "https://looply-mu.vercel.app"];
const ALLOWED_FIELDS = {
  "/api/self-profile": {
    endpoint: "v3_self_profile?select=id,username,display_name,bio,theme,avatar_path",
    fields: ["id", "username", "display_name", "bio", "theme", "avatar_path"],
    maxRows: 1, maxBytes: 12000, key: "profiles"
  },
  "/api/feed": {
    endpoint: "v3_feed_posts?select=id,author_id,body,visibility,created_at,updated_at,external_url&order=created_at.desc&limit=25",
    fields: ["id", "author_id", "body", "visibility", "created_at", "updated_at", "external_url"],
    maxRows: 25, maxBytes: 250000, key: "posts"
  }
};

function json(data, status, origin, headers = {}) {
  const h = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex, nofollow",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    ...headers
  };
  if (origin) {
    h["access-control-allow-origin"] = origin;
    h["vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers: h });
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  let origins = DEFAULT_ORIGINS;
  if (env.ALLOWED_ORIGINS) origins = String(env.ALLOWED_ORIGINS).split(",").map(s => s.trim()).filter(Boolean);
  return origins.includes(origin) ? origin : null;
}
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const requestedOrigin = request.headers.get("origin");
    const origin = allowedOrigin(request, env);
    if (requestedOrigin && !origin) return json({ error: "origin_not_allowed" }, 403, null);
    if (request.method === "OPTIONS") {
      if (!origin) return json({ error: "origin_not_allowed" }, 403, null);
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-allow-headers": "Authorization, Content-Type",
        "access-control-max-age": "600", "vary": "Origin"
      } });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405, origin, { allow: "GET, HEAD, OPTIONS" });
    }
    if (url.pathname === "/health") {
      return json({ service: "looply-original-neon-gateway", phase: "staging-readonly",
        database: "neon", auth: "neon", media_migration_complete: false,
        full_feature_parity: false, supabase_independence_complete: false }, 200, origin);
    }
    const route = ALLOWED_FIELDS[url.pathname];
    if (!route) return json({ error: "not_found" }, 404, origin);
    const bearer = request.headers.get("authorization") || "";
    if (!/^Bearer [A-Za-z0-9._~-]+$/.test(bearer) || bearer.length > 8192) {
      return json({ error: "authentication_required" }, 401, origin);
    }
    const api = String(env.NEON_DATA_API_URL || DEFAULT_DATA_API).replace(/\/$/, "");
    // URL and credentials are never taken from user-controlled query parameters.
    if (!/^https:\/\/[^/]+\.neon\.tech\/[^?#]+$/.test(api)) {
      return json({ error: "gateway_configuration_invalid" }, 503, origin);
    }
    try {
      const upstream = await fetch(api + "/" + route.endpoint, {
        method: "GET", redirect: "error",
        headers: { authorization: bearer, accept: "application/json" },
        signal: AbortSignal.timeout(8000)
      });
      if (upstream.status === 401 || upstream.status === 403) {
        return json({ error: "authentication_required" }, 401, origin);
      }
      if (!upstream.ok) return json({ error: "backend_unavailable" }, 503, origin);
      const body = await upstream.text();
      if (body.length > route.maxBytes) return json({ error: "response_too_large" }, 503, origin);
      const result = JSON.parse(body);
      if (!Array.isArray(result) || result.length > route.maxRows) {
        return json({ error: "invalid_backend_response" }, 503, origin);
      }
      const rows = result.map(record => Object.fromEntries(route.fields.map(key => [key, record?.[key] ?? null])));
      return json({ [route.key]: rows }, 200, origin);
    } catch {
      return json({ error: "backend_unavailable" }, 503, origin);
    }
  }
};
