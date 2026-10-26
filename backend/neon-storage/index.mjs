import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const allowedOrigin = "https://soumoiss.github.io";
const storage = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
});
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers }
});
const cors = origin => ({
  "access-control-allow-origin": origin,
  "access-control-allow-methods": "PUT, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-looply-bucket, x-looply-path",
  "access-control-max-age": "600",
  vary: "Origin"
});
function safeObjectPath(value) {
  const path = String(value || "");
  return path.length <= 512 && !path.startsWith("/") && !path.includes("..") && !/[\\\u0000-\u001f\u007f]/.test(path) && path.split("/").every(part => part && encodeURIComponent(decodeURIComponent(part)) === part);
}
function allowedFile(bucket, path, mime, size, profileId) {
  if (bucket === "looply-avatars") return path.startsWith(`avatars/${profileId}/`) && /^avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(path) && ["image/jpeg", "image/png", "image/webp"].includes(mime) && size > 0 && size <= 10 * 1024 * 1024;
  if (bucket === "looply-gallery") return path.startsWith(`gallery/${profileId}/`) && /^gallery\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,20}$/i.test(path) && /^(image\/(jpeg|png|gif|webp|avif|heic|heif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|aac|ogg|wav|webm|opus))$/.test(mime) && size > 0 && size <= 25 * 1024 * 1024;
  return false;
}
async function identity(request) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") || "");
  if (!match) return null;
  try {
    const rows = await fetch(process.env.NEON_DATA_API_URL + "/v3_self_profile?select=id&limit=1", {
      headers: { authorization: "Bearer " + match[1], accept: "application/json" }
    });
    if (!rows.ok) return null;
    const profile = (await rows.json())?.[0];
    const profileId = profile?.id;
    return /^[0-9a-f-]{36}$/i.test(String(profileId || "")) ? profileId : null;
  } catch { return null; }
}
export default {
  async fetch(request) {
    const origin = request.headers.get("origin") || "";
    const headers = cors(origin === allowedOrigin ? origin : "null");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (origin !== allowedOrigin) return json({ error: "origin_not_allowed" }, 403, headers);
    if (!process.env.NEON_DATA_API_URL || !process.env.AWS_ENDPOINT_URL_S3 || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return json({ error: "storage_not_configured" }, 503, headers);
    const profileId = await identity(request);
    if (!profileId) return json({ error: "unauthorized" }, 401, headers);
    const bucket = request.headers.get("x-looply-bucket") || "";
    const path = request.headers.get("x-looply-path") || "";
    if (!safeObjectPath(path) || !["looply-avatars", "looply-gallery"].includes(bucket)) return json({ error: "invalid_object" }, 400, headers);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/storage/upload") && request.method === "PUT") {
      const mime = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const length = Number(request.headers.get("content-length") || 0);
      if (!length || !allowedFile(bucket, path, mime, length || 1, profileId)) return json({ error: "file_not_allowed" }, 400, headers);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length === 0 || bytes.length > (bucket === "looply-avatars" ? 10 : 25) * 1024 * 1024 || !allowedFile(bucket, path, mime, bytes.length, profileId)) return json({ error: "file_size_mismatch" }, 400, headers);
      await storage.send(new PutObjectCommand({ Bucket: bucket, Key: path, Body: bytes, ContentType: mime }));
      return json({ path }, 200, headers);
    }
    if (url.pathname.endsWith("/storage/remove") && request.method === "POST") {
      const owned = (bucket === "looply-avatars" && path.startsWith(`avatars/${profileId}/`)) || (bucket === "looply-gallery" && path.startsWith(`gallery/${profileId}/`));
      if (!owned) return json({ error: "forbidden" }, 403, headers);
      await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
      return json({ path }, 200, headers);
    }
    if (url.pathname.endsWith("/storage/sign") && request.method === "POST") {
      const checkUrl = bucket === "looply-avatars"
        ? process.env.NEON_DATA_API_URL + "/profiles?id=eq." + encodeURIComponent(profileId) + "&avatar_path=eq." + encodeURIComponent(path) + "&select=id&limit=1"
        : process.env.NEON_DATA_API_URL + "/community_gallery_media?storage_path=eq." + encodeURIComponent(path) + "&publication_state=eq.published&select=id,owner_id,visibility,private_owner_id&limit=1";
      const checkResponse = await fetch(checkUrl, { headers: { authorization: request.headers.get("authorization"), accept: "application/json" } });
      const mediaRows = checkResponse.ok ? await checkResponse.json() : [];
      const mediaRow = mediaRows?.[0];
      if (!mediaRow || (bucket === "looply-gallery" && !(mediaRow.owner_id === profileId || (mediaRow.private_owner_id == null && mediaRow.visibility === "members")))) return json({ error: "object_not_visible" }, 403, headers);
      const payload = await request.json().catch(() => ({}));
      const expiresIn = Math.max(60, Math.min(1800, Number(payload.expiresIn) || 1800));
      const signedUrl = await getSignedUrl(storage, new GetObjectCommand({ Bucket: bucket, Key: path }), { expiresIn });
      return json({ signedUrl }, 200, headers);
    }
    return json({ error: "not_found" }, 404, headers);
  }
};
