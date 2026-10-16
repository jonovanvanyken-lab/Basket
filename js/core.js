// Shared app logic: price data, the current plan, and changes to the list.
import { S, save, uid } from "./state.js";
import { buildIndex, makePlan, STORES, storeOn } from "./plan.js";
import { BY_ID, ITEMS } from "./dict.js";
import { parseLine } from "./recipe.js";
import { customItem, findItemByName } from "./match.js";
import { iso, norm, round } from "./units.js";
import { GitHub, sha1hex } from "./gh.js";
import { useSaved } from "./translate.js";

export const DATA = { tesco: null, deals: null, history: null, status: null, translations: null, index: buildIndex(null, null), loaded: false, error: null };

const OVERRIDE = "kcb-fresh"; // fresher copies read straight from GitHub after "Fetch now"
async function fromCache(name) {
  try { const c = await caches.open(OVERRIDE); const r = await c.match(`data/${name}.json`); return r ? await r.json() : null; } catch { return null; }
}
export async function putFresh(name, text) {
  try { const c = await caches.open(OVERRIDE); await c.put(`data/${name}.json`, new Response(text, { headers: { "content-type": "application/json" } })); } catch {}
}
const stamp = j => (j && (j.fetchedAt || j.runAt || j.updated)) || "";

export async function loadData() {
  const names = ["tesco", "deals", "history", "status", "translations"];
  const got = await Promise.all(names.map(async n => {
    let net = null;
    try { const r = await fetch(`data/${n}.json`, { cache: "no-cache" }); if (r.ok) net = await r.json(); } catch {}
    const fresh = await fromCache(n);
    return fresh && stamp(fresh) > stamp(net) ? fresh : net;
  }));
  names.forEach((n, i) => { DATA[n] = got[i]; });
  useSaved(DATA.translations);
  DATA.index = buildIndex(DATA.tesco, DATA.deals);
  DATA.loaded = true;
  bump();
}

// ---- items ----
export const itemOf = id => BY_ID[id] || S().custom.find(c => c.id === id) || null;
export const allItems = () => S().custom.concat(ITEMS);
export const ctx = () => ({ index: DATA.index, book: S().book, settings: S().settings, today: iso(), custom: S().custom, history: DATA.history });
export const enabledStores = () => Object.keys(STORES).filter(s => storeOn(s, S().settings.stores));

// ---- plan memo ----
let version = 0, planCache = null;
export function bump() { version++; planCache = null; document.dispatchEvent(new CustomEvent("kcb:change")); }
export function changed() { save(); bump(); }
export function plan() {
  if (!planCache || planCache.v !== version) planCache = { v: version, p: makePlan(S().list.map(e => ({ ...e, item: itemOf(e.itemId) })), ctx()) };
  return planCache.p;
}
export function planFor(entries) { return makePlan(entries.map(e => ({ ...e, item: itemOf(e.itemId) })), ctx()); }

// ---- adding things ----
/** "chicken thighs 1 kg" → "1 kg chicken thighs" so the quantity is read */
function qtyFirst(s) {
  const m = s.match(/^(.*?[a-zá-ž)])\s+(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*(kg|g|dkg|l|ml|dl|ks|x|pcs|pack|packs|cans?|bunch)?\.?$/i);
  return m ? `${m[2]}${m[3] ? " " + m[3] : ""} ${m[1]}` : s.replace(/^(\d+)\s*x\s+/i, "$1 ");
}
export function resolve(text) {
  const p = parseLine(qtyFirst(text.trim()), S().custom);
  if (!p) return null;
  let it = p.item;
  if (!it) {
    const name = p.name || text.trim();
    it = S().custom.find(c => norm(c.name) === norm(name));
    if (!it) { it = customItem(name); S().custom.push(it); }
  }
  // a count of something sold by weight without a known piece weight: keep it as packs
  let qty = p.qty;
  if (qty && qty.u === "ks" && it.unit !== "ks" && !it.e) qty = { v: qty.v * it.pack, u: it.unit };
  return { item: it, qty, note: p.note, raw: p.raw, optional: p.optional };
}
/** Add one or more items ("eggs, butter 500 g, 2 l milk"). Returns the added/updated entries. */
export function addText(text, src = "typed") {
  const parts = String(text).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) { const r = resolve(part); if (r) out.push(addEntry(r.item.id, r.qty, src)); }
  return out;
}
export function addEntry(itemId, qty, src = "typed", opts = {}) {
  const L = S().list;
  const cur = L.find(e => e.itemId === itemId);
  if (cur) {
    if (qty && cur.qty && cur.qty.u === qty.u) cur.qty = { v: round(cur.qty.v + qty.v), u: qty.u };
    else if (qty && !cur.qty) cur.qty = qty;
    if (opts.have === false) cur.have = false;
    return cur;
  }
  const it = itemOf(itemId);
  const e = { id: uid(), itemId, qty: qty || null, have: opts.have ?? false, src, added: iso() };
  if (it && S().pantry.includes(itemId) && src.startsWith("recipe")) e.have = true;
  L.push(e);
  return e;
}
export function snapshot() { return JSON.stringify({ list: S().list, custom: S().custom, checked: S().checked }); }
export function restore(snap) { const j = JSON.parse(snap); S().list = j.list; S().custom = j.custom; S().checked = j.checked; changed(); }

// ---- search for autocomplete ----
export function suggest(q, limit = 6) {
  const n = norm(q); if (n.length < 2) return [];
  const out = [];
  for (const it of allItems()) {
    let s = 0;
    for (const a of it.en) { if (a.startsWith(n)) s = Math.max(s, 3); else if (a.includes(" " + n) || a.includes(n)) s = Math.max(s, 1); }
    const cz = norm(it.cz);
    if (cz.startsWith(n)) s = Math.max(s, 3); else if (cz.includes(n)) s = Math.max(s, 1);
    if (s) out.push([s, it]);
  }
  out.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length);
  const seen = new Set();
  return out.map(x => x[1]).filter(it => (seen.has(it.id) ? false : seen.add(it.id))).slice(0, limit);
}

// ---- GitHub ----
export const gh = () => { const g = S().settings.gh; return g.owner && g.repo && g.token ? new GitHub(g) : null; };
export { sha1hex };
/** Custom items need their own Tesco search. */
export const customQueries = () => S().custom.map(c => c.q).filter(q => q && !(DATA.tesco?.queries && q in DATA.tesco.queries));
export function findOrCustom(name) { return findItemByName(name, S().custom); }
