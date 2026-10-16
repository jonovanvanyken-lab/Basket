// Reading ingredient lines ("2 cups plain flour", "500 g kuřecích stehen", "3 cloves garlic, crushed")
import { num, norm, round } from "./units.js";
import { findItemByName } from "./match.js";

// unit word → [base, factor] ; "vol" units are ml, converted to g with the item's density when needed
const UNITS = [
  [/^(kg|kgs|kilo|kilos|kilograms?)$/, "g", 1000], [/^(g|gr|gram|grams|grammes?|gramu|gramy)$/, "g", 1], [/^(dkg|dag)$/, "g", 10],
  [/^(mg)$/, "g", 0.001], [/^(lb|lbs|pounds?)$/, "g", 453.6], [/^(oz|ounces?)$/, "g", 28.35],
  [/^(l|litres?|liters?|litr|litru|litry)$/, "ml", 1000], [/^(ml|millilitres?|milliliters?|mls)$/, "ml", 1], [/^(dl)$/, "ml", 100], [/^(cl)$/, "ml", 10],
  [/^(cups?|c|hrnek|hrnky|hrnku|hrnec)$/, "ml", 250], [/^(tbsp|tbs|tbl|tablespoons?|lzic|lzice|lzic|lzicky?|pl)$/, "ml", 15],
  [/^(tsp|teaspoons?|lzick|lzicka|lzicky|lzicek|kl|cl\.)$/, "ml", 5], [/^(fl ?oz)$/, "ml", 29.6], [/^(pinch|pinches|spetk|spetka|spetky|dash)$/, "ml", 0.5],
  [/^(cloves?|strouz|strouzek|strouzky|strouzku)$/, "clove", 1],
  [/^(cans?|tins?|plechovk|plechovka|plechovky|konzerv|konzerva|konzervy)$/, "can", 1],
  [/^(packets?|packs?|packages?|pkt|baleni|balicek|balicky|sacek|sacky)$/, "pack", 1],
  [/^(bunch|bunches|svazek|svazky|svazku|hrst|handful|handfuls)$/, "bunch", 1],
  [/^(slices?|platky?|platek|platku)$/, "slice", 1],
  [/^(pieces?|pcs|pc|ks|kus|kusy|kusu|whole|large|medium|small|big|velk|stredni|mal)$/, "ks", 1],
  [/^(sprigs?|stalks?|sticks?|stems?|leaves|lists?|snitk)$/, "ks", 1],
];
const unitOf = w => { const n = norm(w).replace(/\.$/, ""); for (const [re, b, f] of UNITS) if (re.test(n)) return [b, f]; return null; };

const FRACTION = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+[.,]\\d+|\\d+[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])";
const QTY_RE = new RegExp(`^(${FRACTION})(?:\\s*(?:-|–|to|až|az)\\s*(${FRACTION}))?\\s*(?:x\\s*)?`, "i");

/**
 * Parse one ingredient line.
 * Returns {raw, name, qty:{v,u}|null (in the item's base unit when an item is known), item, note, optional}
 */
export function parseLine(raw, custom = []) {
  let s = String(raw).replace(/^[\s•\-–*·▢□☐◦]+/, "").replace(/\(([^)]*)\)/g, " ($1) ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const optional = /\b(optional|to serve|for serving|to garnish|for garnish|nepovinn|podle chuti|dle chuti|to taste)\b/i.test(s);
  let amount = null, unit = null, factor = 1;
  const m = s.match(QTY_RE);
  if (m) {
    const a = num(m[1].replace(/\s+/, " ")), b = m[2] ? num(m[2]) : NaN;
    amount = isFinite(b) ? (a + b) / 2 : a; // a range uses the midpoint
    s = s.slice(m[0].length).trim();
    // "1 (400 g) can tomatoes": keep the bracketed size, then read the unit word
    const br = s.match(/^\(([^)]*)\)\s*/); if (br) s = s.slice(br[0].length);
    // "500g" stuck together is handled because the regex stops at the unit letters
    const um = s.match(/^([a-zA-ZÀ-ž.]+(?:\s?oz)?)\b\.?\s*/);
    if (um) { const u = unitOf(um[1]); if (u) { [unit, factor] = u; s = s.slice(um[0].length).trim(); } }
    s = s.replace(/^(of|z|ze)\s+/i, "");
  }
  // name = text before a comma / "for ..." note
  const head = s.split(/,|;| – | - |\bfor\b|\bna\b/i)[0];
  const name = head.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim() || s;
  const note = s.slice(head.length).replace(/^[\s,;–-]+/, "").trim();
  // "2 (400 g) cans tomatoes" → a weight inside brackets beats the count
  const inner = raw.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i);
  const it = findItemByName(name, custom) || findItemByName(s, custom);
  let qty = null;
  if (amount != null && isFinite(amount)) {
    if ((unit === "can" || unit === "pack") && inner) {
      const u = unitOf(inner[2]); qty = { v: num(inner[1]) * u[1] * amount, u: u[0] };
    } else if (unit) qty = { v: amount * factor, u: unit };
    else qty = { v: amount, u: "ks" };
  }
  return { raw: String(raw).trim(), name, note, optional, item: it, qty: it && qty ? toItemUnit(qty, it) : qty };
}

