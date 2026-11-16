/* Service worker (served at /sw.js). Makes the app installable and repeat visits fast.
   Only files under /static/ are cached; pages and API calls always go to the network, so
   nothing here can show stale schedule data. */
// ponytail: old ?v= copies are never evicted individually — bump this name to clear them all.
const CACHE = "ssies-static-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith("/static/")) return;
  // serve the cached copy at once and refresh it in the background
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request);
    const fresh = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || fresh;
  }));
});
