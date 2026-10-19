export async function createThumbnailUrl(storage, bucket, path, { width = 640, height = 640, quality = 70 } = {}) {
  if (!storage || !path) return null;
  try {
    const transformed = await storage.from(bucket).createSignedUrl(path, 1800, { transform: { width, height, quality, resize: "contain" } });
    if (!transformed.error && transformed.data?.signedUrl) return transformed.data.signedUrl;
  } catch {}
  try { const fallback = await storage.from(bucket).createSignedUrl(path, 1800); return fallback.error ? null : fallback.data?.signedUrl || null; } catch { return null; }
}
export async function createOriginalUrl(storage, bucket, path) {
  if (!storage || !path) return null;
  const result = await storage.from(bucket).createSignedUrl(path, 1800);
  return result.error ? null : result.data?.signedUrl || null;
}
