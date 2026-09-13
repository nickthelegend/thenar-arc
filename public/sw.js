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
const VERSION = "thenar-shell-v3";

/**
 * What a navigation gets when the browser is online but this server did not
 * answer. The cached "No network" page is for a browser with no connection;
 * showing it here told people to fix a connection that was working.
 */
const SERVER_UNREACHABLE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Server did not answer — Thenar</title><body style="font:15px/1.6 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;color:#1b1b1b;background:#efefee"><h1 style="font-size:28px;line-height:1.15;margin:0 0 12px">Thenar's server did not answer</h1><p>Your connection is working, but this page could not be loaded from the server. Nothing you recorded is lost: a measured run stays in this browser until you submit it.</p><p><a href="" style="color:#2b50e0">Try again</a></p></body>`;
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

/**
 * A pushed notice.
 *
 * The payload is small and deliberately not trusted: whatever arrives is
 * rendered as text and nothing in it becomes a URL or markup. A notification
 * is the one place a service worker will happily render something it was
 * handed by the network.
 */
self.addEventListener("push", (e) => {
  let body = "Something you asked about happened.";
  let url = "/hub";
  try {
    const d = e.data ? e.data.json() : {};
    if (typeof d.body === "string") body = d.body.slice(0, 200);
    // Same-origin only. A pushed absolute URL is somebody else's page.
    if (typeof d.path === "string" && d.path.startsWith("/") && !d.path.startsWith("//")) url = d.path;
  } catch { /* keep the defaults */ }

  e.waitUntil(self.registration.showNotification("Thenar", {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/hub";
  e.waitUntil(clients.openWindow(url));
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
          if (self.navigator.onLine === false) {
            return (await caches.match("/offline")) ?? Response.error();
          }
          return new Response(SERVER_UNREACHABLE, {
            status: 503,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        return Response.error();
      }),
  );
});
