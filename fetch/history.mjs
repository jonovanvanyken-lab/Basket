// Price history: the lowest unit price per item and store each day, plus each Tesco product's price.
// Only changes are stored. Kept for 180 days.
import { ITEMS } from "../js/dict.js";
import { buildIndex, candidates, unitInBase, STORES } from "../js/plan.js";
import { daysBetween, round2 } from "../js/units.js";

const KEEP = 180;
const perOf = it => (it.unit === "g" ? "kg" : it.unit === "ml" ? "l" : "ks");

export function updateHistory(hist, tesco, deals, day) {
  hist.items ||= {}; hist.tesco ||= {};
  const index = buildIndex(tesco, deals);
  const settings = { stores: Object.fromEntries(Object.keys(STORES).map(s => [s, true])), loyalty: {} };
  for (const it of ITEMS) {
    const lows = {};
    for (const c of candidates(it, { index, settings, today: day })) {
      const v = unitInBase(c.unit, it); if (v == null || !(v > 0)) continue;
      const up = round2(v * (it.unit === "ks" ? 1 : 1000));
      if (!(c.store in lows) || up < lows[c.store]) lows[c.store] = up;
    }
    if (!Object.keys(lows).length) continue;
    const h = (hist.items[it.id] ||= { per: perOf(it), s: {} });
    for (const [s, up] of Object.entries(lows)) push((h.s[s] ||= []), [day, up]);
  }
  for (const [id, p] of Object.entries(tesco.products || {})) push((hist.tesco[id] ||= []), p.cc ? [day, p.p, p.cc] : [day, p.p]);
  // prune: keep the last entry before the window so the chart starts with a value
  const cut = x => { let i = 0; while (i < x.length - 1 && daysBetween(x[i + 1][0], day) > KEEP) i++; if (i) x.splice(0, i); };
  for (const h of Object.values(hist.items)) for (const x of Object.values(h.s)) cut(x);
  for (const [id, x] of Object.entries(hist.tesco)) { cut(x); if (!tesco.products?.[id] && daysBetween(x[x.length - 1][0], day) > KEEP) delete hist.tesco[id]; }
  hist.updated = day;
  return hist;
}
function push(arr, rec) {
  const last = arr[arr.length - 1];
  if (last && last[0] === rec[0]) { arr[arr.length - 1] = rec; return; }
  if (last && last[1] === rec[1] && last[2] === rec[2]) return;
  arr.push(rec);
}
