// Offline support. The app's code and the price data are fetched fresh when online (network first) and
// kept for offline use, so the shopping checklist works in a store with no signal.
// Text recognition and icons are cache first.
const VERSION = "kc-basket-v3";
const IMG = "kcb-img";
const SHELL = ["./", "index.html", "app.css?v=3", "js/app.js?v=3", "js/state.js", "js/core.js", "js/ui.js", "js/views.js", "js/sheets.js", "js/plan.js",
  "js/units.js", "js/dict.js", "js/match.js", "js/recipe.js", "js/receipt.js", "js/gh.js", "js/translate.js", "js/deals.js", "js/dealsview.js", "js/alerts-ui.js", "manifest.webmanifest"];
const STATIC = ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.concat(STATIC).map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== "kcb-fresh" && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Tesco product photos: kept on the phone so the shopping list still shows them without signal
  if (e.request.method === "GET" && url.hostname === "digitalcontent.api.tesco.com") {
    e.respondWith(caches.open(IMG).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok || res.type === "opaque") { c.put(e.request, res.clone()); trim(c); }
      return res;
    }))));
    return;
  }
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

let trimming = false;
function trim(c) {
  if (trimming) return; trimming = true;
  c.keys().then(keys => Promise.all(keys.slice(0, Math.max(0, keys.length - 200)).map(k => c.delete(k)))).finally(() => { trimming = false; });
}

// Sale alerts sent by the morning job
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  const shown = self.registration.showNotification(d.title || "Kč Basket", {
    body: d.body || "Your items are on offer.", icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    tag: d.tag || "kcb-deals", data: { url: d.url || "./#deals" },
  });
  const badge = d.count && self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge(d.count).catch(() => {}) : Promise.resolve();
  e.waitUntil(Promise.all([shown, badge]));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./#deals", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { if ("navigate" in c) c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
