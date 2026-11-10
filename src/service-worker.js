// Keep web/APK users on the latest deployed JS while preserving offline fallback.
// Service worker files bypass the HTTP cache when checking for an update.
export async function registerLooplyServiceWorker() {
  if (!globalThis.isSecureContext || !navigator.serviceWorker) return null;
  try {
    const registration = await navigator.serviceWorker.register("sw.js", {
      scope: "./", updateViaCache: "none"
    });
    // Android WebViews can keep old controlled documents after a new worker activates.
    // Chat and Music may refresh once, but never destroy a draft, active call or player.
    if (!globalThis.__looplyServiceWorkerRefreshBound && navigator.serviceWorker.controller) {
      globalThis.__looplyServiceWorkerRefreshBound = true;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (document.hidden) return;
        const chatPage = document.body?.classList.contains("page-chat");
        const musicPage = document.body?.classList.contains("page-music");
        if (!chatPage && !musicPage) return;
        if (musicPage) {
          const editing = document.querySelector(".music-composer[open],.music-general-comments[open],.music-dedication-edit-dialog[open],.music-picker-backdrop:not([hidden])");
          const draft = [...document.querySelectorAll(".music-library-form input,.music-library-form textarea,.music-comment-form textarea")]
            .some(field => String(field.value || "").trim());
          const playing = [...document.querySelectorAll("audio")].some(audio => !audio.paused);
          if (editing || draft || playing) return;
        }
        if (chatPage) {
          const draft = [...document.querySelectorAll(".chat-message-form textarea")]
            .some(element => element.value?.trim());
          const call = document.querySelector("[data-call-modal]:not([hidden]),.looply-global-call-notice:not([hidden]),[data-call-overlay]:not([hidden]),[data-call-panel]:not([hidden])");
          if (draft || call || document.querySelector("[data-looply-gartic]")) return;
        }
        const now = Date.now();
        const last = Number(sessionStorage.getItem("looply-sw-last-refresh") || 0);
        if (now - last < 30000) return;
        sessionStorage.setItem("looply-sw-last-refresh", String(now));
        window.location.reload();
      });
    }
    if (navigator.onLine) void registration.update().catch(() => null);
    return registration;
  } catch (error) {
    console.warn("Looply service worker unavailable", error);
    return null;
  }
}
