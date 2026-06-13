// Service worker — PWA: офлайн-кеш оболонки + останніх даних.
// Версію бампати разом з ?v= ассетів в index.html, щоб скинути старий кеш.
const CACHE = "tl-cache-20260613-clay7";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260613-clay7",
  "./config.js",
  "./src/app.js?v=20260613-clay7",
  "./src/league.js?v=20260613-clay7",
  "./assets/tennis-court-hero.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isData = url.hostname.includes("docs.google.com") || url.pathname.endsWith(".csv");

  // Навігація (HTML): мережа-перша, щоб сторінка не залипала; офлайн → кеш.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Дані (CSV матчів/розкладу): мережа-перша, офлайн → останній кеш.
  if (isData) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Оболонка застосунку: кеш-перший, потім мережа.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
