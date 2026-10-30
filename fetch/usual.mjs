// Usual prices ("Běžná cena") from kupi.cz product search. One search per item, first page only:
// kupi.cz's robots.txt allows the first page of a search but not further pages.
import { parse } from "node-html-parser";
import { parsePack, num, daysBetween } from "../js/units.js";
import { baseName } from "../js/deals.js";

const BASE = "https://www.kupi.cz";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const KEEP_DAYS = 60;


export async function fetchUsual(queries, { fetchImpl = fetch, delay = () => Promise.resolve(), log = () => {}, prev = {}, today }) {
  const items = { ...(prev.items || {}) };
  let ok = 0, failed = 0, found = 0, consecutive = 0; const errors = [];
  for (const q of queries) {
    await delay();
    let html;
    try {
      const res = await fetchImpl(`${BASE}/hledej?f=${encodeURIComponent(q)}`, { headers: { "user-agent": UA, "accept-language": "cs-CZ,cs;q=0.9" }, redirect: "follow" });
      html = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      failed++; consecutive++; errors.push(`${q}: ${e.message}`);
      if (consecutive >= 6) { log("kupi search keeps failing; stopping usual prices for this run"); break; }
      continue;
    }
    consecutive = 0; ok++;
    for (const c of parseUsual(html)) { items[c.k] = { n: c.n, p: c.p, pk: c.pk, ...(c.l ? { l: c.l } : {}), at: today }; found++; }
  }
  for (const [k, v] of Object.entries(items)) if (!v.at || daysBetween(v.at, today) > KEEP_DAYS) delete items[k];
  log(`kupi usual prices: ${found} from ${ok} searches${failed ? `, ${failed} failed` : ""} (${Object.keys(items).length} kept)`);
  return { items, ok, failed, found, errors: errors.slice(0, 5) };
}

const clean = s => String(s || "").replace(/\s+/g, " ").trim();
const USUAL_RE = /Běžná cena\s*:?\s*(\d{1,3}(?:[  .]\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:Kč|,-)/i;

/** Product cards with a usual price on a kupi.cz search page. */
export function parseUsual(html) {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  let cards = root.querySelectorAll(".group_discounts").filter(g => /Běžná cena/i.test(g.text));
  if (!cards.length) {
    // the label sits outside the offer block: climb from each label to the element holding the product link
    const seen = new Set(); cards = [];
    for (const el of root.querySelectorAll("*")) {
      const t = clean(el.text);
      if (!/^Běžná cena/i.test(t) || t.length > 60) continue;
      let a = el;
      for (let i = 0; i < 8 && a.parentNode; i++) { a = a.parentNode; if (a.querySelector && a.querySelector("a[href*='/sleva/']")) break; }
      if (a && !seen.has(a)) { seen.add(a); cards.push(a); }
    }
  }
  const out = [];
  for (const g of cards) {
    const m = clean(g.text).match(USUAL_RE); if (!m) continue;
    const p = num(m[1]); if (!(p > 0)) continue;
    const nameEl = g.querySelector(".product_name strong") || g.querySelector(".product_name") || g.querySelector("a[href*='/sleva/'] strong") || g.querySelector("h2, h3, strong");
    const name = clean(nameEl?.text); if (!name || /^Běžná cena/i.test(name)) continue;
    const href = (g.querySelector(".product_name a") || g.querySelector("a[href*='/sleva/']"))?.getAttribute("href") || "";
    const link = /^\/sleva\/[\w\-/.%]+$/.test(href) ? href : (href.match(/^https?:\/\/www\.kupi\.cz(\/sleva\/[\w\-/.%]+)$/)?.[1] || "");
    // the pack the usual price is for: from the name, or the one size all offers on the card share
    let pk = parsePack(name);
    if (!pk) {
      const sizes = g.querySelectorAll(".discount_amount").map(e => parsePack(clean(e.text).replace(/^\/\s*/, ""))).filter(Boolean);
      const uniq = [...new Map(sizes.map(s => [`${s.v}${s.u}`, s])).values()];
      if (uniq.length === 1) pk = uniq[0];
    }
    out.push({ k: link || "n:" + baseName(name), n: name, l: link, p, pk: pk || null });
  }
  return out;
}
