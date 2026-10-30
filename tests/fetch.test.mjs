import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseTescoHtml, fromNode } from "../fetch/tesco.mjs";
import { parseKupi } from "../fetch/kupi.mjs";
import { extractRecipe } from "../fetch/recipe-url.mjs";

const fx = n => readFile(new URL("./fixtures/" + n, import.meta.url), "utf8");

test("Tesco tiles", async () => {
  const ps = parseTescoHtml(await fx("tesco-tiles.html"));
  const by = Object.fromEntries(ps.map(p => [p.id, p]));
  assert.equal(ps.length, 5);
  assert.deepEqual([by["2001018475"].t, by["2001018475"].p, by["2001018475"].u, by["2001018475"].per], ["Tesco Máslo 82% tuku 250g", 27.9, 111.6, "kg"]);
  assert.deepEqual(by["2001018475"].pk, { v: 250, u: "g" });
  assert.equal(by["2001019999"].p, 99.9); assert.equal(by["2001019999"].cc, 59.9); assert.equal(by["2001019999"].ccUntil, "2026-11-03");
  assert.equal(by["2001022222"].p, 11.9); assert.equal(by["2001022222"].promo, "3 za 23,80 Kč");
  assert.equal(by["2001033333"].loose, true);
  assert.equal(by["2001044444"].avail, false);
  assert.equal(by["2001018475"].i, "ccc-333/ddd-444_555.jpeg");
});

test("Tesco embedded JSON", async () => {
  const ps = parseTescoHtml(await fx("tesco-json.html"));
  assert.equal(ps.length, 2);
  assert.equal(ps[0].p, 54.9); assert.equal(ps[0].cc, 44.9); assert.equal(ps[0].ccUntil, "2026-10-27"); assert.equal(ps[0].u, 219.6);
  assert.equal(ps[1].t, "Kuřecí prsní řízky 500g");
  assert.equal(ps[0].i, "aaa-111/bbb-222_123.jpeg");
  assert.equal(fromNode({ tpnc: "1", title: "x", sellers: { results: [{ price: { actual: 0 } }] } }), null);
});

test("kupi.cz page", async () => {
  const ds = parseKupi(await fx("kupi-lidl.html"), "lidl", "ovoce-a-zelenina", new Date(2026, 9, 16));
  assert.equal(ds.length, 4, JSON.stringify(ds));
  const [cherry, pot, chicken, cola] = ds;
  assert.deepEqual([cherry.n, cherry.p, cherry.pk, cherry.u, cherry.d, cherry.until], ["Rajčata cherry", 39.9, { v: 250, u: "g" }, { p: 159.6, per: "kg" }, 33, "2026-10-18"]);
  assert.equal(pot.app, true); assert.deepEqual(pot.pk, { v: 10000, u: "g" }); assert.equal(pot.u.p, 8.99);
  assert.equal(chicken.from, "2026-10-22"); assert.equal(chicken.until, "2026-10-25");
  assert.equal(cola.f, "Lidl"); assert.deepEqual(cola.pk, { v: 1980, u: "ml", n: 6 }); assert.equal(cola.u.p, 45.4);
  const albert = parseKupi(await fx("kupi-lidl.html"), "albert", "nealko-napoje", new Date(2026, 9, 16));
  assert.equal(albert.length, 1); assert.equal(albert[0].f, "Albert hypermarket"); assert.deepEqual(albert[0].pk, { v: 6000, u: "ml", n: 4 });
});

test("recipe page", async () => {
  const r = extractRecipe(await fx("recipe.html"));
  assert.equal(r.ok, true); assert.equal(r.title, "Easy chicken curry"); assert.equal(r.servings, 4); assert.equal(r.lines.length, 7);
});

