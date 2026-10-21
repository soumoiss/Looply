const CACHE = "looply-shell-v5";
const STATIC = /\.(?:html|css|js|svg|png|jpg|jpeg|webp|woff2?)$/i;
self.addEventListener("install", (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !STATIC.test(url.pathname) || url.pathname.includes("/supabase/")) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(event.request);
    const network = fetch(new Request(event.request, { cache: "no-cache" })).then((response) => { if (response.ok) cache.put(event.request, response.clone()); return response; }).catch(() => cached);
    return network || cached;
  }));
});
self.addEventListener("push", (event) => {
  let data = {}; try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || "" }; }
  const url = typeof data.url === "string" && /^(?:home|notificacoes|conversa|galeria|cartas|musicas)\.html(?:[?#].*)?$/.test(data.url) ? data.url : "notificacoes.html";
  event.waitUntil(self.registration.showNotification(String(data.title || "Looply").slice(0, 80), { body: String(data.body || "Nova atividade no Looply").slice(0, 180), data: { url } }));
});
self.addEventListener("notificationclick", (event) => { event.notification.close(); const url = event.notification.data?.url || "notificacoes.html"; event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((pages) => pages[0]?.focus().then(() => pages[0].navigate(url)) || clients.openWindow(url))); });

