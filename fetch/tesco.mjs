// Tesco CZ (nakup.itesco.cz) product search. Tries Tesco's GraphQL gateway first, then the
// server-rendered search page. Both read the same public data the website shows shoppers.
import { parse } from "node-html-parser";
import { parsePack, parseUnitPrice, num, czDate, norm, round2 } from "../js/units.js";

const SITE = "https://nakup.itesco.cz";
const XAPI = "https://xapi.tesco.com/";
const UK_PUBLIC_KEY = "TvOSZJHlEk0pjniDGQFAc9Q59WGAR4dA"; // public key from Tesco's web app; rotates ~monthly
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const SEARCH = `query Search($query: String!, $page: Int = 1, $count: Int) {
  search(query: $query, page: $page, count: $count) {
    results { node { __typename ... on ProductInterface {
      tpnc tpnb title brandName isForSale productType
      sellers { results { price { actual unitPrice unitOfMeasure } promotions { description startDate endDate attributes price { afterDiscount beforeDiscount } } } }
    } } }
  }
}`;

export class Tesco {
  constructor({ fetchImpl = fetch, log = () => {}, count = 24 } = {}) {
    this.f = fetchImpl; this.log = log; this.count = count;
    this.method = null; // "xapi" | "html" once one works
    this.key = process.env.TESCO_API_KEY || null;
    this.failures = { xapi: 0, html: 0 };
    this.notes = [];
  }

  async discoverKey() {
    if (this.key) return this.key;
    try {
      const html = await this.get(`${SITE}/shop/cs-CZ`);
      const m = html.match(/["']?(?:apiKey|apikey|x-apikey|xApiKey)["']?\s*[:=]\s*["']([A-Za-z0-9]{24,40})["']/);
      if (m) { this.key = m[1]; this.notes.push("found the site's API key"); return this.key; }
    } catch (e) { this.notes.push("key lookup failed: " + e.message); }
    this.key = UK_PUBLIC_KEY; return this.key;
  }

  async get(url) {
    const res = await this.f(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "cs-CZ,cs;q=0.9,en;q=0.6" }, redirect: "follow" });
    const text = await res.text();
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; e.body = text.slice(0, 300); throw e; }
    return text;
  }

  async viaXapi(query) {
    const key = await this.discoverKey();
    const body = JSON.stringify([{ operationName: "Search", variables: { query, page: 1, count: this.count }, extensions: { mfeName: "mfe-plp" }, query: SEARCH }]);
    const res = await this.f(XAPI, { method: "POST", body, headers: {
      "user-agent": UA, accept: "application/json", "content-type": "application/json", "accept-language": "cs-CZ",
      "x-apikey": key, region: "CZ", language: "cs-CZ", origin: SITE, referer: SITE + "/" } });
    const text = await res.text();
    if (!res.ok) { const e = new Error(`xapi HTTP ${res.status}`); e.status = res.status; e.body = text.slice(0, 200); throw e; }
    const json = JSON.parse(text); const first = Array.isArray(json) ? json[0] : json;
    if (first?.errors?.length) throw new Error("xapi: " + (first.errors[0].message || "error"));
    const results = first?.data?.search?.results || [];
    return results.map(r => fromNode(r.node)).filter(Boolean);
  }

  async viaHtml(query) {
    const url = `${SITE}/shop/cs-CZ/search?query=${encodeURIComponent(query)}&count=${this.count}`;
    const html = await this.get(url);
    if (/captcha|access denied|pardon our interruption|bot detection/i.test(html.slice(0, 5000)) && !/\/products\/\d/.test(html)) {
      const e = new Error("blocked by bot check"); e.status = 403; throw e;
    }
    return parseTescoHtml(html);
  }

  /** Search one term. Returns products [{id,t,p,u,per,pk,loose,cc,ccU,ccUntil,promo,promoUntil,avail}] */
  async search(query) {
    const order = this.method ? [this.method] : ["xapi", "html"];
    let lastErr = null;
    for (const m of order) {
      try {
        const out = m === "xapi" ? await this.viaXapi(query) : await this.viaHtml(query);
        if (out.length || this.method === m) { if (!this.method) { this.method = m; this.notes.push(`using ${m}`); } return out; }
        lastErr = new Error(`${m}: no products`);
      } catch (e) { lastErr = e; this.failures[m]++; this.log(`tesco ${m} "${query}": ${e.message}`); }
    }
    // the remembered method stopped working: try the other one once
    if (this.method) { const other = this.method === "xapi" ? "html" : "xapi"; try { const out = other === "xapi" ? await this.viaXapi(query) : await this.viaHtml(query); if (out.length) { this.method = other; this.notes.push(`switched to ${other}`); return out; } } catch (e) { lastErr = e; } }
    throw lastErr || new Error("no products");
  }
}

