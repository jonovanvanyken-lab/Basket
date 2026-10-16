// Units, pack sizes and money formatting. Shared by the app and the price-fetch job (no DOM use here).

/** Lowercase, strip Czech diacritics, collapse whitespace. */
export function norm(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
}

/** "1 234,50" / "1,5" / "0.25" / "½" → number, or NaN. */
export function num(s) {
  if (typeof s === "number") return s;
  const raw = String(s ?? "").trim();
  if (/^\d+ \d+\/\d+$/.test(raw)) { const [w, f] = raw.split(" "); return +w + num(f); }
  let t = raw.replace(/[   ]/g, "");
  const frac = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };
  for (const [k, v] of Object.entries(frac)) {
    if (t === k) return v;
    if (t.endsWith(k)) return (parseFloat(t.slice(0, -1)) || 0) + v;
  }
  if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split("/").map(Number); return b ? a / b : NaN; }
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, "");
  t = t.replace(",", ".");
  return /^-?\d*\.?\d+$/.test(t) ? parseFloat(t) : NaN;
}

const UNIT_ALIASES = {
  g: ["g", "gr", "gram", "gramy", "gramu", "grams", "gramm"],
  dkg: ["dkg", "dag"],
  kg: ["kg", "kilo", "kilogram", "kilograms"],
  ml: ["ml"], cl: ["cl"], dl: ["dl"],
  l: ["l", "litr", "litry", "litru", "liter", "litre", "litres", "liters"],
  ks: ["ks", "kus", "kusy", "kusu", "pcs", "pc", "pk", "x"],
};
const UNIT_FACTOR = { g: ["g", 1], dkg: ["g", 10], kg: ["g", 1000], ml: ["ml", 1], cl: ["ml", 10], dl: ["ml", 100], l: ["ml", 1000], ks: ["ks", 1] };
const UNIT_RE_PART = "kg|dkg|dag|g|ml|cl|dl|l|ks|pcs";

function canonUnit(u) {
  u = norm(u).replace(/\.$/, "");
  for (const [k, list] of Object.entries(UNIT_ALIASES)) if (list.includes(u)) return k === "x" ? "ks" : k;
  return null;
}

/**
 * Pack size from a product title or an amount string.
 * "Tesco Máslo 82% tuku 250g" → {v:250,u:"g"} ; "6x 0.33 l" → {v:1980,u:"ml"} ; "10 ks" → {v:10,u:"ks"}
 */
export function parsePack(text) {
  const t = norm(text).replace(/(\d),(\d)/g, "$1.$2");
  const multi = [...t.matchAll(new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_RE_PART})\\b`, "g"))];
  if (multi.length) {
    const m = multi[multi.length - 1];
    const cu = canonUnit(m[3]); if (cu) { const [b, f] = UNIT_FACTOR[cu]; return { v: round(+m[1] * +m[2] * f), u: b, n: +m[1] }; }
  }
  const all = [...t.matchAll(new RegExp(`(?:^|[^\\d.])(\\d+(?:\\.\\d+)?)\\s*(${UNIT_RE_PART})(?![a-z])`, "g"))];
  for (let i = all.length - 1; i >= 0; i--) {
    const cu = canonUnit(all[i][2]); if (!cu) continue;
    const v = +all[i][1]; if (!(v > 0)) continue;
    const [b, f] = UNIT_FACTOR[cu]; return { v: round(v * f), u: b };
  }
  return null;
}

/** "111,60 Kč/kg", "29,90 Kč / 100 g", "45,40 Kč / 1 l", "4,49 Kč / 1 dávka" → {p, per:"kg"|"l"|"ks"} normalised per kg / l / piece. */
export function parseUnitPrice(text) {
  const t = norm(text);
  const m = t.match(/(\d[\d ]*(?:[.,]\d{1,2})?)\s*(?:kc|czk)\s*\/\s*(\d+(?:[.,]\d+)?)?\s*([a-z]+)/);
  if (!m) return null;
  const p = num(m[1]); const q = m[2] ? num(m[2]) : 1; const cu = canonUnit(m[3]);
  if (!(p > 0)) return null;
  if (!cu) return { p: p / q, per: "ks" };
  const [b, f] = UNIT_FACTOR[cu];
  const baseQty = q * f; // in g / ml / ks
  if (b === "g") return { p: round2((p / baseQty) * 1000), per: "kg" };
  if (b === "ml") return { p: round2((p / baseQty) * 1000), per: "l" };
  return { p: round2(p / baseQty), per: "ks" };
}

/** Price per kg / l / piece for a pack. */
export function perUnit(price, pack) {
  if (!pack || !(pack.v > 0) || !(price >= 0)) return null;
  if (pack.u === "g") return { p: round2((price / pack.v) * 1000), per: "kg" };
  if (pack.u === "ml") return { p: round2((price / pack.v) * 1000), per: "l" };
  return { p: round2(price / pack.v), per: "ks" };
}

export const baseOf = per => (per === "kg" ? "g" : per === "l" ? "ml" : "ks");
export const perOf = base => (base === "g" ? "kg" : base === "ml" ? "l" : "ks");

/** Format a quantity in base units: 1500 g → "1.5 kg", 250 ml → "250 ml", 3 ks → "3 ks". */
export function fmtQty(v, u) {
  if (!(v > 0)) return "";
  if (u === "g") return v >= 1000 ? `${trim(v / 1000)} kg` : `${trim(v)} g`;
  if (u === "ml") return v >= 1000 ? `${trim(v / 1000)} l` : `${trim(v)} ml`;
  return `${trim(v)} ks`;
}
function trim(x) { return String(Math.round(x * 100) / 100).replace(".", ","); }
export const round = x => Math.round(x * 1000) / 1000;
export const round2 = x => Math.round(x * 100) / 100;

const KC = typeof Intl !== "undefined" ? new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
const KC0 = typeof Intl !== "undefined" ? new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }) : null;
/** 27.9 → "27,90 Kč" */
export function kc(n, whole = false) {
  if (n == null || !isFinite(n)) return "–";
  const s = whole ? KC0.format(Math.round(n)) : KC.format(n);
  return `${s.replace(/\s/g, " ")} Kč`;
}
export function kcPer(u) { return u ? `${kc(u.p)}/${u.per}` : ""; }

/** ISO date (local) */
export function iso(d = new Date()) {
  const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5); }

/**
 * Czech leaflet validity → ISO date. "platí do neděle 18. 10." → "2026-10-18".
 * Year is inferred: a date more than ~5 months in the past rolls to next year.
 */
export function czDate(text, today = new Date()) {
  const t = norm(text);
  if (/\bdnes\b/.test(t)) return iso(today);
  if (/\bzitra\b/.test(t)) { const d = new Date(today); d.setDate(d.getDate() + 1); return iso(d); }
  const m = t.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.(?:\s*(\d{4}))?/);
  if (!m) return null;
  const d = +m[1], mo = +m[2]; if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return null;
  let y = m[3] ? +m[3] : today.getFullYear();
  if (!m[3]) {
    const cand = new Date(y, mo - 1, d);
    const diff = (cand - today) / 864e5;
    if (diff < -150) y += 1; else if (diff > 210) y -= 1;
  }
  return iso(new Date(y, mo - 1, d));
}
