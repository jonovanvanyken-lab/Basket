// Writes a realistic sample price set into <dir>/data for browser tests (not shipped).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parsePack, perUnit, iso } from "../js/units.js";
import { updateHistory } from "../fetch/history.mjs";

const dir = process.argv[2]; mkdirSync(join(dir, "data"), { recursive: true });
const today = new Date(); const d = n => { const x = new Date(today); x.setDate(x.getDate() + n); return iso(x); };
const T = [
  ["máslo", "Tesco Máslo 82% tuku 250g", 27.9], ["máslo", "Madeta Jihočeské máslo 250g", 54.9, 44.9], ["máslo", "Alfa Přepuštěné máslo 200g", 99.9],
  ["mléko", "Tesco Mléko polotučné 1,5% 1l", 21.9], ["mléko", "Olma Mléko čerstvé plnotučné 3,5% 1l", 29.9],
  ["vejce", "Tesco Vejce M 10 ks", 54.9], ["vejce", "Vejce z volného výběhu L 10 ks", 79.9],
  ["chléb", "Chléb konzumní kmínový 1200g", 44.9], ["rohlík", "Rohlík tukový 43g", 2.9],
  ["banány", "Banány volné", 29.9, null, true], ["jablka", "Jablka Gala volná", 39.9, null, true],
  ["kuřecí prsa", "Kuřecí prsní řízky 500g", 109.9], ["kuřecí prsa", "Kuřecí prsní řízky chlazené 1kg", 199.9, 179.9],
  ["kuřecí stehna", "Kuřecí stehna bez kosti 600g", 99.9], ["hovězí mleté maso", "Hovězí mleté maso 500g", 139.9],
  ["mleté maso mix", "Mleté maso vepřové a hovězí 500g", 99.9], ["cibule", "Cibule žlutá 1kg", 24.9], ["česnek", "Česnek 100g", 19.9],
  ["brambory", "Brambory konzumní 2kg", 49.9], ["mrkev", "Mrkev 1kg", 22.9], ["rajčata", "Rajčata keříková 500g", 49.9],
  ["cherry rajčata", "Rajčata cherry 250g", 34.9], ["okurka salátová", "Okurka salátová", 19.9], ["paprika", "Paprika červená 500g", 54.9],
  ["rýže", "Tesco Rýže dlouhozrnná 1kg", 39.9], ["těstoviny", "Barilla Spaghetti 500g", 44.9], ["těstoviny", "Tesco Penne 500g", 19.9],
  ["mouka", "Mouka pšeničná hladká 1kg", 16.9], ["cukr krupice", "Cukr krupice 1kg", 21.9], ["slunečnicový olej", "Slunečnicový olej 1l", 49.9],
  ["olivový olej", "Olivový olej extra panenský 500ml", 179.9, 149.9], ["drcená rajčata", "Rajčata drcená 400g", 24.9],
  ["kokosové mléko", "Kokosové mléko 400ml", 39.9], ["kari pasta", "Thai Kitchen Kari pasta červená 112g", 69.9],
  ["smetana ke šlehání", "Smetana ke šlehání 31% 250ml", 32.9], ["bílý jogurt", "Bílý jogurt 500g", 29.9], ["eidam", "Eidam 30% plátky 100g", 22.9],
  ["parmezán", "Parmigiano Reggiano 100g", 69.9], ["špenát", "Baby špenát 125g", 39.9], ["špenát mražený", "Špenát listový mražený 450g", 29.9],
  ["koriandr čerstvý", "Koriandr v květináči", 39.9], ["zázvor", "Zázvor 100g", 14.9], ["sůl", "Sůl jedlá 1kg", 9.9],
  ["toaletní papír", "Toaletní papír 3vrstvý 8 ks", 89.9], ["pivo", "Pivo Radegast 12° 0,5l", 24.9], ["káva", "Jacobs Krönung mletá 250g", 129.9, 99.9],
];
const products = {}, queries = {};
T.forEach(([q, t, p, cc, loose], i) => {
  const id = String(2001000000 + i * 37); const pk = loose ? null : parsePack(t);
  const u = loose ? { p, per: "kg" } : perUnit(p, pk);
  products[id] = { id, t, p, pk, i: `sample-${i}/photo.jpeg`, ...(u ? { u: u.p, per: u.per } : {}), ...(loose ? { loose: true } : {}), ...(cc ? { cc, ccU: perUnit(cc, pk)?.p, ccUntil: d(9) } : {}) };
  (queries[q] ||= []).push(id);
});
const tesco = { fetchedAt: new Date().toISOString(), source: "sample", products, queries };
const D = [
  ["lidl", "Lidl", "Kuřecí prsní řízky", 169.9, "1 kg", 0, null, "maso-drubez-a-ryby", "meat"],
  ["lidl", "Lidl", "Máslo", 39.9, "0.25 kg", 27, null, "mlecne-vyrobky-a-vejce", "dairy"],
  ["lidl", "Lidl", "Rajčata cherry", 39.9, "0.25 kg", 33, null, "ovoce-a-zelenina", "produce"],
  ["lidl", "Lidl", "Brambory konzumní pozdní", 89.9, "10 kg", 10, true, "ovoce-a-zelenina", "produce"],
  ["lidl", "Lidl", "Banány", 24.9, "1 kg", 17, null, "ovoce-a-zelenina", "produce"],
  ["lidl", "Lidl", "Losos filety", 29.9, "100 g", 0, null, "maso-drubez-a-ryby", "meat"],
  ["lidl", "Lidl", "Vepřová krkovice bez kosti", 119.9, "1 kg", 30, null, "maso-drubez-a-ryby", "meat"],
  ["lidl", "Lidl", "Pivo světlý ležák 12° Radegast", 19.9, "0.5 l", 23, null, "alkohol", "drinks"],
  ["albert", "Albert hypermarket", "Banány", 24.9, "1 kg", 44, null, "ovoce-a-zelenina", "produce"],
  ["albert", "Albert supermarket", "Instantní káva Jacobs Velvet", 129.9, "180 g", 31, null, "nealko-napoje", "drinks"],
  ["albert", "Albert", "Kuřecí stehna horní bez kosti", 139.9, "1 kg", 25, null, "maso-drubez-a-ryby", "meat"],
  ["albert", "Albert hypermarket", "Mléko polotučné trvanlivé 1,5%", 17.9, "1 l", 28, true, "mlecne-vyrobky-a-vejce", "dairy"],
  ["albert", "Albert", "Vejce M", 49.9, "10 ks", 20, null, "mlecne-vyrobky-a-vejce", "dairy"],
  ["albert", "Albert", "Cibule žlutá", 19.9, "1 kg", 20, null, "ovoce-a-zelenina", "produce"],
  ["albert", "Albert", "Hovězí mleté maso", 119.9, "0.5 kg", 20, null, "maso-drubez-a-ryby", "meat"],
  ["lidl", "Lidl", "Káva mletá Jacobs Krönung", 89.9, "250 g", 31, null, "nealko-napoje", "drinks"],
  ["albert", "Albert hypermarket", "Toaletní papír 3vrstvý", 79.9, "8 ks", 33, null, "drogerie", "household"],
  ["lidl", "Lidl", "Nutella", 99.9, "600 g", 25, null, "sladkosti-a-slane-snacky", "snacks"],
  ["albert", "Albert", "Pivo Pilsner Urquell", 26.9, "0.5 l", 18, true, "alkohol", "drinks"],
  ["lidl", "Lidl", "Olivový olej extra panenský", 149.9, "750 ml", 40, null, "vareni-a-peceni", "pantry"],
  ["albert", "Albert supermarket", "Rajčata keříková", 39.9, "500 g", 0, null, "ovoce-a-zelenina", "produce"],
];
const deals = { fetchedAt: new Date().toISOString(), source: "sample", deals: D.map(([s, f, n, p, a, disc, app, kc, c]) => { const pk = parsePack(a); return { s, f, n, p, a, pk, u: perUnit(p, pk), ...(disc ? { d: disc } : {}), ...(app ? { app: true } : {}), until: n.startsWith("Ban") ? d(1) : d(3), ...(n.startsWith("Pivo P") ? { from: d(2), until: d(8) } : {}), c, kc, fs: n.length % 2 ? d(0) : d(-5), l: "/sleva/sample" }; }) };
// history: pretend the last 6 weeks had higher butter prices at Tesco
const hist = { items: {}, tesco: {} };
const older = JSON.parse(JSON.stringify(tesco)); for (const p of Object.values(older.products)) { p.p = Math.round(p.p * 1.12 * 10) / 10; if (p.u) p.u = Math.round(p.u * 1.12 * 10) / 10; }
updateHistory(hist, older, { deals: [] }, d(-40));
updateHistory(hist, tesco, deals, d(0));
const status = { runAt: new Date().toISOString(), tesco: { ok: true, searched: 170, failed: 0, method: "html", products: Object.keys(products).length, at: new Date().toISOString(), notes: ["using html"], errors: [] },
  leaflets: { lidl: { ok: true, deals: 8, at: new Date().toISOString() }, albert: { ok: true, deals: 7, at: new Date().toISOString() } } };
const usual = { fetchedAt: new Date().toISOString(), items: {
  a: { n: "Káva mletá Jacobs Krönung, 250 g", p: 159.9, pk: { v: 250, u: "g" }, at: d(0) },
  b: { n: "Olivový olej extra panenský", p: 249.9, pk: { v: 750, u: "ml" }, at: d(0) },
  c: { n: "Nutella", p: 129.9, pk: { v: 600, u: "g" }, at: d(0) },
  e: { n: "Instantní káva Jacobs Velvet", p: 119.9, pk: { v: 180, u: "g" }, at: d(0) },
} };
status.usual = { ok: true, searched: 190, failed: 0, found: 2400, products: 1850, at: new Date().toISOString() };
for (const [n, j] of Object.entries({ tesco, deals, history: hist, status, usual })) writeFileSync(join(dir, "data", n + ".json"), JSON.stringify(j));
console.log("sample written");
