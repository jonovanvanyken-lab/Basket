// Price candidates per store, pack-realistic costs, and the shopping plan.
import { perUnit, round2, daysBetween, iso, norm } from "./units.js";
import { words, score } from "./match.js";
import { BY_ID } from "./dict.js";

export const STORES = {
  tesco: { name: "Tesco", short: "Tesco", hue: "#1f5fbf", kupi: "tesco" },
  albert: { name: "Albert", short: "Albert", hue: "#1f8a5b", kupi: "albert" },
  lidl: { name: "Lidl", short: "Lidl", hue: "#c99a06", kupi: "lidl" },
  kaufland: { name: "Kaufland", short: "Kaufl.", hue: "#c2410c", kupi: "kaufland" },
  penny: { name: "Penny", short: "Penny", hue: "#b8417a", kupi: "penny-market" },
  billa: { name: "Billa", short: "Billa", hue: "#8a4fc4", kupi: "billa" },
};
export const LOYALTY = { tesco: "Clubcard", albert: "Albert app", lidl: "Lidl Plus", kaufland: "Kaufland Card", penny: "Penny app", billa: "Billa app" };

/** Build search indexes once per data load. */
export function buildIndex(tesco, deals) {
  const tp = [];
  for (const [id, p] of Object.entries(tesco?.products || {})) tp.push({ id, ...p, ws: words(p.t) });
  const dl = (deals?.deals || []).map((d, i) => ({ i, ...d, ws: words(d.n) }));
  return { tesco: tp, deals: dl, cache: new Map(), tFetched: tesco?.fetchedAt || null, dFetched: deals?.fetchedAt || null };
}

/** Convert v from unit `from` to unit `to` for an item (g ↔ ml by density, ks ↔ g by piece weight). */
export function convert(v, from, to, it) {
  if (v == null || from === to) return v;
  const d = it?.d || 1, e = it?.e || 0;
  if (from === "ml" && to === "g") return v * d;
  if (from === "g" && to === "ml") return v / d;
  if (from === "ks" && to === "g") return e ? v * e : null;
  if (from === "g" && to === "ks") return e ? v / e : null;
  if (from === "ks" && to === "ml") return e ? (v * e) / d : null;
  if (from === "ml" && to === "ks") return e ? (v * d) / e : null;
  return null;
}

/**
 * All price candidates for an item, across stores.
 * ctx: {index, book, settings, today, custom}
 * Each: {store, src:"tesco"|"deal"|"book", key, name, price, pack, unit, loose, loyalty, until, seen, promo}
 */
export function candidates(it, ctx) {
  const { index, book = [], settings = {}, today = iso() } = ctx;
  const ck = it.id + "|" + (it.custom ? it.q + it.m.join() : "");
  let base = index.cache.get(ck);
  if (!base) {
    base = [];
    for (const p of index.tesco) {
      if (it.custom ? !customHit(it, p) : score(it, p.ws) <= 0) continue;
      if (p.avail === false) continue;
      const pack = p.pk || null, loose = !!p.loose;
      const unit = p.u ? { p: p.u, per: p.per } : perUnit(p.p, pack);
      const common = { store: "tesco", src: "tesco", key: "t:" + p.id, pid: p.id, name: p.t, pack, loose, seen: (index.tFetched || "").slice(0, 10), promo: p.promo || "" };
      base.push({ ...common, price: p.p, unit, loyalty: false, until: p.promoUntil || null });
      if (p.cc && p.cc < p.p) base.push({ ...common, key: "tc:" + p.id, price: p.cc, unit: p.ccU ? { p: p.ccU, per: p.per } : perUnit(p.cc, pack) || scaleUnit(unit, p.cc / p.p), loyalty: true, until: p.ccUntil || null });
    }
    for (const d of index.deals) {
      if (it.custom ? !customHit(it, d) : score(it, d.ws) <= 0) continue;
      const pack = d.pk || null;
      base.push({ store: d.s, src: "deal", key: `d:${d.s}:${norm(d.n)}:${d.p}:${d.f || ""}`, name: d.n, fmt: d.f || "", price: d.p, pack, loose: !pack && !!d.u,
        unit: d.u || perUnit(d.p, pack), loyalty: !!d.app, until: d.until || null, from: d.from || null, seen: (index.dFetched || "").slice(0, 10), disc: d.d || 0, promo: d.d ? `−${d.d} %` : "" });
    }
    index.cache.set(ck, base);
  }
  const out = base.filter(c => (!c.until || c.until >= today) && (!c.from || c.from <= today));
  const maxAge = settings.bookMaxAge ?? 120;
  for (const b of book) {
    if (b.itemId !== it.id) continue;
    const age = daysBetween(b.date, today);
    if (age > maxAge) continue;
    const pack = b.pk || null;
    out.push({ store: b.store, src: "book", key: "b:" + b.id, bid: b.id, name: b.name || it.name, price: b.p, pack, loose: !!b.loose,
      unit: b.loose ? { p: b.p, per: b.per || (it.unit === "ks" ? "ks" : it.unit === "ml" ? "l" : "kg") } : perUnit(b.p, pack), loyalty: !!b.app, until: null, seen: b.date, age });
  }
  const st = settings.stores || {}, loy = settings.loyalty || {};
  return out.filter(c => storeOn(c.store, st) && (!c.loyalty || loy[c.store] !== false));
}
export const storeOn = (s, st = {}) => !!STORES[s] && (st[s] ?? DEFAULT_STORES.includes(s));
export const DEFAULT_STORES = ["tesco", "albert", "lidl"];
function scaleUnit(u, f) { return u ? { p: round2(u.p * f), per: u.per } : null; }
function customHit(it, p) {
  if (!it.m.length) return false;
  const ws = p.ws; return it.m.some(a => a.every(s => ws.some(w => w.startsWith(s))));
}

