// Zero-dependency S3 client. Neon Functions inject the storage credentials.
const allowedOrigin = "https://soumoiss.github.io";
const encoder = new TextEncoder();
const maxBytes = bucket => (bucket === "looply-avatars" ? 10 : 25) * 1024 * 1024;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers } });
const cors = origin => ({ "access-control-allow-origin": origin, "access-control-allow-methods": "PUT, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type, x-looply-bucket, x-looply-path", "access-control-max-age": "600", vary: "Origin" });
const rfc3986 = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const hex = value => [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async value => hex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value));
async function hmac(key, value) { const material = typeof key === "string" ? encoder.encode(key) : key; const cryptoKey = await crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value))); }
function awsTimestamp(now = new Date()) { const compact = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); return { amzDate: compact, dateStamp: compact.slice(0, 8) }; }
function objectUri(bucket, path) { const endpointPath = new URL(process.env.AWS_ENDPOINT_URL_S3).pathname.replace(/\/$/, ""); return `${endpointPath}/${rfc3986(bucket)}/${path.split("/").map(rfc3986).join("/")}`; }
async function signingKey(dateStamp) { const region = process.env.AWS_REGION; return hmac(await hmac(await hmac(await hmac(`AWS4${process.env.AWS_SECRET_ACCESS_KEY}`, dateStamp), region), "s3"), "aws4_request"); }
async function signedRequest({ method, bucket, path, bytes = new Uint8Array(), mime = "", presignSeconds = 0 }) {
  const endpoint = new URL(process.env.AWS_ENDPOINT_URL_S3), canonicalUri = objectUri(bucket, path), { amzDate, dateStamp } = awsTimestamp();
  const scope = `${dateStamp}/${process.env.AWS_REGION}/s3/aws4_request`, payloadHash = presignSeconds ? "UNSIGNED-PAYLOAD" : await sha256(bytes), query = new URLSearchParams();
  if (presignSeconds) { query.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256"); query.set("X-Amz-Credential", `${process.env.AWS_ACCESS_KEY_ID}/${scope}`); query.set("X-Amz-Date", amzDate); query.set("X-Amz-Expires", String(presignSeconds)); query.set("X-Amz-SignedHeaders", "host"); }
  const headers = { host: endpoint.host };
  if (!presignSeconds) { headers["x-amz-content-sha256"] = payloadHash; headers["x-amz-date"] = amzDate; if (mime) headers["content-type"] = mime; }
  const signedHeaders = Object.keys(headers).sort(), canonicalHeaders = signedHeaders.map(name => `${name}:${headers[name].trim()}\n`).join(""), canonicalQuery = [...query.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`).join("&");
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders.join(";")}\n${payloadHash}`;
  const signature = hex(await hmac(await signingKey(dateStamp), `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256(canonicalRequest)}`));
  if (presignSeconds) query.set("X-Amz-Signature", signature); else headers.authorization = `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`;
  const canonicalUrl = `${endpoint.origin}${canonicalUri}`;
  return { url: presignSeconds ? `${canonicalUrl}?${[...query.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`).join("&")}` : canonicalUrl, headers };
}
function safeObjectPath(value) { const path = String(value || ""); return path.length <= 512 && !path.startsWith("/") && !path.includes("..") && !/[\\\u0000-\u001f\u007f]/.test(path) && path.split("/").every(part => part && encodeURIComponent(decodeURIComponent(part)) === part); }
function allowedFile(bucket, path, mime, size, profileId) {
  if (bucket === "looply-avatars") return path.startsWith(`avatars/${profileId}/`) && /^avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(path) && ["image/jpeg", "image/png", "image/webp"].includes(mime) && size > 0 && size <= maxBytes(bucket);
  if (bucket === "looply-gallery") return path.startsWith(`gallery/${profileId}/`) && /^gallery\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,20}$/i.test(path) && /^(image\/(jpeg|png|gif|webp|avif|heic|heif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|aac|ogg|wav|webm|opus))$/.test(mime) && size > 0 && size <= maxBytes(bucket);
  return false;
}
async function identity(request) { const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") || ""); if (!match) return null; try { const response = await fetch(`${process.env.NEON_DATA_API_URL}/v3_self_profile?select=id&limit=1`, { headers: { authorization: `Bearer ${match[1]}`, accept: "application/json" } }); const profileId = response.ok ? (await response.json())?.[0]?.id : null; return /^[0-9a-f-]{36}$/i.test(String(profileId || "")) ? profileId : null; } catch { return null; } }
export default { async fetch(request) {
  const origin = request.headers.get("origin") || "", headers = cors(origin === allowedOrigin ? origin : "null");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (origin !== allowedOrigin) return json({ error: "origin_not_allowed" }, 403, headers);
  if (![process.env.NEON_DATA_API_URL, process.env.AWS_ENDPOINT_URL_S3, process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY, process.env.AWS_REGION].every(Boolean)) return json({ error: "storage_not_configured" }, 503, headers);
  const profileId = await identity(request); if (!profileId) return json({ error: "unauthorized" }, 401, headers);
  const bucket = request.headers.get("x-looply-bucket") || "", path = request.headers.get("x-looply-path") || "";
  if (!safeObjectPath(path) || !["looply-avatars", "looply-gallery"].includes(bucket)) return json({ error: "invalid_object" }, 400, headers);
  const url = new URL(request.url);
  if (url.pathname.endsWith("/storage/upload") && request.method === "PUT") {
    const mime = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(), bytes = new Uint8Array(await request.arrayBuffer());
    if (!allowedFile(bucket, path, mime, bytes.length, profileId)) return json({ error: "file_not_allowed" }, 400, headers);
    const signed = await signedRequest({ method: "PUT", bucket, path, bytes, mime }), response = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: bytes });
    if (!response.ok) { console.error("S3 object write failed", response.status); return json({ error: "storage_write_failed" }, 502, headers); }
    return json({ path }, 200, headers);
  }
  if (url.pathname.endsWith("/storage/remove") && request.method === "POST") {
    const owned = (bucket === "looply-avatars" && path.startsWith(`avatars/${profileId}/`)) || (bucket === "looply-gallery" && path.startsWith(`gallery/${profileId}/`));
    if (!owned) return json({ error: "forbidden" }, 403, headers);
    const signed = await signedRequest({ method: "DELETE", bucket, path }), response = await fetch(signed.url, { method: "DELETE", headers: signed.headers });
    if (!response.ok) { console.error("S3 object removal failed", response.status); return json({ error: "storage_remove_failed" }, 502, headers); }
    return json({ path }, 200, headers);
  }
  if (url.pathname.endsWith("/storage/sign") && request.method === "POST") {
    const checkUrl = bucket === "looply-avatars" ? `${process.env.NEON_DATA_API_URL}/profiles?id=eq.${encodeURIComponent(profileId)}&avatar_path=eq.${encodeURIComponent(path)}&select=id&limit=1` : `${process.env.NEON_DATA_API_URL}/community_gallery_media?storage_path=eq.${encodeURIComponent(path)}&publication_state=eq.published&select=id,owner_id,visibility,private_owner_id&limit=1`;
    const checkResponse = await fetch(checkUrl, { headers: { authorization: request.headers.get("authorization"), accept: "application/json" } }), mediaRow = checkResponse.ok ? (await checkResponse.json())?.[0] : null;
    if (!mediaRow || (bucket === "looply-gallery" && !(mediaRow.owner_id === profileId || (mediaRow.private_owner_id == null && mediaRow.visibility === "members")))) return json({ error: "object_not_visible" }, 403, headers);
    const payload = await request.json().catch(() => ({})), signed = await signedRequest({ method: "GET", bucket, path, presignSeconds: Math.max(60, Math.min(1800, Number(payload.expiresIn) || 1800)) });
    return json({ signedUrl: signed.url }, 200, headers);
  }
  return json({ error: "not_found" }, 404, headers);
} };
