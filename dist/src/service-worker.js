// Keep web/APK users on the latest deployed JS while preserving offline fallback.
// Service worker files bypass the HTTP cache when checking for an update.
export async function registerLooplyServiceWorker() {
  if (!globalThis.isSecureContext || !navigator.serviceWorker) return null;
  try {
    const registration = await navigator.serviceWorker.register("sw.js", {
      scope: "./", updateViaCache: "none"
    });
    // Some Android WebViews keep the old controlled document alive long after
    // the new worker activates. On chat only, reload once if no unsent draft or
    // ongoing call is visible. Other pages keep their current editing state.
    if (!globalThis.__looplyServiceWorkerRefreshBound && navigator.serviceWorker.controller) {
      globalThis.__looplyServiceWorkerRefreshBound = true;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!document.body?.classList.contains("page-chat") || document.hidden) return;
        const draft = [...document.querySelectorAll(".chat-message-form textarea")]
          .some(element => element.value?.trim());
        const call = document.querySelector("[data-call-modal]:not([hidden]),.looply-global-call-notice:not([hidden]),[data-call-overlay]:not([hidden]),[data-call-panel]:not([hidden])");
        if (draft || call || document.querySelector("[data-looply-gartic]")) return;
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