test("whole fetch job against a fake network", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kcb-"));
  const run = promisify(execFile);
  const env = { ...process.env, DATA_DIR: dir, FAST: "1", STORES: "lidl,albert", RECIPE_URL: "https://example.com/curry", DEEPL_KEY: "test-key:fx", FIXTURES: new URL("./fixtures/", import.meta.url).pathname };
  const { stdout } = await run(process.execPath, ["--import", new URL("./fake-net.mjs", import.meta.url).pathname, new URL("../fetch/fetch.mjs", import.meta.url).pathname], { env, timeout: 120000 });
  const status = JSON.parse(await readFile(join(dir, "status.json"), "utf8"));
  assert.equal(status.tesco.method, "html", stdout);
  assert.ok(status.tesco.searched > 100, "searched " + status.tesco.searched);
  const tesco = JSON.parse(await readFile(join(dir, "tesco.json"), "utf8"));
  assert.ok(tesco.products["2001018475"]); assert.ok(tesco.queries["máslo"].includes("2001018475"));
  const deals = JSON.parse(await readFile(join(dir, "deals.json"), "utf8"));
  assert.ok(deals.deals.some(d => d.s === "lidl" && d.n === "Rajčata cherry" && d.l === "/sleva/rajcata-cherry" && /^\d{4}-\d\d-\d\d$/.test(d.fs)));
  assert.ok(deals.deals.some(d => d.s === "albert"));
  const hist = JSON.parse(await readFile(join(dir, "history.json"), "utf8"));
  assert.ok(hist.items.butter.s.tesco.length === 1, JSON.stringify(hist.items.butter));
  const imp = await readdir(join(dir, "imports"));
  assert.equal(imp.length, 1);
  const rec = JSON.parse(await readFile(join(dir, "imports", imp[0]), "utf8"));
  assert.equal(rec.lines.length, 7);
  const tr = JSON.parse(await readFile(join(dir, "translations.json"), "utf8"));
  assert.equal(tr["Rajčata cherry"], "EN Rajčata cherry");
  assert.equal(tr["Tesco Máslo 82% tuku 250g"], "EN Tesco Máslo 82% tuku 250g");
  assert.equal(status.translate.method, "deepl"); assert.ok(status.translate.added > 5);
  const usual = JSON.parse(await readFile(join(dir, "usual.json"), "utf8"));
  assert.equal(usual.items["/sleva/rajcata-cherry"].p, 49.9);
  assert.ok(status.usual.ok && status.usual.found >= 1, JSON.stringify(status.usual));
});

import { runAlerts } from "../fetch/alerts.mjs";
test("sale alerts are sent once per deal", async () => {
  const tesco = { products: { "2": { t: "Jacobs Krönung mletá káva 250g", p: 129.9, pk: { v: 250, u: "g" }, cc: 99.9, ccUntil: "2026-10-25" } } };
  const deals = { deals: [{ s: "lidl", f: "Lidl", n: "Máslo", p: 39.9, pk: { v: 250, u: "g" }, d: 27, until: "2026-10-18" }, { s: "albert", n: "Nutella", p: 89.9, d: 20 }] };
  const cfg = JSON.stringify({ publicKey: "pub", privateKey: "priv", subject: "https://example.github.io/Basket/", subscription: { endpoint: "https://push.example/abc", keys: { p256dh: "x", auth: "y" } } });
  const alerts = { items: [{ id: "butter" }, { id: "coffee" }], words: ["nutella"], stores: ["tesco", "albert", "lidl"], loyalty: {} };
  const got = []; const send = async (sub, payload, opts) => { got.push({ sub, payload: JSON.parse(payload), opts }); };
  const sent = {};
  const r1 = await runAlerts({ configText: cfg, alerts, sent, tesco, deals, history: {}, today: "2026-10-16", send });
  assert.equal(r1.ok, true); assert.equal(r1.sent, 1); assert.equal(got.length, 1);
  assert.equal(got[0].payload.title, "3 of your items are on offer");
  assert.match(got[0].payload.body, /Butter — Lidl 39,90/); assert.match(got[0].payload.body, /Coffee — Tesco online 99,90/); assert.match(got[0].payload.body, /Nutella/);
  assert.equal(got[0].opts.vapidDetails.privateKey, "priv");
  const r2 = await runAlerts({ configText: cfg, alerts, sent, tesco, deals, history: {}, today: "2026-10-17", send });
  assert.equal(r2.sent, 0, "nothing new the next day"); assert.equal(got.length, 1);
  const gone = async () => { const e = new Error("gone"); e.statusCode = 410; throw e; };
  const r3 = await runAlerts({ configText: cfg, alerts, sent: {}, tesco, deals, history: {}, today: "2026-10-16", send: gone });
  assert.equal(r3.ok, false); assert.match(r3.error, /expired/);
  const t = await runAlerts({ configText: cfg, alerts: null, sent: {}, tesco, deals, history: {}, today: "2026-10-16", send, test: true });
  assert.equal(t.sent, 1); assert.match(got[1].payload.body, /working/);
  const bad = await runAlerts({ configText: "nope", alerts, sent: {}, tesco, deals, history: {}, today: "2026-10-16", send });
  assert.equal(bad.ok, false);
});

