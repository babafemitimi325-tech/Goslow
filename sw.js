// Minimal service worker so the app can be installed. It never caches traffic data.
const SHELL = ["./index.html", "./app.js", "./styles.css", "./config.js", "./manifest.json"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("goslow-shell-1").then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // maps and traffic always come from the network
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