/** GraphQL ProductInterface node → our product shape */
export function fromNode(n) {
  if (!n || !n.tpnc || !n.title) return null;
  const s = n.sellers?.results?.[0] || {};
  const price = s.price?.actual ?? n.price?.actual ?? n.price?.price;
  if (!(price > 0)) return null;
  const uom = norm(s.price?.unitOfMeasure || n.price?.unitOfMeasure || "");
  const per = /kg/.test(uom) ? "kg" : /^l|litr/.test(uom) ? "l" : uom ? "ks" : null;
  const p = { id: String(n.tpnc), t: n.title, p: round2(price), pk: parsePack(n.title) };
  const up = s.price?.unitPrice ?? n.price?.unitPrice;
  if (up > 0 && per) { p.u = round2(up); p.per = per; }
  if (n.productType && /loose|weight|catch/i.test(n.productType)) p.loose = true;
  if (!p.pk && p.per && p.u && Math.abs(p.u - p.p) < 0.01) p.loose = true;
  if (n.isForSale === false) p.avail = false;
  for (const pr of s.promotions || n.promotions || []) applyPromo(p, pr.description || "", pr.price?.afterDiscount, pr.endDate, (pr.attributes || []).join(" "));
  return p;
}

function applyPromo(p, desc, after, end, attrs = "") {
  const until = end ? String(end).slice(0, 10) : czDate(desc.split(/\bdo\b|until/i).pop() || "");
  const isCc = /clubcard/i.test(desc + " " + attrs);
  let ccPrice = after > 0 ? after : null;
  if (!ccPrice) { const m = desc.match(/(\d+(?:[ .]\d{3})*[.,]\d{2})\s*Kč/); if (m && !/\d+\s*za\s*\d/.test(norm(desc))) ccPrice = num(m[1]); }
  if (isCc && ccPrice && ccPrice < p.p) { p.cc = round2(ccPrice); p.ccUntil = until || null; if (p.u) p.ccU = round2(p.u * (p.cc / p.p)); return; }
  if (ccPrice && ccPrice < p.p && !/\d+\s*za\s*\d/.test(norm(desc))) { p.was = p.p; p.p = round2(ccPrice); if (p.u) p.u = round2(p.u * (ccPrice / p.was)); p.promoUntil = until || null; p.promo = desc.slice(0, 80); return; }
  if (desc) { p.promo = desc.slice(0, 80); p.promoUntil = until || null; }
}

/**
 * Parse the server-rendered search page. Strategy 1: product JSON embedded in <script> tags.
 * Strategy 2: product tiles in the markup (links to /products/<id> with prices nearby).
 */
export function parseTescoHtml(html) {
  const fromJson = scanJson(html);
  if (fromJson.length) return fromJson;
  return scanTiles(html);
}

function scanJson(html) {
  const out = new Map();
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) {
    let body = m[1].trim(); if (!body || body.length < 50) continue;
    if (!/tpnc|"price"|unitPrice/.test(body)) continue;
    const eq = body.match(/^(?:window\.[\w$.]+|var\s+\w+|self\.\w+)\s*=\s*/); if (eq) body = body.slice(eq[0].length).replace(/;\s*$/, "");
    let data; try { data = JSON.parse(body); } catch { continue; }
    walk(data, n => { const p = nodeToProduct(n); if (p && !out.has(p.id)) out.set(p.id, p); }, 0);
  }
  return [...out.values()];
}
function walk(x, fn, d) {
  if (!x || typeof x !== "object" || d > 40) return;
  if (Array.isArray(x)) { for (const y of x) walk(y, fn, d + 1); return; }
  fn(x);
  for (const v of Object.values(x)) if (v && typeof v === "object") walk(v, fn, d + 1);
}
function nodeToProduct(n) {
  if (!(n.tpnc || n.id) || typeof n.title !== "string") return null;
  if (n.sellers || n.price) {
    const p = fromNode({ ...n, tpnc: n.tpnc || n.id });
    if (p) return p;
  }
  return null;
}

