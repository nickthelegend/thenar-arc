/**
 * The offline shell, and nothing more.
 *
 * A service worker on a site whose whole claim is that its figures are live is
 * a hazard, not a feature: the usual cache-first worker would happily serve
 * yesterday's escrow, yesterday's leaderboard, and a payout figure that is no
 * longer true, with no way for the reader to tell. So this one is
 * network-first everywhere and never caches an API response at all. The cache
 * exists for one case — the network is gone — and in that case the app opens
 * and says so rather than showing the browser's error page.
 *
 * Bumping VERSION drops every previous cache on activate. A stale shell is the
 * failure mode worth being paranoid about.
 */
const VERSION = "thenar-shell-v1";
const SHELL = ["/", "/hub", "/offline"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never the API. Every figure this app shows comes from here, and a cached
  // one is a figure that was true once — which on this site is the same as a
  // wrong one.
  if (url.pathname.startsWith("/api/")) return;

  e.respondWith(
    fetch(request)
      .then((res) => {
        // Only documents and static assets, and only when the network agreed.
        if (res.ok && (request.mode === "navigate" || /\.(css|js|woff2?|png|svg|glb)$/.test(url.pathname))) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        if (request.mode === "navigate") {
          return (await caches.match("/offline")) ?? Response.error();
        }
        return Response.error();
      }),
  );
});
