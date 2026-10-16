// Matching product, deal and receipt names to dictionary items, and recipe text to items.
import { norm } from "./units.js";
import { ITEMS, BY_ID } from "./dict.js";

export function words(text) {
  return norm(text).split(/[^a-z0-9=]+/).filter(Boolean);
}
function stemHit(stem, ws) {
  if (stem.endsWith("=")) { const s = stem.slice(0, -1); return ws.includes(s); }
  return ws.some(w => w.startsWith(stem));
}
const altHit = (alt, ws) => alt.every(s => stemHit(s, ws));
const altLen = alt => alt.reduce((n, s) => n + s.replace("=", "").length, 0);

/** How specifically `item` matches `ws` (0 = no match). */
export function score(item, ws) {
  if (item.exc.some(a => altHit(a, ws))) return 0;
  let best = 0;
  for (const a of item.m) if (altHit(a, ws)) best = Math.max(best, altLen(a) + a.length);
  return best;
}
export function matches(item, text) { return score(item, typeof text === "string" ? words(text) : text) > 0; }

/** Best dictionary item for a Czech product / deal / receipt name. Custom items are checked too. */
export function findItem(text, custom = []) {
  const ws = typeof text === "string" ? words(text) : text;
  let best = null, bs = 0;
  for (const it of custom.concat(ITEMS)) { const s = score(it, ws); if (s > bs) { bs = s; best = it; } }
  return best;
}

/** Build a custom item for something not in the dictionary (Czech or English name). */
export function customItem(name, opts = {}) {
  const n = norm(name);
  const stems = n.split(/[^a-z0-9]+/).filter(w => w.length > 1).map(w => (w.length > 5 ? w.slice(0, w.length - 1) : w));
  return { id: opts.id || `c:${n.replace(/[^a-z0-9]+/g, "-")}`, custom: true, name: opts.label || (name.trim().charAt(0).toUpperCase() + name.trim().slice(1)), en: [n], m: stems.length ? [stems] : [], q: opts.q || name.trim(),
    exc: [], cat: opts.cat || "other", unit: opts.unit || "ks", pack: opts.pack || 1, d: 1, e: 0, loose: false, pantry: false, subs: [], cz: opts.q || name.trim() };
}

/**
 * Find the dictionary item named in an English (or Czech) ingredient phrase.
 * Longest English alias wins; then Czech stems.
 */
export function findItemByName(phrase, custom = []) {
  const n = " " + norm(phrase).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ") + " ";
  let best = null, bl = 0;
  for (const it of custom.concat(ITEMS)) {
    for (const a of it.en) {
      const al = " " + a.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim() + " ";
      if (al.length > bl && n.includes(al)) { best = it; bl = al.length; }
    }
  }
  if (best) return best;
  return findItem(phrase, custom);
}

export const item = id => BY_ID[id] || null;