const PRICE = "(\\d{1,3}(?:[ \\u00a0]\\d{3})*,\\d{2})\\s*Kč";
function scanTiles(html) {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const links = root.querySelectorAll('a[href*="/products/"]');
  const byId = new Map();
  for (const a of links) {
    const id = (a.getAttribute("href") || "").match(/\/products\/(\d+)/)?.[1]; if (!id) continue;
    const t = a.text.replace(/\s+/g, " ").trim();
    const cur = byId.get(id) || { id, a, t: "" };
    if (t.length > cur.t.length) { cur.t = t; cur.a = a; }
    byId.set(id, cur);
  }
  const out = [];
  for (const { id, a, t } of byId.values()) {
    if (!t) continue;
    // climb to the tile: the largest ancestor that only links to this product
    let el = a, tile = a;
    for (let i = 0; i < 12 && el.parentNode; i++) {
      el = el.parentNode;
      const ids = new Set(el.querySelectorAll('a[href*="/products/"]').map(x => (x.getAttribute("href") || "").match(/\/products\/(\d+)/)?.[1]).filter(Boolean));
      if (ids.size > 1) break;
      tile = el;
    }
    const text = tile.text.replace(/\s+/g, " ").trim();
    const p = tileText(id, t, text);
    if (p) out.push(p);
  }
  return out;
}

/** Read price, unit price, Clubcard price and offers from a tile's text. */
export function tileText(id, title, text) {
  const rest = text.replace(title, " ");
  const unitM = rest.match(new RegExp(PRICE + "\\s*\\/\\s*(\\d+\\s*)?(kg|g|l|ml|ks|kus)", "i"));
  const prices = [...rest.matchAll(new RegExp(PRICE + "(?!\\s*\\/)", "g"))].map(m => ({ v: num(m[1]), i: m.index }));
  const ccM = rest.match(new RegExp("Clubcard[^0-9]{0,40}?" + PRICE + "(?!\\s*\\/)", "i")) || rest.match(new RegExp(PRICE + "(?!\\s*\\/)[^0-9/]{0,25}Clubcard", "i"));
  const multi = rest.match(new RegExp("(\\d+)\\s*(?:ks\\s*)?za\\s*" + PRICE, "i"));
  const cc = ccM ? num(ccM[1]) : null;
  const regular = prices.find(x => x.v !== cc && !(multi && x.v === num(multi[2])));
  if (!regular) return null;
  const p = { id, t: title, p: regular.v, pk: parsePack(title) };
  if (unitM) { const u = parseUnitPrice(unitM[0]); if (u) { p.u = u.p; p.per = u.per; } }
  if (/voln|na vah|vazen|cca\b/i.test(norm(title)) || (!p.pk && p.u && Math.abs(p.u - p.p) < 0.01)) p.loose = true;
  const untilM = rest.match(/do\s+(\d{1,2}\s*\.\s*\d{1,2}\s*\.(?:\s*\d{4})?)/i) || rest.match(/until\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const until = untilM ? (untilM.length === 4 ? `${untilM[3]}-${untilM[2].padStart(2, "0")}-${untilM[1].padStart(2, "0")}` : czDate(untilM[1])) : null;
  if (cc && cc < p.p) { p.cc = cc; p.ccUntil = until; if (p.u) p.ccU = round2(p.u * (cc / p.p)); }
  if (multi) { p.promo = `${multi[1]} za ${multi[2]} Kč`; p.promoUntil = until; }
  if (/nedostupn|vyprodan|není skladem|neni skladem/i.test(rest)) p.avail = false;
  return p;
}
