// Deal analysis shared by the app and the morning job: is it a real saving, how much in Kč,
// is it the lowest in 8 weeks, is it new, and which deals match your alerts.
import { norm, iso, daysBetween, perUnit, round2 } from "./units.js";
import { findItem, words } from "./match.js";
import { unitInBase } from "./plan.js";
import { en } from "./translate.js";

/** kupi.cz categories with English names, in leaflet order. */
export const DEAL_CATS = [
  ["ovoce-a-zelenina", "Fruit & veg"], ["maso-drubez-a-ryby", "Meat & fish"], ["mlecne-vyrobky-a-vejce", "Dairy & eggs"],
  ["pecivo", "Bakery"], ["lahudky", "Deli"], ["mrazene-a-instantni-potraviny", "Frozen & instant"], ["konzervy", "Tins & jars"],
  ["vareni-a-peceni", "Cooking & baking"], ["zdrava-vyziva", "Health food"], ["sladkosti-a-slane-snacky", "Sweets & snacks"],
  ["nealko-napoje", "Coffee, tea & drinks"], ["alkohol", "Alcohol"], ["drogerie", "Toiletries"], ["domacnost", "Household"],
];
export const DEAL_CAT_NAME = Object.fromEntries(DEAL_CATS);
const LONG_LIFE_CATS = new Set(["konzervy", "vareni-a-peceni", "drogerie", "domacnost", "mrazene-a-instantni-potraviny", "alkohol", "nealko-napoje", "zdrava-vyziva", "sladkosti-a-slane-snacky"]);
const LONG_LIFE_ITEMS = new Set(["coffee", "instant-coffee", "tea", "rice", "pasta", "flour", "sugar", "oil", "olive-oil", "tuna", "passata", "toilet-paper", "paper-towels", "laundry", "dish-soap", "dishwasher-tabs", "shampoo", "toothpaste", "soap", "bin-bags", "beer", "water", "juice", "oats", "cereal", "chocolate", "biscuits"]);

export const dealKey = d => `${d.s}|${d.n}|${d.p}|${d.f || ""}|${d.a || ""}`;
export const dealUnit = d => d.u || perUnit(d.p, d.pk);
/** Price before the discount, worked out from the % off. */
export const wasPrice = d => (d.d > 0 && d.d < 95 ? round2(d.p / (1 - d.d / 100)) : null);
export const savingKc = d => { const w = wasPrice(d); return w ? round2(w - d.p) : 0; };

/**
 * Builds a cached analyser for one data load.
 * ctx: {index (from buildIndex), history, custom (custom items), today}
 */
export function analyser({ index, history, custom = [], today = iso() }) {
  const itemCache = new Map(), everyday = new Map(), lows = new Map(), out = new Map();
  const itemFor = d => {
    const k = d.i ?? dealKey(d);
    if (!itemCache.has(k)) itemCache.set(k, findItem(d.ws || words(d.n), custom));
    return itemCache.get(k);
  };
  /** Tesco online's cheapest everyday (non-offer) price for an item, per gram / ml / piece. */
  let byItem = null; // Tesco products grouped by the item they match, built once
  const tescoEveryday = it => {
    if (everyday.has(it.id)) return everyday.get(it.id);
    if (!byItem) {
      byItem = new Map();
      for (const p of index.tesco || []) { const x = findItem(p.ws, custom); if (x) (byItem.get(x.id) || byItem.set(x.id, []).get(x.id)).push(p); }
    }
    let best = null;
    for (const p of byItem.get(it.id) || []) {
      if (p.avail === false) continue;
      const regular = p.was || p.p;
      const u = p.u ? { p: p.was ? round2(p.u * (p.was / p.p)) : p.u, per: p.per } : perUnit(regular, p.pk);
      const b = unitInBase(u, it); if (b == null || !(b > 0)) continue;
      if (!best || b < best.base) best = { base: b, unit: u, name: p.t, price: regular, img: p.i || null };
    }
    everyday.set(it.id, best);
    return best;
  };
  /** Lowest unit price for the item at any shop in the 8 weeks before today (needs a week of history). */
  const low8 = it => {
    if (lows.has(it.id)) return lows.get(it.id);
    const h = history?.items?.[it.id]; let low = null, oldest = today;
    for (const series of Object.values(h?.s || {})) {
      for (let i = 0; i < series.length; i++) {
        const [day, up] = series[i]; if (day >= today) continue;
        const next = series[i + 1]?.[0];
        if (daysBetween(day, today) > 56 && (!next || daysBetween(next, today) > 56)) continue;
        const b = unitInBase({ p: up, per: h.per }, it); if (b == null) continue;
        if (low == null || b < low) low = b; if (day < oldest) oldest = day;
      }
    }
    const r = low != null && daysBetween(oldest, today) >= 7 ? low : null;
    lows.set(it.id, r);
    return r;
  };
  return function analyse(d) {
    const k = d.i ?? dealKey(d);
    if (out.has(k)) return out.get(k);
    const it = itemFor(d), unit = dealUnit(d);
    const r = { it, unit, was: wasPrice(d), saving: savingKc(d), real: null, lowest: false, stockUp: false,
      isNew: !!(d.fs && daysBetween(d.fs, today) <= 2), upcoming: !!(d.from && d.from > today),
      endsSoon: !!(d.until && daysBetween(today, d.until) <= 1) };
    if (it && unit) {
      const base = unitInBase(unit, it);
      const ev = tescoEveryday(it);
      if (base != null && ev) r.real = { pct: Math.round((1 - base / ev.base) * 100), ...ev };
      const low = low8(it);
      if (base != null && low != null && base <= low * 1.005) r.lowest = true;
      r.stockUp = r.lowest && (LONG_LIFE_ITEMS.has(it.id) || LONG_LIFE_CATS.has(d.kc));
    }
    out.set(k, r);
    return r;
  };
}

