import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedPlaylists = new Set([
  "PLUZFdmgmipvI",
  "PLCn4CAsA_tiM",
  "PLE0tcB0gaSzM",
  "PLD5PXwJcU-Sg",
  "PLMeQ_QyqhY7s"
]);
const allowedOrigins = new Set([
  "https://soumoiss.github.io",
  "https://looply-mu.vercel.app"
]);
const upstreamEndpoint = "https://looply-mu.vercel.app/api/youtube-playlist";

function responseHeaders(origin: string) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "vary": "Origin, Authorization",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-max-age": "600",
    "x-content-type-options": "nosniff"
  });
  if (origin) headers.set("access-control-allow-origin", origin);
  return headers;
}

function respond(origin: string, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  if (origin && !allowedOrigins.has(origin)) {
    return respond("", 403, { error: "origin_not_allowed" });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: new Headers([...responseHeaders(origin), ["allow", "GET, OPTIONS"]])
    });
  }

  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) {
    return respond(origin, 401, { error: "youtube_unauthorized" });
  }

  let params: URLSearchParams;
  try {
    params = new URL(request.url).searchParams;
  } catch {
    return respond(origin, 400, { error: "invalid_request" });
  }
  const playlistId = String(params.get("playlistId") || "");
  const pageToken = String(params.get("pageToken") || "");
  if (!allowedPlaylists.has(playlistId)) {
    return respond(origin, 400, { error: "youtube_playlist_not_allowed" });
  }
  if (pageToken.length > 2048 || /[\u0000-\u001f\u007f]/.test(pageToken)) {
    return respond(origin, 400, { error: "invalid_page_token" });
  }

  const upstreamUrl = new URL(upstreamEndpoint);
  upstreamUrl.searchParams.set("playlistId", playlistId);
  if (pageToken) upstreamUrl.searchParams.set("pageToken", pageToken);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { accept: "application/json", authorization },
      signal: controller.signal
    });
    let data: Record<string, unknown>;
    try {
      data = await upstream.json();
    } catch {
      return respond(origin, 502, { error: "youtube_upstream_invalid_response" });
    }
    if (!upstream.ok) {
      const code = typeof data.error === "string" ? data.error : "youtube_upstream_error";
      const safeCode = /^[A-Za-z0-9_-]{1,80}$/.test(code) ? code : "youtube_upstream_error";
      return respond(origin, upstream.status >= 500 ? 502 : upstream.status, { error: safeCode });
    }
    return respond(origin, 200, {
      items: Array.isArray(data.items) ? data.items : [],
      nextPageToken: typeof data.nextPageToken === "string" ? data.nextPageToken : ""
    });
  } catch (error) {
    return respond(origin, error instanceof Error && error.name === "AbortError" ? 504 : 502, {
      error: error instanceof Error && error.name === "AbortError" ? "youtube_upstream_timeout" : "youtube_upstream_unavailable"
    });
  } finally {
    clearTimeout(timeout);
  }
});
