// Keeps the collection page usable without signal: the page and its scripts are saved on the phone.
// Reports typed offline are queued by the page itself (see lib/offline-queue.ts), not here.
const CACHE = "fap-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The collection and bus pages: network first, saved copy when offline. Only the plain page is saved (no "Sent" banner or error).
  if (req.mode === "navigate" && /^\/[cb]\/[a-f0-9]{32}\/?$/.test(url.pathname)) {
    const key = url.origin + url.pathname.replace(/\/$/, "");
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !url.search) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(key)) || new Response("You are offline and this page was not saved yet. Open the link once with signal.", { status: 503, headers: { "content-type": "text/plain" } })),
    );
    return;
  }

  // Scripts, styles and the logo never change for a given URL: saved copy first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/fap-logo.png") {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
