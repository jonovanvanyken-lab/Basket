// Read a recipe web page: schema.org Recipe JSON-LD first, then microdata, then ingredient-looking lists.
import { parse } from "node-html-parser";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export async function readRecipeUrl(url, { fetchImpl = fetch } = {}) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("only http(s) links");
  const res = await fetchImpl(u.href, { headers: { "user-agent": UA, accept: "text/html", "accept-language": "en,cs;q=0.8" }, redirect: "follow" });
  if (!res.ok) throw new Error(`the page answered HTTP ${res.status}`);
  const html = await res.text();
  return { url: u.href, ...extractRecipe(html) };
}

export function extractRecipe(html) {
  // 1. JSON-LD
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) {
    let data; try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const r = findRecipe(data);
    if (r && Array.isArray(r.recipeIngredient || r.ingredients)) {
      return { ok: true, title: text(r.name), servings: servingsOf(r.recipeYield), lines: (r.recipeIngredient || r.ingredients).map(text).filter(Boolean), how: "json-ld" };
    }
  }
  const root = parse(html);
  // 2. microdata
  const md = root.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]').map(e => clean(e.text)).filter(Boolean);
  if (md.length) return { ok: true, title: clean(root.querySelector('[itemprop="name"]')?.text || root.querySelector("h1")?.text || ""), servings: servingsOf(root.querySelector('[itemprop="recipeYield"]')?.text), lines: md, how: "microdata" };
  // 3. a list inside something called "ingredient"
  const box = root.querySelectorAll('[class*="ingredient"], [id*="ingredient"], [class*="ingredience"], [class*="suroviny"]');
  for (const b of box) {
    const lis = b.querySelectorAll("li").map(e => clean(e.text)).filter(t => t && t.length < 140);
    if (lis.length >= 2) return { ok: true, title: clean(root.querySelector("h1")?.text || ""), servings: 0, lines: lis, how: "list" };
  }
  return { ok: false, title: clean(root.querySelector("h1")?.text || root.querySelector("title")?.text || ""), servings: 0, lines: [], error: "No ingredient list found on that page. Paste the ingredients instead." };
}

function findRecipe(x, d = 0) {
  if (!x || typeof x !== "object" || d > 8) return null;
  if (Array.isArray(x)) { for (const y of x) { const r = findRecipe(y, d + 1); if (r) return r; } return null; }
  const t = x["@type"]; if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return x;
  for (const k of ["@graph", "mainEntity", "itemListElement", "item"]) if (x[k]) { const r = findRecipe(x[k], d + 1); if (r) return r; }
  return null;
}
const clean = s => String(s || "").replace(/\s+/g, " ").trim();
const text = v => clean(typeof v === "string" ? v.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ") : v?.text || v?.name || "");
function servingsOf(y) { const s = Array.isArray(y) ? y.join(" ") : String(y || ""); const m = s.match(/\d+/); return m ? +m[0] : 0; }
