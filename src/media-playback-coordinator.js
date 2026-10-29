const priorities = Object.freeze({ feed: 10, music: 30, reel: 40, story: 60, call: 100 });
let active = null;
let callActive = false;

function pause(media) {
  try { if (media && !media.paused) media.pause(); } catch {}
}

export function requestMediaPlayback(scope, owner, media) {
  const priority = priorities[scope] || 0;
  if (!owner || !media || (callActive && scope !== "call")) return false;
  if (active && active.owner !== owner) {
    if (active.priority > priority) return false;
    active.media.forEach(pause);
    active = null;
  }
  if (!active) active = { scope, owner, priority, media: new Set() };
  active.media.add(media);
  return true;
}

export function releaseMediaPlayback(owner, media) {
  if (!active || active.owner !== owner) return;
  if (media) active.media.delete(media);
  else active.media.forEach(pause);
  if (!media || active.media.size === 0) active = null;
}

export function setCallPlaybackActive(value) {
  callActive = Boolean(value);
  if (callActive && active?.scope !== "call") {
    active.media.forEach(pause);
    active = null;
  }
}

export function pauseCoordinatedPlayback() {
  active?.media.forEach(pause);
}

export function playbackCoordinatorState() {
  return { scope: active?.scope || "", mediaCount: active?.media.size || 0, callActive };
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", pauseCoordinatedPlayback);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseCoordinatedPlayback();
  });
}
