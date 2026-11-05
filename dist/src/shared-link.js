// Receives links shared from external apps and carries them across the splash/login redirects.
// Only known HTTPS social/video providers are accepted; sharing never publishes automatically.
const STORAGE_KEY = "looply:pending-external-share";
const ALLOWED_HOSTS = new Set([
  "instagram.com", "www.instagram.com", "m.instagram.com",
  "tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"
]);

function cleanUrlCandidate(value) {
  let candidate = String(value || "").trim();
  candidate = candidate.replace(/[.,!?;:]+$/g, "");
  while (candidate.endsWith(")") && (candidate.match(/\(/g) || []).length < (candidate.match(/\)/g) || []).length) candidate = candidate.slice(0, -1);
  while (candidate.endsWith("]") && (candidate.match(/\[/g) || []).length < (candidate.match(/\]/g) || []).length) candidate = candidate.slice(0, -1);
  return candidate;
}

function urlsFromText(value) {
  let text = String(value || "").trim();
  // Some share targets wrap an already encoded URL more than once.
  for (let i = 0; i < 2 && !/https?:\/\//i.test(text) && /%3a%2f%2f/i.test(text); i++) {
    try { text = decodeURIComponent(text); } catch { break; }
  }
  return (text.match(/https?:\/\/[^\s<>"'\u0060]+/gi) || []).map(cleanUrlCandidate).filter(Boolean);
}

export function normalizeSharedExternalUrl(value) {
  let parsed;
  try { parsed = new URL(cleanUrlCandidate(value)); } catch { return null; }
  if (parsed.protocol !== "https:") return null;

  // Instagram's outbound share redirect uses ?u=<destination>. Keep only the destination.
  if (parsed.hostname.toLowerCase() === "l.instagram.com") {
    try { parsed = new URL(parsed.searchParams.get("u") || ""); } catch { return null; }
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(host)) return null;
  return parsed.href;
}

export function parseIncomingSharedLink(href) {
  let current;
  try { current = new URL(String(href), "https://soumoiss.github.io/Looply/"); } catch { return null; }

  const query = new URLSearchParams(current.search);
  const rawHash = current.hash.slice(1).replace(/^\?/, "");
  const hashParams = new URLSearchParams(rawHash);
  const keys = ["share_url", "url", "link", "text", "title"];
  const candidates = [];
  for (const params of [query, hashParams]) {
    for (const key of keys) {
      const value = params.get(key);
      if (value) candidates.push(...urlsFromText(value));
    }
  }
  // Also accept a bare URL supplied as the hash, while ignoring ordinary in-page anchors.
  if (/^https?:\/\//i.test(rawHash)) candidates.push(...urlsFromText(rawHash));

  for (const candidate of candidates) {
    const normalized = normalizeSharedExternalUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export function captureIncomingSharedLink(href = window.location.href, storage = window.sessionStorage) {
  const link = parseIncomingSharedLink(href);
  if (!link) return null;
  try { storage.setItem(STORAGE_KEY, link); } catch (error) {
    console.warn("Looply could not retain the shared link during navigation", error);
  }
  return link;
}

export function takeIncomingSharedLink(storage = window.sessionStorage) {
  try {
    const value = storage.getItem(STORAGE_KEY);
    storage.removeItem(STORAGE_KEY);
    return value ? normalizeSharedExternalUrl(value) : null;
  } catch (error) {
    console.warn("Looply could not restore the shared link", error);
    return null;
  }
}
