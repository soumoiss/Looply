/* Looply's public app shell is cacheable; signed Neon URLs and private API
   responses are not. Serve the shell immediately and refresh in background. */
const CACHE = "looply-shell-v8";
const STATIC = /\.(?:html|css|js|svg|png|jpg|jpeg|webp|woff2?)$/i;
const SHELL = [
  "home.html","chat.html","conversa.html","cartas.html",
  "musicas.html","galeria.html","notificacoes.html","perfil.html",
  "assets/css/app.css","assets/css/pages/shared.css"
];
const scopePath = new URL(self.registration.scope).pathname;
const cacheable = (request) => {
  if (request.method !== "GET" || request.cache === "no-store") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin &&
    url.pathname.startsWith(scopePath) &&
    STATIC.test(url.pathname) &&
    !url.pathname.includes("/supabase/") &&
    !url.pathname.includes("/api/") &&
    !url.pathname.endsWith("/sw.js");
};
const store = async (cache, request, response) => {
  if (response?.ok && response.type === "basic" &&
      !/\b(?:private|no-store)\b/i.test(response.headers.get("cache-control") || "")) {
    await cache.put(request, response.clone());
  }
  return response;
};
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    Promise.allSettled(SHELL.map(url => cache.add(url)))
  ).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => (key.startsWith("looply-shell-") || key.startsWith("looply-pages-")) && key !== CACHE)
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (!cacheable(event.request)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request, { ignoreSearch: true });
    // Fast page transitions/offline fallback while the browser validates the
    // static file in the background. Never cache signed cross-origin media.
    if (cached) {
      // Shell assets are tied to a content-hashed worker build. Re-fetching
      // every module on every route would consume slow mobile bandwidth.
      // Only HTML documents need opportunistic background revalidation.
      const url = new URL(event.request.url);
      if (event.request.mode === "navigate" || url.pathname.endsWith(".html")) {
        event.waitUntil(fetch(event.request).then(response => store(cache, event.request, response))
          .catch(() => null));
      }
      return cached;
    }
    return fetch(event.request).then(response => store(cache, event.request, response))
      .catch(() => cached || Response.error());
  }));
});
self.addEventListener("push", (event) => {
  let data = {}; try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || "" }; }
  const url = typeof data.url === "string" && /^(?:home|notificacoes|conversa|galeria|cartas|musicas)\.html(?:[?#].*)?$/.test(data.url) ? data.url : "notificacoes.html";
  event.waitUntil(self.registration.showNotification(String(data.title || "Looply").slice(0, 80), { body: String(data.body || "Nova atividade no Looply").slice(0, 180), data: { url } }));
});
self.addEventListener("notificationclick", (event) => { event.notification.close(); const url = event.notification.data?.url || "notificacoes.html"; event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((pages) => pages[0]?.focus().then(() => pages[0].navigate(url)) || clients.openWindow(url))); });

