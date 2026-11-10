import { normalizeStorySong, searchAppleMusicPublic, searchSpotifyStoryMetadata } from "./story-music-catalog.js";
// Same authenticated Neon Functions host used by the official YouTube playlist API.
const neonFunctionsBase = "https://br-round-fog-b7pseu7j-looplystorage.compute.c-13.us-east-1.aws.neon.tech";

/**
 * A dedication refers to exactly one recording. Album/playlist URLs are
 * intentionally excluded, even if a provider's general embed supports them.
 */
export function dedicationTrackFromUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "open.spotify.com") {
      const idx = parts[0]?.startsWith("intl-") ? 1 : 0;
      if (parts.length !== idx + 2 || parts[idx] !== "track" || !/^[A-Za-z0-9]{22}$/.test(parts[idx + 1])) return null;
      return { provider: "spotify", id: parts[idx + 1], url: "https://open.spotify.com/track/" + parts[idx + 1] };
    }
    if (host === "music.apple.com" && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(parts[0] || "")) {
      let id = "";
      if (parts[1] === "song" && /^\d{5,18}$/.test(parts.at(-1) || "")) id = parts.at(-1);
      else if (parts[1] === "album" && /^\d{5,18}$/.test(url.searchParams.get("i") || "")) id = url.searchParams.get("i");
      if (id) return { provider: "apple", id, url: "https://music.apple.com/" + parts[0].toLowerCase() + "/song/" + id };
    }
  } catch { /* Reject any malformed or unsupported URL. */ }
  return null;
}

export function normalizeDedicationTrack(value) {
  const track = normalizeStorySong(value);
  if (!track || !["spotify", "apple"].includes(track.provider)) return null;
  const parsed = dedicationTrackFromUrl(track.url);
  if (!parsed || parsed.provider !== track.provider || (track.id && parsed.id !== track.id)) return null;
  return { ...track, id: parsed.id, url: parsed.url };
}

export async function searchDedicationProvider(value, provider, client, options = {}) {
  if (provider === "apple") {
    return (await searchAppleMusicPublic(value, options)).map(normalizeDedicationTrack).filter(Boolean);
  }
  if (provider === "spotify") {
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session?.access_token) throw Error("Sessão indisponível para buscar no Spotify.");
    return (await searchSpotifyStoryMetadata(value, {
      ...options,
      accessToken: data.session.access_token,
      endpoint: neonFunctionsBase
    })).map(normalizeDedicationTrack).filter(Boolean);
  }
  return [];
}
