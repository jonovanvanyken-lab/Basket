// Daily price fetch for Kč Basket. Runs in GitHub Actions (see .github/workflows/prices.yml) or locally:
//   cd fetch && npm install && node fetch.mjs
// Environment (all optional):
//   QUERIES="tahini;halloumi"   extra Tesco searches for this run
//   RECIPE_URL="https://…"      read one recipe page into data/imports/
//   QUICK=1                     only do QUERIES / RECIPE_URL, skip the full daily run
//   STORES="tesco,albert,lidl"  which shops' leaflets to read (default: all six)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ITEMS } from "../js/dict.js";
import { Tesco } from "./tesco.mjs";
import { fetchShop, SHOP_SLUGS } from "./kupi.mjs";
import { readRecipeUrl } from "./recipe-url.mjs";
import { updateHistory } from "./history.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.DATA_DIR || join(ROOT, "data");
const env = process.env;
const QUICK = env.QUICK === "1" || env.QUICK === "true";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAST = process.env.FAST === "1";
const polite = (base = 1200) => () => (FAST ? Promise.resolve() : sleep(base + Math.random() * 800));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function readJson(name, fallback) { try { return JSON.parse(await readFile(join(DATA, name), "utf8")); } catch { return fallback; } }
/** One record per line so git stores small daily diffs. */
function lines(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 20) parts.push(JSON.stringify(k) + ":{\n" + Object.entries(v).map(([a, b]) => JSON.stringify(a) + ":" + JSON.stringify(b)).join(",\n") + "\n}");
    else if (Array.isArray(v) && v.length > 20) parts.push(JSON.stringify(k) + ":[\n" + v.map(x => JSON.stringify(x)).join(",\n") + "\n]");
    else parts.push(JSON.stringify(k) + ":" + JSON.stringify(v));
  }
  return "{" + parts.join(",\n") + "}\n";
}
async function save(name, obj) { await writeFile(join(DATA, name), lines(obj)); }

async function main() {
  await mkdir(join(DATA, "imports"), { recursive: true });
  const status = await readJson("status.json", {});
  const runAt = new Date().toISOString();
  status.runAt = runAt; status.quick = QUICK;

  // ---- recipe page ----
  if (env.RECIPE_URL) {
    const url = env.RECIPE_URL.trim();
    const id = createHash("sha1").update(url).digest("hex").slice(0, 16);
    let out;
    try { out = await readRecipeUrl(url); } catch (e) { out = { url, ok: false, lines: [], error: e.message }; }
    out.fetchedAt = runAt;
    await writeFile(join(DATA, "imports", id + ".json"), JSON.stringify(out, null, 1) + "\n");
    log(`recipe ${url}: ${out.ok ? out.lines.length + " lines" : out.error}`);
    status.recipe = { url, id, ok: out.ok, at: runAt };
  }

  // ---- Tesco ----
  const watch = await readJson("watch.json", { queries: [] });
  const extra = (env.QUERIES || "").split(/[;\n]/).map(s => s.trim()).filter(Boolean);
  const base = QUICK ? [] : [...new Set(ITEMS.filter(x => !x.custom).map(x => x.q))];
  const queries = [...new Set([...base, ...(QUICK ? [] : watch.queries || []), ...extra])].filter(q => q.length <= 60).slice(0, 400);
  const prev = await readJson("tesco.json", { products: {}, queries: {} });
  const tesco = { fetchedAt: prev.fetchedAt || null, source: "nakup.itesco.cz", products: { ...prev.products }, queries: { ...prev.queries }, seen: { ...(prev.seen || {}) } };
  const t = new Tesco({ log });
  let ok = 0, failed = 0, consecutive = 0; const tErrors = [];
  if (queries.length) {
    for (const q of queries) {
      await polite(1300)();
      try {
        const res = await t.search(q);
        tesco.queries[q] = res.map(p => p.id);
        for (const p of res) { tesco.products[p.id] = p; }
        tesco.seen[q] = runAt.slice(0, 10);
        ok++; consecutive = 0;
      } catch (e) {
        failed++; consecutive++; tErrors.push(`${q}: ${e.message}`);
        if (e.status === 429 || consecutive >= 6) { log("Tesco keeps refusing; stopping Tesco for this run"); break; }
        if (e.status === 403 && !FAST) await sleep(8000);
      }
    }
    if (ok) tesco.fetchedAt = runAt;
    // drop products no search returns any more
    const live = new Set(Object.values(tesco.queries).flat());
    for (const id of Object.keys(tesco.products)) if (!live.has(id)) delete tesco.products[id];
    await save("tesco.json", tesco);
  }
  status.tesco = { ok: ok > 0 || !queries.length, searched: ok, failed, method: t.method, notes: t.notes.slice(0, 6), errors: tErrors.slice(0, 8), products: Object.keys(tesco.products).length, at: ok ? runAt : status.tesco?.at || null };
  log(`tesco: ${ok} searches ok, ${failed} failed, ${status.tesco.products} products (${t.method || "no method worked"})`);

  // ---- leaflets ----
  let deals = await readJson("deals.json", { deals: [] });
  if (!QUICK) {
    const stores = (env.STORES || Object.keys(SHOP_SLUGS).join(",")).split(",").map(s => s.trim()).filter(s => SHOP_SLUGS[s]);
    const all = []; status.leaflets = {};
    for (const s of stores) {
      const { deals: d, errors } = await fetchShop(s, { log, delay: polite(1100) });
      log(`kupi ${s}: ${d.length} deals${errors.length ? `, ${errors.length} errors` : ""}`);
      if (d.length) all.push(...d);
      else all.push(...(deals.deals || []).filter(x => x.s === s && (!x.until || x.until >= runAt.slice(0, 10)))); // keep last good set
      status.leaflets[s] = { ok: d.length > 0, deals: d.length, errors: errors.slice(0, 4), at: d.length ? runAt : status.leaflets?.[s]?.at || null };
    }
    deals = { fetchedAt: runAt, source: "kupi.cz", deals: all };
    await save("deals.json", deals);
  }

  // ---- history ----
  if (!QUICK) {
    const hist = await readJson("history.json", { items: {}, tesco: {} });
    updateHistory(hist, tesco, deals, runAt.slice(0, 10));
    await save("history.json", hist);
  }
  await writeFile(join(DATA, "status.json"), JSON.stringify(status, null, 1) + "\n");
  if (!QUICK && !status.tesco.ok && !Object.values(status.leaflets || {}).some(x => x.ok)) { log("nothing could be fetched"); process.exitCode = 1; }
}

main().catch(e => { console.error(e); process.exit(1); });
