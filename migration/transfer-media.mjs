// Looply original -> Neon Object Storage (PRIVATE buckets).
// DRY RUN by default. Transfer only when MIGRATE_MEDIA=1 and all secrets are present.
// Needs: npm install --no-save @aws-sdk/client-s3@3.1156.0
import { createHash } from "node:crypto";

const SOURCE = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const EXECUTE = process.env.MIGRATE_MEDIA === "1";
const CONFIRM = process.env.MIGRATION_CONFIRM === "TRANSFER_WITH_CHECKSUMS";
const EXPECTED = Number(process.env.EXPECTED_MEDIA_COUNT || 277);
const BUCKETS = ["looply-announcements", "looply-avatars", "looply-chat",
  "looply-gallery", "looply-letters", "looply-media", "looply-secret-messages"];
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SOURCE) || !KEY)
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY via private environment secrets.");
if (EXECUTE && !CONFIRM)
  throw new Error("Set MIGRATION_CONFIRM=TRANSFER_WITH_CHECKSUMS to enable uploads.");
if (!Number.isSafeInteger(EXPECTED) || EXPECTED < 1)
  throw new Error("EXPECTED_MEDIA_COUNT must be a positive integer.");

const headers = { "apikey": KEY, "authorization": "Bearer " + KEY, "accept": "application/json" };
function encodePath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}
function failStatus(response, action) {
  throw new Error(action + " returned HTTP " + response.status +
    (response.status === 402 ? " (Supabase quota restriction blocks private media export)" : ""));
}
async function listFolder(bucket, prefix = "") {
  const objects = [];
  for (let offset = 0; ; offset += 100) {
    const response = await fetch(SOURCE + "/storage/v1/object/list/" + encodeURIComponent(bucket), {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) failStatus(response, "Storage listing");
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error("Unexpected storage listing response");
    for (const item of items) {
      if (typeof item.name !== "string" || !item.name || item.name === "." || item.name === "..") continue;
      const key = prefix + item.name;
      if (item.id == null) {
        const children = await listFolder(bucket, key + "/");
        objects.push(...children);
      } else {
        objects.push({ bucket, key, contentType: item.metadata?.mimetype || "application/octet-stream" });
      }
    }
    if (items.length < 100) break;
  }
  return objects;
}
async function enumerate() {
  let files = [];
  for (const bucket of BUCKETS) {
    const objects = await listFolder(bucket);
    files.push(...objects);
    process.stdout.write(JSON.stringify({ bucket, found: objects.length }) + "\n");
  }
  const ids = files.map(x => x.bucket + "/" + x.key);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate object keys detected.");
  if (files.length !== EXPECTED) {
    throw new Error("Inventory mismatch: expected " + EXPECTED + " objects but found " + files.length +
      ". Investigate changes before transferring anything.");
  }
  return files;
}

const files = await enumerate();
if (!EXECUTE) {
  process.stdout.write(JSON.stringify({ mode: "dry-run", total: files.length, uploads: 0 }) + "\n");
  process.exit(0);
}
const endpoint = String(process.env.AWS_ENDPOINT_URL_S3 || "");
const region = String(process.env.AWS_REGION || "us-east-1");
const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || "");
const secretAccessKey = String(process.env.AWS_SECRET_ACCESS_KEY || "");
if (!endpoint.startsWith("https://") || !endpoint.includes(".storage.") ||
    !accessKeyId || !secretAccessKey) {
  throw new Error("Neon S3 credentials are missing from protected environment secrets.");
}
const { S3Client, HeadObjectCommand, PutObjectCommand } = await import("@aws-sdk/client-s3");
const client = new S3Client({
  region, endpoint, forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  maxAttempts: 3
});
let uploaded = 0, skipped = 0, totalBytes = 0;
for (const file of files) {
  // Memory bound: prior inventory's largest file was about 16 MB.
  // Fetch one file at a time, never print its private key in CI logs.
  const response = await fetch(SOURCE + "/storage/v1/object/authenticated/" +
    encodeURIComponent(file.bucket) + "/" + encodePath(file.key), {
    method: "GET", headers, signal: AbortSignal.timeout(90000)
  });
  if (!response.ok) failStatus(response, "Private media download");
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  const metadata = { "source-sha256": digest, "source-bytes": String(bytes.length) };
  let existing;
  try { existing = await client.send(new HeadObjectCommand({ Bucket: file.bucket, Key: file.key })); }
  catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== "NotFound") throw error;
  }
  if (existing?.Metadata?.["source-sha256"] === digest &&
      Number(existing?.ContentLength) === bytes.length) {
    skipped += 1;
    continue;
  }
  await client.send(new PutObjectCommand({
    Bucket: file.bucket, Key: file.key, Body: bytes,
    ContentType: file.contentType, Metadata: metadata
  }));
  const check = await client.send(new HeadObjectCommand({ Bucket: file.bucket, Key: file.key }));
  if (check.Metadata?.["source-sha256"] !== digest || Number(check.ContentLength) !== bytes.length)
    throw new Error("Neon upload integrity check failed; stopped at object " + (uploaded + skipped + 1));
  uploaded += 1;
  totalBytes += bytes.length;
  if ((uploaded + skipped) % 20 === 0)
    process.stdout.write(JSON.stringify({ processed: uploaded + skipped, total: files.length }) + "\n");
}
process.stdout.write(JSON.stringify({
  mode: "copied", verified: uploaded + skipped, uploaded, skipped, bytes_uploaded: totalBytes
}) + "\n");
