// Turning recognised receipt text (Lidl, Albert, Tesco, Kaufland, Penny, Billa) into priced items.
import { num, norm, parsePack, round2, iso } from "./units.js";
import { findItem } from "./match.js";

const STORE_RE = [["lidl", /\blidl\b/i], ["albert", /\balbert\b|ahold/i], ["tesco", /\btesco\b/i], ["kaufland", /kaufland/i], ["penny", /\bpenny\b/i], ["billa", /\bbilla\b/i]];
const SKIP = /(dph|d\.p\.h|celkem|mezisou|k uhrad|platb|platebn|karta|kartou|hotov|vracen|vraceno|eet|bkp|fik|pokladn|i[cč]o|di[cč]|dekujem|děkujem|tel\.|www|zaokrouhl|souhrn|sazba|zaklad|základ|transakc|terminal|autoriz|visa|mastercard|maestro|contactless|bezkontakt|ucten|účten|kopie|prodejn|provozovn|ulice|psc|nakup c|vas nakup|body|clubcard|lidl plus|usetril|ušetřil|sleva celkem|zakaznik|zákazník|cislo|číslo|datum|cas |čas )/i;
const PRICE_END = /(-?\d{1,4}(?:[ .]\d{3})*[.,]\d{2})\s*(?:k[cč]|czk)?\s*([A-D]|\d{1,2}\s?%|[*#])?\s*$/i;
const QTY_LINE = /^(\d+(?:[.,]\d+)?)\s*(ks|x|kg|kus)?\s*[x×*]\s*(\d+[.,]\d{2})/i;

export function detectStore(text) { for (const [k, re] of STORE_RE) if (re.test(text)) return k; return null; }

export function findTotal(lines) {
  for (const l of lines) {
    const n = norm(l);
    if (/(celkem|k uhrade|k zaplaceni|total|suma|celk\.)/.test(n) && !/dph|sleva/.test(n)) { const m = l.match(PRICE_END); if (m) return num(m[1]); }
  }
  return null;
}
export function findDate(text) {
  const m = text.match(/\b(\d{1,2})\s?\.\s?(\d{1,2})\s?\.\s?(\d{4}|\d{2})\b/);
  if (!m) return null;
  let y = +m[3]; if (y < 100) y += 2000;
  const d = new Date(y, +m[2] - 1, +m[1]);
  return isNaN(d) ? null : iso(d);
}

/**
 * Parse receipt text into lines: {text, price (line total), qty, unitPrice, weightKg, pack, item}
 */
export function parseReceipt(text, custom = []) {
  const lines = String(text).split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const store = detectStore(text), total = findTotal(lines), date = findDate(text);
  const out = [];
  let pendingQty = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const q = l.match(QTY_LINE);
    if (q) {
      const qty = num(q[1]), unitP = num(q[3]), isKg = /kg/i.test(q[2] || "") || /kg/i.test(l) || (qty % 1 !== 0);
      const prev = out[out.length - 1];
      // quantity line printed under its item ("2 x 24,90") or above it
      if (prev && !prev.qtyLine && Math.abs(round2(qty * unitP) - prev.price) < 0.06) { Object.assign(prev, qtyInfo(qty, unitP, isKg)); prev.qtyLine = true; }
      else pendingQty = qtyInfo(qty, unitP, isKg);
      // a line can hold both qty and total at the end ("2 x 24,90 49,80")
      continue;
    }
    if (SKIP.test(l)) continue;
    const m = l.match(PRICE_END);
    if (!m) continue;
    const price = num(m[1]);
    let name = l.slice(0, m.index).replace(/[\s.:*]+$/, "").trim();
    if (!name || name.length < 3 || !/[a-zá-ž]{2}/i.test(name)) continue;
    if (price < 0 || /^(sleva|zlevn|akce|kupon|bonus|vratn|zaloh)/i.test(norm(name))) {
      // discount applies to the item above
      const prev = out[out.length - 1];
      if (prev && price < 0) { prev.price = round2(prev.price + price); prev.discount = round2((prev.discount || 0) + price); }
      continue;
    }
    if (price > 5000) continue;
    const row = { text: name, price, qty: 1, unitPrice: price, weightKg: null, pack: parsePack(name), item: findItem(name, custom) };
    if (pendingQty) { Object.assign(row, pendingQty); pendingQty = null; row.qtyLine = true; }
    out.push(row);
  }
  for (const r of out) if (r.weightKg) { r.pack = { v: Math.round(r.weightKg * 1000), u: "g" }; r.loose = true; }
  return { store, total, date, rows: out };
}
function qtyInfo(qty, unitP, isKg) { return isKg ? { qty: 1, weightKg: qty, unitPrice: unitP, perKg: unitP } : { qty, unitPrice: unitP }; }
