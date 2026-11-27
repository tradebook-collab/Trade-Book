/* TradeBook PWA Service Worker - direct install + account OTP fix v15 */
const CACHE_NAME = "tradebook-pwa-v15";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=20261127-tradebook-pwa-delete-otp-v15",
  "./app.js?v=20261127-tradebook-pwa-delete-otp-v15",
  "./firebase-config.js?v=20261127-tradebook-pwa-delete-otp-v15",
  "./brevo-config.js?v=20261127-tradebook-pwa-delete-otp-v15",
  "./verify.html",
  "./manifest.json?v=20261127-tradebook-pwa-delete-otp-v15",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon-64.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isAppCode = /\/(app\.js|firebase-config\.js|brevo-config\.js|style\.css|index\.html)$/.test(path);
  if (isAppCode || request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