import { parseProductPage, packOf, fetchUsual } from "../fetch/usual.mjs";
import { analyser as mkAnalyser, usualLookup } from "../js/deals.js";
import { buildIndex as bIdx } from "../js/plan.js";
test("kupi.cz usual prices from product pages", async () => {
  assert.equal(parseProductPage(await fx("kupi-product.html")), 49.9, "0 Kč label is skipped, the description's price is used");
  assert.equal(parseProductPage("<p>Běžná cena: <b>235,38 Kč</b></p>"), 235.38);
  assert.equal(parseProductPage("<p>Nic</p>"), null);
  const deals = [
    { s: "albert", n: "Instantní káva Jacobs Velvet", p: 129.9, pk: { v: 200, u: "g" }, d: 43, l: "/sleva/velvet" },
    { s: "penny", n: "Instantní káva Jacobs Velvet", p: 139.9, pk: { v: 200, u: "g" }, l: "/sleva/velvet" },
    { s: "albert", n: "Mletá káva Jihlavanka", p: 189, pk: { v: 1000, u: "g" }, d: 52, l: "/sleva/jihl" },
    { s: "billa", n: "Mletá káva Jihlavanka", p: 64.9, pk: { v: 150, u: "g" }, l: "/sleva/jihl" },
    { s: "kaufland", n: "Nutella", p: 99.9, pk: { v: 600, u: "g" }, d: 10, l: "/sleva/nutella" },
    { s: "lidl", n: "Máslo", p: 39.9, pk: { v: 250, u: "g" }, d: 20, l: "/sleva/maslo" },
  ];
  assert.deepEqual(packOf("/sleva/velvet", deals), { v: 200, u: "g" }); assert.equal(packOf("/sleva/jihl", deals), null);
  const asked = [];
  const pages = { "/sleva/velvet": "Běžná cena: 235,38 Kč", "/sleva/jihl": "běžně stojí 105,81 Kč", "/sleva/nutella": "Běžná cena 129,90 Kč", "/sleva/maslo": "nic" };
  const fetchImpl = async url => { const l = new URL(url).pathname; asked.push(l); return { ok: true, status: 200, text: async () => pages[l] }; };
  const r = await fetchUsual(deals, { fetchImpl, today: "2026-10-30", alerts: { items: [], words: ["nutella"] }, budget: 3 });
  assert.equal(asked[0], "/sleva/nutella", "watch words first"); assert.equal(asked.length, 3, "budget respected");
  assert.equal(r.items["/sleva/velvet"].p, 235.38); assert.equal(r.items["/sleva/jihl"].none, 1, "several sizes: not usable");
  const again = await fetchUsual(deals, { fetchImpl, today: "2026-11-02", prev: { items: r.items }, budget: 10 });
  assert.deepEqual(asked.slice(3), ["/sleva/maslo"], "fresh pages aren't read again");
  assert.equal(again.items["/sleva/maslo"].none, 1);
  let calls = 0; const refused = async () => { calls++; return { ok: false, status: 403, text: async () => "" }; };
  const many = Array.from({ length: 20 }, (_, i) => ({ s: "lidl", n: "x" + i, p: 1, pk: { v: 1, u: "ks" }, l: "/sleva/x" + i }));
  const blocked = await fetchUsual(many, { fetchImpl: refused, today: "2026-10-30" });
  assert.equal(calls, 6, "stops after 6 refusals"); assert.equal(blocked.ok, 0);
  // the app matches deals to usual prices by link and pack size
  const usual = { items: r.items };
  const an = mkAnalyser({ index: bIdx(null, { deals: [deals[0], { ...deals[0], s: "lidl", p: 99.9, pk: { v: 100, u: "g" } }, { ...deals[4], p: 139.9 }] }), usual, today: "2026-10-30" });
  const [velvet, small, nutella] = bIdx(null, { deals: [deals[0], { ...deals[0], s: "lidl", p: 99.9, pk: { v: 100, u: "g" } }, { ...deals[4], p: 139.9 }] }).deals.map(an);
  assert.deepEqual([velvet.usual.p, velvet.usual.pct, velvet.saving], [235.38, 45, 105.48]);
  assert.equal(small.usual, null, "other size"); assert.equal(nutella.usual.pct, -8, "dearer than usual");
  assert.equal(usualLookup(usual)({ n: "x", pk: null }), null);
});
