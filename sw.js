importScripts("./sw-version.js");

const CACHE = typeof SW_CACHE === "string" ? SW_CACHE : "lc-shell-dev";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js") || url.pathname.endsWith("/sw-version.js")) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      } catch {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw new Error("offline");
      }
    })
  );
});
