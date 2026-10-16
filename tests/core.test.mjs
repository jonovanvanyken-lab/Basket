import test from "node:test";
import assert from "node:assert/strict";
import { parsePack, parseUnitPrice, perUnit, czDate, num, kc } from "../js/units.js";
import { findItem, findItemByName, matches } from "../js/match.js";
import { BY_ID, ITEMS } from "../js/dict.js";
import { parseLine, parseRecipe } from "../js/recipe.js";
import { parseReceipt } from "../js/receipt.js";
import { buildIndex, makePlan, costFor, assignment } from "../js/plan.js";

test("numbers", () => {
  assert.equal(num("1 234,50"), 1234.5); assert.equal(num("1,5"), 1.5); assert.equal(num("½"), 0.5);
  assert.equal(num("1½"), 1.5); assert.equal(num("3/4"), 0.75); assert.equal(num("1 1/2"), 1.5);
});

test("pack sizes", () => {
  assert.deepEqual(parsePack("Tesco Máslo 82% tuku 250g"), { v: 250, u: "g" });
  assert.deepEqual(parsePack("Coca-Cola 1,5l"), { v: 1500, u: "ml" });
  assert.deepEqual(parsePack("6x 0.33 l"), { v: 1980, u: "ml", n: 6 });
  assert.deepEqual(parsePack("Vejce M 10 ks"), { v: 10, u: "ks" });
  assert.deepEqual(parsePack("Kuřecí prsní řízky 1 kg"), { v: 1000, u: "g" });
  assert.equal(parsePack("Banány volné"), null);
});

test("unit prices", () => {
  assert.deepEqual(parseUnitPrice("111,60 Kč/kg"), { p: 111.6, per: "kg" });
  assert.deepEqual(parseUnitPrice("29,90 Kč / 100 g"), { p: 299, per: "kg" });
  assert.deepEqual(parseUnitPrice("45,40 Kč / 1 l"), { p: 45.4, per: "l" });
  assert.deepEqual(perUnit(27.9, { v: 250, u: "g" }), { p: 111.6, per: "kg" });
});

test("leaflet dates", () => {
  const today = new Date(2026, 9, 16);
  assert.equal(czDate("platí do neděle 18. 10.", today), "2026-10-18");
  assert.equal(czDate("platí do 3. 1.", new Date(2026, 11, 28)), "2027-01-03");
  assert.equal(czDate("platí dnes", today), "2026-10-16");
});

test("dictionary is well formed", () => {
  assert.ok(ITEMS.length > 150, "items: " + ITEMS.length);
  const ids = new Set(); for (const x of ITEMS) { assert.ok(!ids.has(x.id), "dup " + x.id); ids.add(x.id); assert.ok(x.m.length, "no stems " + x.id); assert.ok(["g", "ml", "ks"].includes(x.unit), x.id); }
});

test("product names find the right item", () => {
  const cases = [
    ["Tesco Máslo 82% tuku 250g", "butter"], ["Alfa Přepuštěné máslo 200g", null], ["Máslový croissant 52g", null],
    ["Rama Máslová příchuť 400g", "margarine"], ["Kuřecí prsní řízky", "chicken-breast"], ["Kuřecí horní stehna bez kosti 1kg", "chicken-thigh"],
    ["Rajčata cherry", "cherry-tomatoes"], ["Rajčata keříková", "tomato"], ["Brambory konzumní pozdní", "potato"],
    ["Losos filety", "salmon"], ["Uzený losos plátky 100g", "smoked-salmon"], ["Mléko polotučné trvanlivé 1,5% 1l", "milk"],
    ["Ovesný nápoj 1l", "plant-milk"], ["Okurka salátová", "cucumber"], ["Okurky sterilované 670g", "pickles"],
    ["Cukr krupice 1kg", "sugar"], ["Cukr moučka 500g", "icing-sugar"], ["Med květový 500g", "honey"],
    ["Hovězí mleté maso 500g", "beef-mince"], ["Mleté maso vepřové a hovězí 500g", "mixed-mince"],
    ["Špenát listový mražený 450g", "frozen-spinach"], ["Baby špenát 125g", "spinach"], ["Pivo světlý ležák 12° Ryze hořká Radegast", "beer"],
    ["Paprika mletá sladká 25g", "paprika"], ["Paprika červená", "bell-pepper"], ["Česnek", "garlic"], ["Jarní cibulka svazek", "spring-onion"],
    ["Cibule žlutá 1kg", "onion"], ["Prostředek na nádobí Jar 0,9 l", "dish-soap"], ["Tablety do myčky Finish 40 ks", "dishwasher-tabs"],
  ];
  for (const [t, id] of cases) assert.equal(findItem(t)?.id ?? null, id, t);
});

