// PyMentor — Service Worker for offline + Pyodide cache
// Version bumps invalidate old caches
const CACHE_VERSION = "v1";
const APP_CACHE = `app-${CACHE_VERSION}`;
const PYODIDE_CACHE = `pyodide-${CACHE_VERSION}`;

// App shell — precache minimal; runtime caching handles the rest
const PRECACHE_URLS = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== PYODIDE_CACHE)
          .map((k) => caches.delete(k))
      ).then(() => self.clients.claim())
    )
  );
});

function isPyodideRequest(url) {
  return url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/pyodide/");
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image") || PRECACHE_URLS.includes(url.pathname);
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Pyodide CDN — CacheFirst, stale-while-revalidate, lazy-loaded only when workspace opens
  if (isPyodideRequest(url)) {
    event.respondWith(
      caches.open(PYODIDE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) {
          // Background update
          event.waitUntil(
            fetch(req)
              .then((res) => {
                if (res.ok) cache.put(req, res.clone());
              })
              .catch(() => {})
          );
          return cached;
        }
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          // Offline and not cached
          return new Response("Pyodide offline and not cached", { status: 504, statusText: "Gateway Timeout" });
        }
      })
    );
    return;
  }

  // Static assets — CacheFirst
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // API — NetworkFirst, fallback to offline JSON if fetch fails
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: "Offline — tutor unreachable, but you can still code and run tests." }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      })
    );
    return;
  }

  // Default — NetworkFirst with cache fallback for navigation
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache successful navigations
        if (res.ok && req.headers.get("accept")?.includes("text/html")) {
          const clone = res.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Offline fallback for navigations
        if (req.headers.get("accept")?.includes("text/html")) {
          const fallback = await caches.match("/");
          if (fallback) return fallback;
        }
        return new Response("Offline", { status: 503 });
      })
  );
});
