// Offline support. The app's code and the price data are fetched fresh when online (network first) and
// kept for offline use, so the shopping checklist works in a store with no signal.
// Text recognition and icons are cache first.
const VERSION = "kc-basket-v1";
const SHELL = ["./", "index.html", "app.css?v=1", "js/app.js?v=1", "js/state.js", "js/core.js", "js/ui.js", "js/views.js", "js/sheets.js", "js/plan.js",
  "js/units.js", "js/dict.js", "js/match.js", "js/recipe.js", "js/receipt.js", "js/gh.js", "manifest.webmanifest"];
const STATIC = ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.concat(STATIC).map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== "kcb-fresh").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (/\/(ocr|icons)\//.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: url.pathname.endsWith(".json") }).then(hit => hit || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
