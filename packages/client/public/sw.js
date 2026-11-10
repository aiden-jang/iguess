// Minimal service worker: enough for installability and an offline app shell.
// The realtime game WebSocket lives under /rooms/*, so that traffic always
// goes to the network and is never cached.

// Bump this when the shell or cache rules change; activation removes only older iguess caches.
const CACHE = "iguess-v11";
const SHELL = "/";

async function cacheShell(response) {
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    throw new Error("The app shell is unavailable");
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
    ([, url]) => url,
  );
  const cache = await caches.open(CACHE);
  await Promise.all(
    assets.map(async (url) => {
      if (!(await cache.match(url))) await cache.add(url);
    }),
  );
  await cache.put(SHELL, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch(SHELL, { cache: "reload" })
      .then(cacheShell)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("iguess-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.cache === "no-store") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache realtime traffic.
  if (
    url.pathname.startsWith("/rooms") ||
    ["/play-status", "/health"].includes(url.pathname)
  )
    return;
  if (request.method !== "GET") return;

  // Navigations use the network first. Only the successful public homepage refreshes the shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (
            url.pathname === "/" &&
            !url.search &&
            res.ok &&
            res.headers.get("content-type")?.includes("text/html")
          ) {
            const copy = res.clone();
            event.waitUntil(cacheShell(copy).catch(() => {}));
          }
          return res;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  // Static assets: cache first, fill the cache on miss.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (
            res.ok &&
            res.type === "basic" &&
            !res.headers.get("content-type")?.includes("text/html")
          ) {
            const copy = res.clone();
            event.waitUntil(
              caches.open(CACHE).then((c) => c.put(request, copy)),
            );
          }
          return res;
        }),
    ),
  );
});
