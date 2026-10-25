// Reuse private Storage URLs within a single tab while the token is valid.
// A new token on each page visit causes avoidable cache misses and extra egress.
// Each cache entry is isolated by the authenticated user and bucket.
const PREFIX = "looply:signed-urls:v1:";
const SAFETY_MARGIN_MS = 90_000;

function safeStorage() {
  try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; }
  catch { return null; }
}

async function cachePrefix(client) {
  try {
    const { data } = await client.auth.getSession();
    const uid = data?.session?.user?.id;
    return uid ? PREFIX + uid + ":" : "";
  } catch {
    return "";
  }
}

function keyFor(prefix, bucket, path, options) {
  return prefix + JSON.stringify([bucket, path, options || null]);
}

function cachedEntry(storage, key) {
  try {
    const value = storage && JSON.parse(storage.getItem(key) || "null");
    if (typeof value?.url === "string" && /^https:\/\//.test(value.url) && value.expiresAt > Date.now()) {
      return value.url;
    }
    storage?.removeItem(key);
  } catch {}
  return "";
}

function saveEntry(storage, key, url, expiresIn) {
  if (!storage || !key || typeof url !== "string" || !url.startsWith("https://")) return;
  // Never cache beyond the original signed token's remaining validity.
  const ttl = Math.max(0, expiresIn * 1000 - SAFETY_MARGIN_MS);
  if (!ttl) return;
  try { storage.setItem(key, JSON.stringify({ url, expiresAt: Date.now() + ttl })); }
  catch { /* Quota or privacy-mode storage restrictions: use the fresh URL. */ }
}

export async function cachedSignedUrl(client, bucket, path, expiresIn = 1800, options) {
  if (!path) return { data: null, error: new Error("missing_storage_path") };
  const prefix = await cachePrefix(client);
  const storage = prefix && safeStorage();
  const key = storage ? keyFor(prefix, bucket, path, options) : "";
  const reused = key && cachedEntry(storage, key);
  if (reused) return { data: { signedUrl: reused }, error: null };
  const response = await client.storage.from(bucket).createSignedUrl(path, expiresIn, options);
  if (!response.error && response.data?.signedUrl) {
    saveEntry(storage, key, response.data.signedUrl, expiresIn);
  }
  return response;
}

export async function cachedSignedUrls(client, bucket, paths, expiresIn = 1800) {
  if (!Array.isArray(paths)) throw new TypeError("paths must be an array");
  if (!paths.length) return { data: [], error: null };
  const prefix = await cachePrefix(client);
  const storage = prefix && safeStorage();
  if (!storage) return client.storage.from(bucket).createSignedUrls(paths, expiresIn);
  const resolved = new Array(paths.length);
  const missingPaths = [];
  const missingIndexes = [];
  paths.forEach((path, index) => {
    const key = keyFor(prefix, bucket, path);
    const reused = cachedEntry(storage, key);
    if (reused) resolved[index] = { signedUrl: reused, path };
    else { missingPaths.push(path); missingIndexes.push(index); }
  });
  if (!missingPaths.length) return { data: resolved, error: null };
  const { data, error } = await client.storage.from(bucket).createSignedUrls(missingPaths, expiresIn);
  if (error) return { data: null, error };
  missingIndexes.forEach((originalIndex, index) => {
    const value = data?.[index] || { path: missingPaths[index], signedUrl: null };
    resolved[originalIndex] = value;
    if (value.signedUrl) {
      saveEntry(storage, keyFor(prefix, bucket, missingPaths[index]), value.signedUrl, expiresIn);
    }
  });
  return { data: resolved, error: null };
}