/** Convert a parsed quantity into the item's own base unit (g, ml or ks). */
export function toItemUnit(q, it) {
  if (!q || !it) return q;
  let { v, u } = q;
  if (u === it.unit) return { v: round(v), u };
  if (u === "clove") { if (it.e) return conv({ v: v * it.e, u: "g" }, it); return { v, u: "ks" }; }
  if (u === "can" || u === "pack" || u === "bunch" || u === "slice") return { v: v * it.pack, u: it.unit };
  return conv({ v, u }, it);
}
function conv({ v, u }, it) {
  const to = it.unit;
  if (u === to) return { v: round(v), u };
  if (u === "ml" && to === "g") return { v: round(v * (it.d || 1)), u: "g" };
  if (u === "g" && to === "ml") return { v: round(v / (it.d || 1)), u: "ml" };
  if (u === "ks" && to === "g") return { v: round(v * (it.e || it.pack)), u: "g" };
  if (u === "g" && to === "ks") return { v: round(Math.max(1, v / (it.e || it.pack))), u: "ks" };
  if (u === "ks" && to === "ml") return { v: round(v * it.pack), u: "ml" };
  if (u === "ml" && to === "ks") return { v: round(Math.max(1, v / ((it.e || 0) / (it.d || 1) || it.pack))), u: "ks" };
  return { v, u };
}

/** Split pasted recipe text into title, servings and ingredient lines. */
export function parseRecipe(text, custom = []) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim());
  let title = "", servings = 0, inIng = null;
  const ing = [];
  for (const l of lines) {
    if (!l) continue;
    const ln = norm(l);
    const sv = ln.match(/(?:serves|servings|portions?|porc[ie]?|pro)\s*:?\s*(\d+)|(\d+)\s*(?:servings|portions?|porc)/);
    if (sv && !servings) { servings = +(sv[1] || sv[2]); continue; }
    if (/^(ingredients|ingredience|suroviny|potrebujeme|budete potrebovat)\b/.test(ln)) { inIng = true; continue; }
    if (/^(method|instructions|directions|steps|preparation|postup|priprava|navod|step 1)\b/.test(ln)) { inIng = false; continue; }
    if (inIng === false) continue;
    if (!title && !/^\d/.test(l) && !/^[\s•\-–*]/.test(l) && inIng === null && ing.length === 0 && l.length < 90) { title = l; continue; }
    const p = parseLine(l, custom);
    if (!p) continue;
    const both = p.name.split(/\s+(?:and|&|a|nebo|or)\s+/i);
    if (both.length === 2 && !p.qty) {
      const a = parseLine(both[0] + (p.note ? ", " + p.note : ""), custom), b = parseLine(both[1] + (p.note ? ", " + p.note : ""), custom);
      if (a?.item && b?.item && a.item.id !== b.item.id) { a.raw = b.raw = p.raw; ing.push(a, b); continue; }
    }
    // without an "Ingredients" heading, keep lines that look like ingredients
    if (inIng === null && !p.item && !QTY_RE.test(l.replace(/^[\s•\-–*]+/, ""))) continue;
    if (l.length > 140) continue;
    ing.push(p);
  }
  return { title, servings, lines: ing };
}
