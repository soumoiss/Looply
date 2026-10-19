export async function registerLooplyServiceWorker() {
  if (!globalThis.isSecureContext || !navigator.serviceWorker) return null;
  try { return await navigator.serviceWorker.register("sw.js", { scope: "./" }); } catch (error) { console.warn("Looply service worker unavailable", error); return null; }
}
