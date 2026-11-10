/* Looply's public app shell is cacheable; signed Neon URLs and private API
   responses are not. Serve the shell immediately and refresh in background. */
const CACHE = "looply-shell-v51-home-reels-engagement-20261110";
const STATIC = /\.(?:html|css|js|svg|png|jpg|jpeg|webp|woff2?)$/i;
const SHELL = [
  "home.html","chat.html","conversa.html","cartas.html",
  "musicas.html","galeria.html","notificacoes.html","perfil.html",
  "assets/css/app.css","assets/css/pages/shared.css",
  "reels.html","assets/css/pages/home-reels.css","src/home-reels-premium.js","src/home-reels-send.js"
];
const scopePath = new URL(self.registration.scope).pathname;
const cacheable = (request) => {
  if (request.method !== "GET" || request.cache === "no-store") return false;
  const url = new URL(request.url);
  // Nunca guardar interface ou módulo administrativo em cache offline.
  if (/\/(?:admin\.html|admin-model-live\.js|admin-model-extensions\.js|archive-import\.js|neon-production-login\.js)$/.test(url.pathname)) return false;
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
    const cached = await cache.match(event.request, { ignoreSearch: false });
    const url = new URL(event.request.url);
    const critical = event.request.mode === "navigate" || /\.(?:html|js|css)$/i.test(url.pathname);
    if (critical) {
      // SECURITY/FRESHNESS: returning an old JS module before revalidation can
      // keep old RPC allowlists active after the database and UI are migrated.
      // Always prefer the network for executable code and navigation; retain
      // the cached copy solely as an offline fallback.
      try {
        const response = await fetch(event.request, { cache: "no-cache" });
        if (response.ok) return store(cache,event.request,response);
        return cached || response;
      } catch {
        return cached || Response.error();
      }
    }
    if (cached) return cached;
    return fetch(event.request).then(response => store(cache,event.request,response))
      .catch(() => Response.error());
  }));
});
self.addEventListener("push", (event) => {
  let data = {}; try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || "" }; }
  const url = typeof data.url === "string" && /^(?:home|notificacoes|conversa|galeria|cartas|musicas)\.html(?:[?#].*)?$/.test(data.url) ? data.url : "notificacoes.html";
  event.waitUntil(self.registration.showNotification(String(data.title || "Looply").slice(0, 80), { body: String(data.body || "Nova atividade no Looply").slice(0, 180), data: { url } }));
});
self.addEventListener("notificationclick", (event) => { event.notification.close(); const url = event.notification.data?.url || "notificacoes.html"; event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((pages) => pages[0]?.focus().then(() => pages[0].navigate(url)) || clients.openWindow(url))); });

