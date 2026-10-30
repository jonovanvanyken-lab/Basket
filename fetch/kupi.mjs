// Leaflet deals from kupi.cz (an aggregator of Czech supermarket leaflets).
import { parse } from "node-html-parser";
import { parsePack, parseUnitPrice, num, czDate, norm, round2, perUnit } from "../js/units.js";
import { KUPI_CATS } from "../js/dict.js";

const BASE = "https://www.kupi.cz";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
export const FOOD_CATS = Object.keys(KUPI_CATS);

/** our store key → kupi.cz shop slug */
export const SHOP_SLUGS = { tesco: "tesco", albert: "albert", lidl: "lidl", kaufland: "kaufland", penny: "penny-market", billa: "billa" };

export async function fetchShop(store, { fetchImpl = fetch, log = () => {}, delay = () => Promise.resolve(), maxPages = 6, today = new Date() } = {}) {
  const slug = SHOP_SLUGS[store];
  const out = []; const seen = new Set(); const errors = [];
  for (const cat of FOOD_CATS) {
    for (let page = 1; page <= maxPages; page++) {
      const url = `${BASE}/slevy/${cat}/${slug}${page > 1 ? `?page=${page}` : ""}`;
      let html;
      try {
        await delay();
        const res = await fetchImpl(url, { headers: { "user-agent": UA, "accept-language": "cs-CZ,cs;q=0.9" }, redirect: "follow" });
        if (res.status === 404) break;
        html = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // past the last page kupi redirects back to page 1
        if (page > 1 && res.url && !/page=/.test(res.url)) break;
      } catch (e) { errors.push(`${cat} p${page}: ${e.message}`); log(`kupi ${store} ${cat} p${page}: ${e.message}`); break; }
      const deals = parseKupi(html, store, cat, today);
      let fresh = 0;
      for (const d of deals) { const k = `${d.n}|${d.p}|${d.f}|${d.a}`; if (!seen.has(k)) { seen.add(k); out.push(d); fresh++; } }
      if (!fresh) break;
    }
  }
  return { deals: out, errors };
}

const SHOP_NAME_TO_KEY = [[/albert/i, "albert"], [/lidl/i, "lidl"], [/tesco/i, "tesco"], [/kaufland/i, "kaufland"], [/penny/i, "penny"], [/billa/i, "billa"]];
const shopKey = name => { for (const [re, k] of SHOP_NAME_TO_KEY) if (re.test(name)) return k; return null; };

/** Parse one kupi.cz listing page into deals for `store`. */
export function parseKupi(html, store, cat, today = new Date()) {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  let groups = root.querySelectorAll(".group_discounts");
  if (!groups.length) groups = root.querySelectorAll('[class*="group_discount"], [class*="product_discount"], article[class*="product"]');
  const out = [];
  for (const g of groups) {
    const nameEl = g.querySelector(".product_name strong") || g.querySelector(".product_name") || g.querySelector("h2, h3, strong");
    const name = clean(nameEl?.text || ""); if (!name) continue;
    const href = (g.querySelector(".product_name a") || g.querySelector("a[href*='/sleva/']"))?.getAttribute("href") || "";
    const link = /^\/[\w\-/.%]+$/.test(href) ? href : "";
    let rows = g.querySelectorAll(".discount_row");
    if (!rows.length) rows = g.querySelectorAll('[class*="discount_row"], tr');
    if (!rows.length) rows = [g];
    let lastShop = null;
    for (const r of rows) {
      const shopName = clean(r.querySelector(".discounts_shop_name")?.text || "") || lastShop || "";
      lastShop = shopName || lastShop;
      const k = shopKey(shopName) || (rows.length === 1 ? store : null);
      if (k !== store) continue;
      const d = rowToDeal(name, shopName || store, clean(r.text), {
        price: clean(r.querySelector(".discount_price_value")?.text || ""),
        amount: clean(r.querySelector(".discount_amount")?.text || ""),
        validity: clean(r.querySelector(".discounts_validity")?.text || ""),
      }, today);
      if (d) { d.s = store; d.c = KUPI_CATS[cat] || "other"; d.kc = cat; if (link) d.l = link; out.push(d); }
    }
  }
  return out;
}
const clean = s => s.replace(/\s+/g, " ").trim();

/** One shop row: "39,90 Kč / 0.25 kg –33 % 159,60 Kč / 1 kg platí do neděle 18. 10." */
export function rowToDeal(name, shopName, text, parts = {}, today = new Date()) {
  const priceText = parts.price || text;
  const pm = priceText.match(/(\d{1,3}(?:[  .]\d{3})*,\d{2}|\d+[.,]\d{2}|\d+)\s*(?:Kč|,-)/i) || priceText.match(/(\d+,\d{2})/);
  if (!pm) return null;
  const price = num(pm[1]); if (!(price > 0)) return null;
  // amount: "/ 0.25 kg", "6x 0.33 l", "100 g", "/ 1 kg"
  const amountText = parts.amount || (text.match(/\/\s*((?:\d+\s*x\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|ks|dávek|davek|pd|praní))/i)?.[1]) || "";
  let pk = parsePack(amountText.replace(/^\s*\/\s*/, "")) || parsePack(name);
  if (!pk && /dáv|dav|pran/i.test(amountText)) { const m = amountText.match(/(\d+)/); if (m) pk = { v: +m[1], u: "ks" }; }
  const unitMatches = [...text.matchAll(/(\d[\d  ]*,\d{2})\s*Kč\s*\/\s*(\d+(?:[.,]\d+)?)?\s*(kg|g|l|ml|ks|dávk\w*|davk\w*)/gi)];
  let u = null;
  // the unit price is the one quoted per 1 kg / 1 l / 100 g, usually the last
  for (const m of unitMatches.reverse()) { const x = parseUnitPrice(m[0]); if (x) { u = x; break; } }
  if (!u && pk) u = perUnit(price, pk);
  const loose = pk && pk.v === 1000 && /\/\s*1\s*kg/i.test(amountText || text) && /voln|váh|vah/i.test(name + text) ? true : false;
  const dm = text.match(/[–−-]\s?(\d{1,2})\s?%/);
  const vt = parts.validity || (text.match(/platí[^]*$/i)?.[0] || "");
  const fromM = vt.match(/od\s+[^\d]*(\d{1,2}\.\s*\d{1,2}\.)/i), toM = vt.match(/do\s+[^\d]*(\d{1,2}\.\s*\d{1,2}\.(?:\s*\d{4})?)/i);
  const until = toM ? czDate(toM[1], today) : /dnes/i.test(vt) ? czDate("dnes", today) : null;
  const from = fromM ? czDate(fromM[1], today) : null;
  const app = /aplikac|lidl plus|s kartou|kartou|clubcard|card\b|věrnost|vernost/i.test(text);
  const d = { n: name, f: shopName, p: round2(price), a: amountText.replace(/^\s*\/\s*/, ""), pk: loose ? null : pk };
  if (u) d.u = u;
  if (dm) d.d = +dm[1];
  if (until) d.until = until;
  if (from && (!until || from <= until)) d.from = from;
  if (app) d.app = true;
  return d;
}
