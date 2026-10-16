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
});

test("Tesco embedded JSON", async () => {
  const ps = parseTescoHtml(await fx("tesco-json.html"));
  assert.equal(ps.length, 2);
  assert.equal(ps[0].p, 54.9); assert.equal(ps[0].cc, 44.9); assert.equal(ps[0].ccUntil, "2026-10-27"); assert.equal(ps[0].u, 219.6);
  assert.equal(ps[1].t, "Kuřecí prsní řízky 500g");
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
  const env = { ...process.env, DATA_DIR: dir, FAST: "1", STORES: "lidl,albert", RECIPE_URL: "https://example.com/curry", FIXTURES: new URL("./fixtures/", import.meta.url).pathname };
  const { stdout } = await run(process.execPath, ["--import", new URL("./fake-net.mjs", import.meta.url).pathname, new URL("../fetch/fetch.mjs", import.meta.url).pathname], { env, timeout: 120000 });
  const status = JSON.parse(await readFile(join(dir, "status.json"), "utf8"));
  assert.equal(status.tesco.method, "html", stdout);
  assert.ok(status.tesco.searched > 100, "searched " + status.tesco.searched);
  const tesco = JSON.parse(await readFile(join(dir, "tesco.json"), "utf8"));
  assert.ok(tesco.products["2001018475"]); assert.ok(tesco.queries["máslo"].includes("2001018475"));
  const deals = JSON.parse(await readFile(join(dir, "deals.json"), "utf8"));
  assert.ok(deals.deals.some(d => d.s === "lidl" && d.n === "Rajčata cherry"));
  assert.ok(deals.deals.some(d => d.s === "albert"));
  const hist = JSON.parse(await readFile(join(dir, "history.json"), "utf8"));
  assert.ok(hist.items.butter.s.tesco.length === 1, JSON.stringify(hist.items.butter));
  const imp = await readdir(join(dir, "imports"));
  assert.equal(imp.length, 1);
  const rec = JSON.parse(await readFile(join(dir, "imports", imp[0]), "utf8"));
  assert.equal(rec.lines.length, 7);
});
