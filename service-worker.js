const CACHE_NAME = "qr-platinum-pwa-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./companies.html",
  "./generator.html",
  "./license.html",
  "./admin.html",
  "./reset-password.html",
  "./style.css",
  "./app.js",
  "./pwa-register.js",
  "./manifest.json",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./logo-gold.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // API a autentifikované požiadavky nikdy neukladáme do cache.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    request.headers.has("Authorization")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (
        await caches.match(request, { ignoreSearch: true }) ||
        await caches.match("./index.html")
      ))
    );
    return;
  }

  const staticDestinations = new Set(["script", "style", "image", "manifest", "font"]);
  if (!staticDestinations.has(request.destination)) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(async (cached) => {
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && response.type === "basic" && !url.search) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })
  );
});
