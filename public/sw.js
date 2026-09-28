// Physio Trainer service worker (docs/specs/18-pwa.md).
// Its only job: show /offline when a page can't load. It never caches pages, API responses or
// Supabase calls, so no stale or cross-user data can come from here.
// Registered as /sw.js?v=<build id>: every deploy installs a new worker with a new cache.
// Kill switch: replace this file with one that deletes its caches and calls
// self.registration.unregister().

const CACHE_PREFIX = "physio-trainer-";
const CACHE = CACHE_PREFIX + (new URL(self.location.href).searchParams.get("v") || "dev");
const OFFLINE_URL = "/offline";
const STATIC_PREFIX = "/_next/static/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch(OFFLINE_URL, { cache: "reload" });
      if (!response.ok) throw new Error(`${OFFLINE_URL} returned ${response.status}`);
      const html = await response.clone().text();
      await cache.put(OFFLINE_URL, response);
      // The offline page needs its CSS, JS and fonts when there is no network. Best effort: a
      // missing asset degrades the page's look, it must not stop the worker installing.
      // (Backslashes: the RSC payload inlines these URLs inside escaped JSON strings.)
      const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\<>,;]+/g) || []);
      await Promise.allSettled([...assets].map((asset) => cache.add(asset)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Network only; HTTP errors pass through, only a failed connection shows /offline.
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match(OFFLINE_URL, { cacheName: CACHE });
        return offline || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith(STATIC_PREFIX)) {
    // Hashed, immutable, public build assets.
    event.respondWith(
      caches.match(request, { cacheName: CACHE }).then((cached) => cached || fetch(request)),
    );
  }
});
