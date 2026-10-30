// Usual prices ("Běžná cena") from kupi.cz product pages (/sleva/…), which kupi.cz's robots.txt allows.
// (kupi.cz refuses automated search requests, so search pages aren't used.)
// Each morning at most BUDGET new or stale product pages are read, starting with the deals on your
// alert list, then the Tesco, Albert and Lidl deals with the biggest discounts. Results are kept for
// REFRESH_DAYS before being read again.
import { num, norm, daysBetween } from "../js/units.js";
import { findItem } from "../js/match.js";

const BASE = "https://www.kupi.cz";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const BUDGET = 200, REFRESH_DAYS = 30, KEEP_DAYS = 60;
const MAIN = new Set(["tesco", "albert", "lidl"]);

const PRICE = "(\\d{1,3}(?:[ \\u00a0.]\\d{3})*(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)\\s*(?:Kč|,-)";
const LABEL_RE = new RegExp("Běžná cena\\s*:?\\s*" + PRICE, "i");
const TEXT_RE = new RegExp("běžně (?:stojí|stoji|za)\\s*" + PRICE, "i");

/** Usual price on a product page, or null. */
export function parseProductPage(html) {
  const text = String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ");
  for (const re of [LABEL_RE, TEXT_RE]) {
    const m = text.match(re);
    if (m) { const p = num(m[1]); if (p > 0) return p; }
  }
  return null;
}

/** The one pack size a product is sold in across every shop's deals, or null when there are several. */
export function packOf(link, deals) {
  const sizes = new Map();
  for (const d of deals) if (d.l === link && d.pk) sizes.set(`${d.pk.v}${d.pk.u}${d.pk.n || 1}`, d.pk);
  return sizes.size === 1 ? [...sizes.values()][0] : null;
}

export async function fetchUsual(deals, { fetchImpl = fetch, delay = () => Promise.resolve(), log = () => {}, prev = {}, today, alerts = null, budget = BUDGET }) {
  const items = { ...(prev.items || {}) };
  // which product pages to read, most useful first
  const want = new Set((alerts?.items || []).map(a => a.id));
  const words = (alerts?.words || []).map(norm).filter(Boolean);
  const score = d => {
    let s = d.d || 0;
    if (MAIN.has(d.s)) s += 100;
    if (want.size && want.has(findItem(d.n, alerts?.custom || [])?.id)) s += 1000;
    if (words.some(w => norm(d.n).includes(w))) s += 1000;
    return s;
  };
  const best = new Map();
  for (const d of deals) {
    if (!d.l || !/^\/sleva\/[\w\-/.%]+$/.test(d.l)) continue;
    const have = items[d.l];
    if (have && daysBetween(have.at, today) < REFRESH_DAYS) continue;
    const s = score(d); if (!best.has(d.l) || s > best.get(d.l).s) best.set(d.l, { d, s });
  }
  const queue = [...best.values()].sort((a, b) => b.s - a.s).slice(0, budget);
  let ok = 0, failed = 0, found = 0, consecutive = 0; const errors = [];
  for (const { d } of queue) {
    await delay();
    let html;
    try {
      const res = await fetchImpl(BASE + d.l, { headers: { "user-agent": UA, "accept-language": "cs-CZ,cs;q=0.9" }, redirect: "follow" });
      html = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      failed++; consecutive++; errors.push(`${d.l}: ${e.message}`);
      if (consecutive >= 6) { log("kupi.cz keeps refusing product pages; stopping usual prices for this run"); break; }
      continue;
    }
    consecutive = 0; ok++;
    const p = parseProductPage(html);
    const pk = packOf(d.l, deals);
    // remember pages without a usable price too, so they aren't read again tomorrow
    items[d.l] = p && pk ? { n: d.n, p, pk, l: d.l, at: today } : { n: d.n, l: d.l, at: today, none: 1 };
    if (p && pk) found++;
  }
  for (const [k, v] of Object.entries(items)) if (!v.at || daysBetween(v.at, today) > KEEP_DAYS) delete items[k];
  const usable = Object.values(items).filter(v => v.p).length;
  log(`kupi usual prices: ${found} found on ${ok} product pages${failed ? `, ${failed} failed` : ""} (${usable} kept, ${queue.length} were due)`);
  return { items, ok, failed, found, usable, due: queue.length, errors: errors.slice(0, 5) };
}