/**
 * Cost of meeting `need` ({v,u} in the item's unit, or null = one usual pack) with a candidate.
 * Returns {cost, used, n, buyQty, unitP} or null when it can't be costed.
 */
export function costFor(c, need, it) {
  const want = need && need.v > 0 ? need : { v: it.pack, u: it.unit, assumed: true };
  if (c.loose || (!c.pack && c.unit)) {
    if (!c.unit) return null;
    const perBase = c.unit.per === "kg" ? "g" : c.unit.per === "l" ? "ml" : "ks";
    let amt = convert(want.v, want.u, perBase, it);
    if (amt == null) { if (want.assumed) amt = perBase === "ks" ? 1 : 1000; else return null; }
    const mult = perBase === "ks" ? 1 : 1 / 1000;
    const cost = round2(c.unit.p * amt * mult);
    return { cost, used: cost, n: null, buyQty: { v: amt, u: perBase }, unitP: c.unit };
  }
  if (!c.pack) return { cost: c.price, used: c.price, n: 1, buyQty: null, unitP: c.unit };
  let amt = convert(want.v, want.u, c.pack.u, it);
  if (amt == null) { if (want.assumed || want.u === "ks") amt = c.pack.v * (want.u === "ks" && !want.assumed ? want.v : 1); else return null; }
  const n = Math.max(1, Math.ceil(amt / c.pack.v - 0.03));
  const cost = round2(n * c.price);
  const used = round2(Math.min(cost, (amt / c.pack.v) * c.price));
  return { cost, used, n, buyQty: { v: n * c.pack.v, u: c.pack.u }, unitP: c.unit || perUnit(c.price, c.pack) };
}

/** Compare unit prices across different unit kinds by converting both to the item's base. */
export function unitInBase(u, it) {
  if (!u) return null;
  const from = u.per === "kg" ? "g" : u.per === "l" ? "ml" : "ks";
  const per = convert(1, it.unit, from, it); // amount of `from` in 1 item-unit
  if (per == null) return null;
  const mult = from === "ks" ? 1 : 1 / 1000;
  return u.p * per * mult; // Kč per 1 g / 1 ml / 1 ks of the item's unit
}

/** Best candidate per store for one list entry. */
export function pricesByStore(it, need, ctx, lock) {
  const cs = candidates(it, ctx);
  const by = {};
  for (const c of cs) {
    if (lock && lock[c.store] && c.key !== lock[c.store] && !(c.pid && lock[c.store] === "t:" + c.pid)) continue;
    const k = costFor(c, need, it);
    if (!k) continue;
    const r = { ...c, ...k };
    const cur = by[c.store];
    if (!cur || r.cost < cur.cost - 0.001 || (Math.abs(r.cost - cur.cost) < 0.01 && (rank(r) < rank(cur)))) by[c.store] = r;
  }
  return { by, all: cs };
}
// at equal cost prefer fresher sources: Tesco online, leaflet, then price book
const rank = c => ({ tesco: 0, deal: 1, book: 2 })[c.src] + (c.age || 0) / 1000;

/**
 * The plan for a list.
 * entries: [{id, itemId|item, qty, have, lock}] ; ctx as in candidates() plus custom items and history.
 */