/** Does a deal mention one of your watch words (in Czech or English)? Returns the word, or null. */
export function watchHit(name, watchWords) {
  if (!watchWords?.length) return null;
  const a = norm(name), b = norm(en(name));
  for (const w of watchWords) { const n = norm(w); if (n.length >= 2 && (a.includes(n) || b.includes(n))) return w; }
  return null;
}

/** Brand-like words in a name (not translated by the glossary), offered as watch words. */
export function brandWords(name) {
  const e = en(name);
  return String(name).split(/[\s,()/-]+/).filter(w => w.length >= 3 && /^[A-ZÁ-Ž]/.test(w) && !/\d/.test(w) && e.includes(w)).slice(0, 3);
}

/**
 * Deals and Tesco offers that match an alert list, for the morning job.
 * alerts: {items:[{id, maxUnit?}], words:[], minDisc, stores:[], loyalty:{store:bool}}
 * Returns [{key, label, store, price, disc, name, it}]
 */
export function alertMatches({ index, history, custom = [], alerts, today = iso() }) {
  const an = analyser({ index, history, custom, today });
  const want = new Map((alerts.items || []).map(a => [a.id, a]));
  const stores = new Set(alerts.stores || []), loy = alerts.loyalty || {};
  const minDisc = alerts.minDisc || 0;
  const out = [];
  const okUnit = (a, it, unit) => {
    if (!a?.maxUnit) return null;
    const b = unitInBase(unit, it); if (b == null) return false;
    return b * (it.unit === "ks" ? 1 : 1000) <= a.maxUnit;
  };
  for (const d of index.deals || []) {
    if (stores.size && !stores.has(d.s)) continue;
    if (d.until && d.until < today) continue;
    if (d.from && d.from > today) continue;
    if (d.app && loy[d.s] === false) continue;
    const r = an(d);
    const a = r.it ? want.get(r.it.id) : null;
    const word = watchHit(d.n, alerts.words);
    if (!a && !word) continue;
    const under = a && r.unit ? okUnit(a, r.it, r.unit) : null;
    if (under === false && !word) continue;
    if (minDisc && !(d.d >= minDisc) && !under) continue;
    out.push({ key: dealKey(d), store: d.s, price: d.p, disc: d.d || 0, name: en(d.n), cz: d.n, it: r.it, word, until: d.until || null });
  }
  for (const p of index.tesco || []) {
    if (!(p.cc || p.was || p.promo)) continue;
    if (stores.size && !stores.has("tesco")) continue;
    if (p.cc && loy.tesco === false && !p.was) continue;
    const it = findItem(p.ws, custom);
    const a = it ? want.get(it.id) : null;
    const word = watchHit(p.t, alerts.words);
    if (!a && !word) continue;
    const price = p.cc && loy.tesco !== false ? p.cc : p.p;
    const disc = p.was ? Math.round((1 - p.p / p.was) * 100) : p.cc ? Math.round((1 - p.cc / p.p) * 100) : 0;
    const unit = p.u ? { p: round2(p.u * (price / p.p)), per: p.per } : perUnit(price, p.pk);
    const under = a && it && unit ? okUnit(a, it, unit) : null;
    if (under === false && !word) continue;
    if (minDisc && !(disc >= minDisc) && !under) continue;
    out.push({ key: `tesco-online|${p.id}|${price}`, store: "tesco", price, disc, name: en(p.t), cz: p.t, it, word, online: true, until: p.ccUntil || p.promoUntil || null });
  }
  return out;
}