test("recipe lines", () => {
  const a = parseLine("2 cups plain flour");
  assert.equal(a.item.id, "flour"); assert.equal(a.qty.u, "g"); assert.equal(Math.round(a.qty.v), 265);
  const b = parseLine("3 cloves garlic, crushed");
  assert.equal(b.item.id, "garlic"); assert.deepEqual(b.qty, { v: 15, u: "g" }); assert.equal(b.note, "crushed");
  const c = parseLine("500 g kuřecích stehen");
  assert.equal(c.item.id, "chicken-thigh"); assert.deepEqual(c.qty, { v: 500, u: "g" });
  const d = parseLine("1 (400 g) can chopped tomatoes");
  assert.equal(d.item.id, "passata"); assert.deepEqual(d.qty, { v: 400, u: "g" });
  const e = parseLine("2 onions, diced");
  assert.equal(e.item.id, "onion"); assert.deepEqual(e.qty, { v: 300, u: "g" });
  const f = parseLine("Salt and pepper, to taste");
  assert.equal(f.optional, true);
  const g = parseLine("1 tbsp olive oil"); assert.equal(g.item.id, "olive-oil"); assert.deepEqual(g.qty, { v: 15, u: "ml" });
  const h = parseLine("4 eggs"); assert.equal(h.item.id, "eggs"); assert.deepEqual(h.qty, { v: 4, u: "ks" });
  const i = parseLine("200ml thickened cream"); assert.equal(i.item.id, "cream"); assert.deepEqual(i.qty, { v: 200, u: "ml" });
  const j = parseLine("2 lžíce cukru"); assert.equal(j.item.id, "sugar"); assert.equal(j.qty.u, "g");
  const k = parseLine("1 red onion"); assert.equal(k.item.id, "red-onion");
});

test("recipe text", () => {
  const r = parseRecipe(`Chicken traybake
Serves 4
Ingredients
1 kg chicken thighs
500 g baby potatoes
2 red capsicums, sliced
3 tbsp olive oil
Method
1. Heat the oven to 200C.
2. Toss everything together.`);
  assert.equal(r.title, "Chicken traybake"); assert.equal(r.servings, 4);
  assert.deepEqual(r.lines.map(l => l.item?.id), ["chicken-thigh", "potato", "bell-pepper", "olive-oil"]);
});

test("receipt text", () => {
  const r = parseReceipt(`LIDL Česká republika v.o.s.
Ostrava
Máslo 250g 49,90 A
Kuřecí prsní řízky 189,90 A
2 x 24,90
Okurka salátová 49,80 A
0,524 kg x 89,90 Kč/kg
Banány 47,11 A
Sleva -10,00
CELKEM 336,71
16.10.2026 14:22`);
  assert.equal(r.store, "lidl"); assert.equal(r.total, 336.71); assert.equal(r.date, "2026-10-16");
  assert.deepEqual(r.rows.map(x => x.item?.id), ["butter", "chicken-breast", "cucumber", "banana"]);
  assert.equal(r.rows[2].qty, 2); assert.equal(r.rows[2].unitPrice, 24.9);
  assert.equal(r.rows[3].weightKg, 0.524); assert.equal(r.rows[3].price, 37.11);
});

test("costs and plan", () => {
  const tesco = { fetchedAt: "2026-10-16T05:00:00Z", products: {
    "1": { t: "Tesco Máslo 82% tuku 250g", p: 27.9, u: 111.6, per: "kg", pk: { v: 250, u: "g" } },
    "2": { t: "Madeta Jihočeské máslo 250g", p: 54.9, u: 219.6, per: "kg", pk: { v: 250, u: "g" }, cc: 44.9 },
    "3": { t: "Kuřecí prsní řízky 500g", p: 109.9, pk: { v: 500, u: "g" } },
    "4": { t: "Banány volné", p: 29.9, u: 29.9, per: "kg", loose: true },
  } };
  const deals = { fetchedAt: "2026-10-16T05:00:00Z", deals: [
    { s: "lidl", f: "Lidl", n: "Kuřecí prsní řízky", p: 189.9, pk: { v: 1000, u: "g" }, until: "2026-10-18" },
    { s: "lidl", f: "Lidl", n: "Banány", p: 24.9, u: { p: 24.9, per: "kg" }, until: "2026-10-15" }, // expired
  ] };
  const book = [{ id: "b1", itemId: "butter", store: "albert", name: "Máslo Albert 250g", p: 39.9, pk: { v: 250, u: "g" }, date: "2026-10-10" }];
  const index = buildIndex(tesco, deals);
  const ctx = { index, book, settings: {}, today: "2026-10-16" };
  const c = costFor({ price: 109.9, pack: { v: 500, u: "g" } }, { v: 1200, u: "g" }, BY_ID["chicken-breast"]);
  assert.equal(c.n, 3); assert.equal(c.cost, 329.7);
  const plan = makePlan([
    { id: "a", itemId: "butter", qty: { v: 500, u: "g" } },
    { id: "b", itemId: "chicken-breast", qty: { v: 1000, u: "g" } },
    { id: "c", itemId: "banana", qty: { v: 6, u: "ks" } },
  ], ctx);
  const r = Object.fromEntries(plan.rows.map(x => [x.e.itemId, x]));
  assert.equal(r.butter.best.store, "tesco"); assert.equal(r.butter.best.cost, 55.8);
  assert.equal(r["chicken-breast"].best.store, "lidl"); assert.equal(r["chicken-breast"].best.cost, 189.9);
  assert.equal(r.banana.best.store, "tesco"); assert.equal(r.banana.by.lidl, undefined, "expired deal ignored");
  assert.equal(r.banana.best.cost, Math.round(29.9 * 0.72 * 100) / 100);
  assert.equal(plan.bestSingle.store, "tesco");
  const asg = assignment(plan, "cheapest"); assert.equal(asg.b, "lidl");
});
