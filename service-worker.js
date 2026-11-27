/* TradeBook PWA Service Worker - v78 */
const CACHE_NAME = "tradebook-pwa-fix-v14";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=20261127-tradebook-pwa-fix-v14",
  "./app.js?v=20261127-tradebook-pwa-fix-v14",
  "./firebase-config.js?v=20261127-tradebook-pwa-fix-v14",
  "./verify.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon-64.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (/\/(app\.js|firebase-config\.js|style\.css|index\.html)$/.test(path) || request.mode === "navigate") {
    event.respondWith(
      fetch(request, {cache: "no-store"}).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => caches.match(request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