export function makePlan(entries, ctx) {
  const settings = ctx.settings || {};
  const enabled = Object.keys(STORES).filter(s => (settings.stores?.[s] ?? DEFAULT_STORES.includes(s)));
  const rows = [];
  for (const e of entries) {
    if (e.have) continue;
    const it = e.item || BY_ID[e.itemId] || (ctx.custom || []).find(c => c.id === e.itemId);
    if (!it) { rows.push({ e, it: null, by: {}, best: null }); continue; }
    const { by } = pricesByStore(it, e.qty, ctx, e.lock);
    let best = null;
    for (const s of enabled) if (by[s] && (!best || by[s].cost < best.cost)) best = by[s];
    const row = { e, it, by, best };
    row.good = best ? goodness(it, best, ctx) : null;
    row.swap = best ? swapHint(it, e.qty, best, ctx) : null;
    rows.push(row);
  }
  // single-store totals
  const singles = enabled.map(s => {
    let total = 0, priced = 0; const missing = [];
    for (const r of rows) { if (r.by[s]) { total += r.by[s].cost; priced++; } else missing.push(r.e.id); }
    return { store: s, total: round2(total), priced, missing };
  }).filter(x => x.priced > 0).sort((a, b) => a.missing.length - b.missing.length || a.total - b.total);
  const bestSingle = singles[0] || null;
  // cheapest per item
  let perItemTotal = 0, perItemMissing = 0;
  for (const r of rows) if (r.best) perItemTotal += r.best.cost; else perItemMissing++;
  // best two-store split, compared with the best single store on the items that store prices
  let split = null;
  if (bestSingle) {
    for (let i = 0; i < enabled.length; i++) for (let j = i + 1; j < enabled.length; j++) {
      const a = enabled[i], b = enabled[j];
      let total = 0, same = 0, missing = 0; const assign = {}; let usesA = false, usesB = false;
      for (const r of rows) {
        const ca = r.by[a], cb = r.by[b];
        const pick = ca && cb ? (ca.cost <= cb.cost ? a : b) : ca ? a : cb ? b : null;
        if (!pick) { missing++; continue; }
        assign[r.e.id] = pick; total += r.by[pick].cost; if (pick === a) usesA = true; else usesB = true;
        if (!bestSingle.missing.includes(r.e.id)) same += r.by[pick].cost;
      }
      if (!usesA || !usesB) continue;
      const savings = round2(bestSingle.total - same);
      if (missing > bestSingle.missing.length) continue;
      if (!split || savings > split.savings) split = { stores: [a, b], total: round2(total), savings, missing, assign };
    }
  }
  const threshold = settings.splitMin ?? 80;
  return { rows, singles, bestSingle, perItem: { total: round2(perItemTotal), missing: perItemMissing }, split: split && split.savings >= threshold ? split : null, splitAny: split, threshold };
}

/** Assignment of each entry to a store for a plan mode: "cheapest" | "single" | "split". */
export function assignment(plan, mode) {
  const out = {};
  for (const r of plan.rows) {
    let s = null;
    if (mode === "single" && plan.bestSingle) s = r.by[plan.bestSingle.store] ? plan.bestSingle.store : r.best?.store || null;
    else if (mode === "split" && plan.splitAny) s = plan.splitAny.assign[r.e.id] || r.best?.store || null;
    else s = r.best?.store || null;
    out[r.e.id] = s;
  }
  return out;
}

/** Is the chosen price a good one? Compares with the lowest unit price seen in the last 8 weeks. */
export function goodness(it, c, ctx) {
  const today = ctx.today || iso();
  const cu = unitInBase(c.unitP || c.unit, it);
  if (cu == null) return null;
  let low = Infinity, n = 0, oldest = today;
  const seen = day => { if (day < oldest) oldest = day; };
  const h = ctx.history?.items?.[it.id];
  const series = h?.s?.[c.store] || [];
  for (let i = 0; i < series.length; i++) {
    const [day, up] = series[i];
    // a value recorded before the window still counts if it was in force when the window opened
    const next = series[i + 1]?.[0];
    if (daysBetween(day, today) > 56 && (!next || daysBetween(next, today) > 56)) continue;
    const v = unitInBase({ p: up, per: h.per || perOfItem(it) }, it); if (v != null) { low = Math.min(low, v); n++; seen(day); }
  }
  for (const b of ctx.book || []) {
    if (b.itemId !== it.id || b.store !== c.store || daysBetween(b.date, today) > 56) continue;
    const v = unitInBase(b.loose ? { p: b.p, per: b.per || perOfItem(it) } : perUnit(b.p, b.pk), it); if (v != null) { low = Math.min(low, v); n++; seen(b.date); }
  }
  // need at least a week of prices before calling anything a good or bad price
  if (!n || !isFinite(low) || low <= 0 || daysBetween(oldest, today) < 7) return null;
  const pct = Math.round(((cu - low) / low) * 100);
  return { pct, low, lowest: pct <= 1 };
}
const perOfItem = it => (it.unit === "g" ? "kg" : it.unit === "ml" ? "l" : "ks");

/** A cheaper swap (frozen for fresh, thighs for breast…) when it saves at least 15 % per unit. */
export function swapHint(it, need, best, ctx) {
  if (!it.subs?.length) return null;
  const cur = unitInBase(best.unitP || best.unit, it);
  if (cur == null) return null;
  let top = null;
  for (const sid of it.subs) {
    const s = BY_ID[sid]; if (!s) continue;
    const { by } = pricesByStore(s, need ? { v: convert(need.v, need.u, s.unit, s) ?? s.pack, u: s.unit } : null, ctx);
    for (const c of Object.values(by)) {
      const v = unitInBase(c.unitP || c.unit, s);
      if (v == null) continue;
      const save = 1 - v / cur;
      if (save >= 0.15 && (!top || save > top.save)) top = { item: s, cand: c, save };
    }
  }
  return top;
}
