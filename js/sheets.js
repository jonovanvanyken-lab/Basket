// Sheets (bottom drawers): item detail, price book, receipts, recipes, finishing a shop, budget, settings, status.
import { S, save, uid, exportBackup, importBackup, reset } from "./state.js";
import { DATA, itemOf, allItems, ctx, enabledStores, changed, bump, addEntry, addText, snapshot, restore, suggest, gh, sha1hex, customQueries, putFresh, loadData, plan, resolve } from "./core.js";
import { pricesByStore, goodness, swapHint, STORES, LOYALTY, storeOn, candidates, costFor } from "./plan.js";
import { CAT_NAME, ITEMS } from "./dict.js";
import { parseRecipe, parseLine, toItemUnit } from "./recipe.js";
import { parseReceipt } from "./receipt.js";
import { customItem } from "./match.js";
import { $, esc, on, onChange, toast, openSheet, setSheet, closeSheet, kc, storeTag, srcLabel, pills, buyText, ago, dayLabel, lineChart, barChart, pname, thumb } from "./ui.js";
import { en } from "./translate.js";
import { fmtQty, kcPer, iso, num, parsePack, perUnit, norm, round2, daysBetween } from "./units.js";
import { shopGroups, recipeEntries, recipeCost } from "./views.js";

const storeOptions = (sel, all = false) => Object.keys(STORES).filter(s => all || storeOn(s, S().settings.stores) || s === sel).map(s => `<option value="${s}" ${s === sel ? "selected" : ""}>${esc(STORES[s].name)}</option>`).join("");
const itemOptions = sel => {
  const its = allItems().slice().sort((a, b) => a.name.localeCompare(b.name));
  return `<option value="">Choose…</option>` + its.map(it => `<option value="${esc(it.id)}" ${it.id === sel ? "selected" : ""}>${esc(it.name)}${it.custom ? "" : ` · ${esc(it.cz)}`}</option>`).join("") + `<option value="__new">Something else…</option>`;
};
const unitChoices = it => (it.unit === "g" ? ["g", "kg", ...(it.e ? ["ks"] : [])] : it.unit === "ml" ? ["ml", "l", ...(it.e ? ["ks"] : [])] : ["ks"]);
function qtyToBase(v, u, it) {
  if (!(v > 0)) return null;
  const q = u === "kg" ? { v: v * 1000, u: "g" } : u === "l" ? { v: v * 1000, u: "ml" } : { v, u };
  return toItemUnit(q, it);
}
function shownQty(q) { if (!q) return ["", ""]; if (q.u === "g" && q.v >= 1000) return [q.v / 1000, "kg"]; if (q.u === "ml" && q.v >= 1000) return [q.v / 1000, "l"]; return [q.v, q.u]; }

// ================= item detail =================
let cur = null; // {kind:"entry"|"item", id, open:store|null}
export function openEntry(id) { cur = { kind: "entry", id, open: null }; openSheet("", "", { onClose: () => { cur = null; } }); renderItemSheet(); }
export function openItem(itemId) { const e = S().list.find(x => x.itemId === itemId); if (e) return openEntry(e.id); cur = { kind: "item", id: itemId, open: null }; openSheet("", "", { onClose: () => { cur = null; } }); renderItemSheet(); }
function curEntry() { return cur?.kind === "entry" ? S().list.find(e => e.id === cur.id) : null; }
export function renderItemSheet() {
  if (!cur) return;
  const e = curEntry(); if (cur.kind === "entry" && !e) { closeSheet(); return; }
  const it = itemOf(e ? e.itemId : cur.id); if (!it) { closeSheet(); return; }
  $("sheetTitle").textContent = it.name;
  const c = ctx(); const need = e?.qty || null;
  const { by, all } = pricesByStore(it, need, c, e?.lock);
  const stores = Object.keys(STORES).filter(s => storeOn(s, S().settings.stores));
  const best = Object.values(by).sort((a, b) => a.cost - b.cost)[0] || null;
  const [qv, qu] = shownQty(e?.qty);
  let html = `<p class="muted">${it.custom ? "Your own item" : esc(it.cz)} · ${esc(CAT_NAME[it.cat] || "Other")}</p>`;
  if (e) html += `<form class="row" data-submit="setQty" style="align-items:flex-end"><label class="field grow"><span class="label">How much you need</span><input id="qtyV" type="number" inputmode="decimal" step="any" min="0" value="${esc(qv)}" placeholder="one pack (${esc(fmtQty(it.pack, it.unit))})"></label>
      <label class="field" style="width:84px"><span class="label">Unit</span><select id="qtyU">${unitChoices(it).map(u => `<option ${u === (qu || (it.unit === "g" && it.pack >= 1000 ? "kg" : it.unit)) ? "selected" : ""}>${u}</option>`).join("")}</select></label>
      <button class="ghost" type="submit" style="height:46px">Set</button></form>`;
  if (best) {
    const g = goodness(it, best, c), sw = swapHint(it, need, best, c);
    html += `<div class="note">Cheapest: <b>${storeTag(best.store)} ${kc(best.cost)}</b> for ${esc(buyText(best) || "one pack")}${best.unitP ? ` (${esc(kcPer(best.unitP))})` : ""}.
      ${g ? (g.lowest ? " That's the lowest price in 8 weeks." : g.pct > 0 ? ` That's ${g.pct} % above the 8-week low.` : "") : ""}${best.used < best.cost - 0.5 ? ` You'd use about ${kc(best.used, true)} worth of it.` : ""}</div>`;
    if (sw) html += `<button class="swap" type="button" data-act="swap" data-id="${esc(e?.id || "")}" data-to="${esc(sw.item.id)}">Swap idea: ${esc(sw.item.name)} is ${Math.round(sw.save * 100)} % cheaper per unit at ${esc(STORES[sw.cand.store].name)}${e ? " — tap to swap" : ""}</button>`;
  }
  html += `<div><h3>Prices by store</h3><ul class="prices">`;
  for (const s of stores) {
    const b = by[s]; const opts = all.filter(x => x.store === s);
    const locked = e?.lock?.[s];
    html += `<li class="opt ${b && best && b.key === best.key ? "best" : ""}">${thumb({ img: b?.src === "tesco" ? b.img : null, it })}<span class="nm">${storeTag(s)} ${b ? pname(b.name) : `<span class="muted">${s === "tesco" ? "Not found online" : "No leaflet deal or logged price"}</span>`}
      ${b ? `<span class="src">${esc(srcLabel(b))}</span> ${pills(b)}` : ""}</span>
      <span class="px">${b ? `${kc(b.cost)}<small>${esc(buyText(b))}${b.unitP ? ` · ${esc(kcPer(b.unitP))}` : ""}</small>` : "–"}</span>
      ${opts.length > 1 || locked ? `<span class="lock">${opts.length > 1 ? `<button class="link" type="button" data-act="toggleOpts" data-store="${s}">${cur.open === s ? "Hide options" : `All ${opts.length} options`}</button>` : ""}${locked ? `<button class="link" type="button" data-act="unlock" data-store="${s}">Any brand again</button>` : ""}</span>` : ""}</li>`;
    if (cur.open === s) {
      const ranked = opts.map(o => ({ o, k: costFor(o, need, it) })).filter(x => x.k).sort((a, b) => a.k.cost - b.k.cost);
      for (const { o, k } of ranked) {
        html += `<li class="opt sub">${thumb({ img: o.src === "tesco" ? o.img : null, it })}<span class="nm small">${pname(o.name)}<span class="src">${esc(srcLabel(o))}</span> ${pills(o)}</span><span class="px">${kc(k.cost)}<small>${esc(buyText({ ...o, ...k }))}${k.unitP ? ` · ${esc(kcPer(k.unitP))}` : ""}</small></span>
          ${e ? `<span class="lock">${locked === o.key ? `<span class="pill ok">Chosen</span>` : `<button class="link" type="button" data-act="lock" data-store="${s}" data-key="${esc(o.key)}">Always this one at ${esc(STORES[s].name)}</button>`}</span>` : ""}</li>`;
      }
    }
  }
  html += `</ul></div>`;
  // history
  const h = DATA.history?.items?.[it.id];
  const per = it.unit === "g" ? "kg" : it.unit === "ml" ? "l" : "ks";
  const series = stores.map(s => ({ key: s, label: STORES[s].name, cls: s, pts: h?.s?.[s] || [] }));
  const pts = S().book.filter(b => b.itemId === it.id && daysBetween(b.date, iso()) <= 120).map(b => {
    const u = b.loose ? { p: b.p, per: b.per || per } : perUnit(b.p, b.pk); return u && u.per === per ? { day: b.date, v: u.p, cls: b.store } : null;
  }).filter(Boolean);
  html += `<div><h3>Lowest price over time <span class="muted small">(Kč/${per})</span></h3>${lineChart(series, { unit: per, points: pts })}</div>`;
  const isStaple = S().staples.includes(it.id), isPantry = S().pantry.includes(it.id);
  html += `<div class="stack"><label class="check"><input type="checkbox" data-change="staple" data-id="${esc(it.id)}" ${isStaple ? "checked" : ""}> One of my staples</label>
    <label class="check"><input type="checkbox" data-change="pantry" data-id="${esc(it.id)}" ${isPantry ? "checked" : ""}> Usually at home (left off recipe lists)</label></div>
    <div class="btnrow"><button class="ghost" type="button" data-act="logPrice" data-item="${esc(it.id)}">Log a price</button>
    ${e ? `<button class="danger" type="button" data-act="removeEntry" data-id="${esc(e.id)}">Remove from list</button>` : `<button class="primary" type="button" data-act="addItem" data-id="${esc(it.id)}">Add to list</button>`}</div>
    ${it.custom ? `<p class="fine">This item isn't in the built-in dictionary. Tesco prices for it come from a search for “${esc(it.q)}”${gh() ? ". Use Fetch now in the menu to look it up straight away." : " in the daily run once the app is connected to GitHub (Settings)."}</p>` : ""}`;
  setSheet(html);
}
on("openEntry", el => openEntry(el.dataset.id));
on("toggleOpts", el => { cur.open = cur.open === el.dataset.store ? null : el.dataset.store; renderItemSheet(); });
on("lock", el => { const e = curEntry(); if (!e) return; e.lock = { ...(e.lock || {}), [el.dataset.store]: el.dataset.key }; changed(); renderItemSheet(); toast(`Using that product at ${STORES[el.dataset.store].name}`); });
on("unlock", el => { const e = curEntry(); if (!e?.lock) return; delete e.lock[el.dataset.store]; changed(); renderItemSheet(); });
on("removeEntry", el => { const snap = snapshot(); S().list = S().list.filter(e => e.id !== el.dataset.id); delete S().checked[el.dataset.id]; changed(); closeSheet(); toast("Removed", () => restore(snap)); });
on("swap", el => {
  const e = S().list.find(x => x.id === el.dataset.id); const to = itemOf(el.dataset.to); if (!e || !to) return;
  const snap = snapshot(); const from = itemOf(e.itemId);
  e.itemId = to.id; e.lock = {}; if (e.qty) e.qty = toItemUnit(e.qty, to); changed(); renderItemSheet();
  toast(`Swapped ${from?.name.toLowerCase()} for ${to.name.toLowerCase()}`, () => restore(snap));
});
on("setQty", () => {
  const e = curEntry(); const it = itemOf(e?.itemId); if (!e || !it) return;
  const v = num($("qtyV").value); e.qty = v > 0 ? qtyToBase(v, $("qtyU").value, it) : null; changed(); renderItemSheet();
});
onChange("staple", el => { const id = el.dataset.id; const s = S(); s.staples = el.checked ? [...new Set([...s.staples, id])] : s.staples.filter(x => x !== id); changed(); });
onChange("pantry", el => { const id = el.dataset.id; const s = S(); s.pantry = el.checked ? [...new Set([...s.pantry, id])] : s.pantry.filter(x => x !== id); changed(); });

// ================= price book =================
export function openLogPrice({ itemId = "", store = "", name = "", price = "", pack = "", loose = false, back = null } = {}) {
  const it = itemOf(itemId);
  openSheet("Log a price", `<form class="stack" data-submit="savePrice" data-back="${esc(back || "")}">
    <label class="field"><span class="label">Item</span><select id="lpItem" data-change="lpItem">${itemOptions(itemId)}</select></label>
    <label class="field" id="lpNewWrap" hidden><span class="label">What is it?</span><input id="lpNew" type="text" placeholder="e.g. tahini"></label>
    <div class="grid2"><label class="field"><span class="label">Store</span><select id="lpStore">${storeOptions(store || "lidl", true)}</select></label>
      <label class="field"><span class="label">Price (Kč)</span><input id="lpPrice" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(price)}" required></label></div>
    <div class="grid2"><label class="field"><span class="label">Pack size</span><input id="lpPack" type="text" value="${esc(pack || (it ? fmtQty(it.pack, it.unit) : ""))}" placeholder="250 g, 1 l, 10 ks"></label>
      <label class="field"><span class="label">Date</span><input id="lpDate" type="date" value="${iso()}" max="${iso()}"></label></div>
    <label class="field"><span class="label">Product name (optional)</span><input id="lpName" type="text" value="${esc(name)}" placeholder="as on the shelf, e.g. Pilos máslo 250g"></label>
    <label class="check"><input type="checkbox" id="lpLoose" ${loose ? "checked" : ""}> Sold loose: the price is per kg (or per litre / piece)</label>
    <label class="check"><input type="checkbox" id="lpApp"> Needed the store's card or app (Clubcard, Lidl Plus…)</label>
    <p class="hint err" id="lpErr"></p>
    <div class="btnrow"><button class="primary" type="submit">Save price</button></div></form>`);
}
onChange("lpItem", el => { $("lpNewWrap").hidden = el.value !== "__new"; const it = itemOf(el.value); if (it && !$("lpPack").value) $("lpPack").value = fmtQty(it.pack, it.unit); });
on("savePrice", form => {
  let itemId = $("lpItem").value;
  if (itemId === "__new") { const n = $("lpNew").value.trim(); if (!n) return ($("lpErr").textContent = "Say what the item is."); const r = resolve(n); itemId = r.item.id; }
  const it = itemOf(itemId); if (!it) return ($("lpErr").textContent = "Choose the item.");
  const p = num($("lpPrice").value); if (!(p > 0)) return ($("lpErr").textContent = "Enter the price.");
  const loose = $("lpLoose").checked;
  const pk = loose ? null : parsePack($("lpPack").value) || (num($("lpPack").value) > 0 ? { v: num($("lpPack").value), u: it.unit } : null);
  if (!loose && !pk) return ($("lpErr").textContent = "Enter the pack size, like 250 g or 1 l, or tick 'sold loose'.");
  S().book.push({ id: uid(), itemId, store: $("lpStore").value, name: $("lpName").value.trim() || it.name, p: round2(p), pk, loose, per: loose ? (it.unit === "g" ? "kg" : it.unit === "ml" ? "l" : "ks") : undefined, date: $("lpDate").value || iso(), app: $("lpApp").checked, src: "manual" });
  changed();
  if (form.dataset.back === "book") openBook(); else closeSheet();
  toast(`Saved ${it.name.toLowerCase()} at ${STORES[$("lpStore")?.value]?.name || "the store"}`);
});
on("logPrice", el => openLogPrice({ itemId: el.dataset.item || "" }));

export function openBook() {
  const b = [...S().book].sort((x, y) => (y.date > x.date ? 1 : -1));
  const groups = {};
  for (const e of b) (groups[e.itemId] ||= []).push(e);
  const names = Object.keys(groups).sort((a, c) => (itemOf(a)?.name || a).localeCompare(itemOf(c)?.name || c));
  openSheet("Price book", `<p class="hint">Prices you've seen or paid. They fill the gaps the leaflets leave for Albert and Lidl, and count for ${S().settings.bookMaxAge} days.</p>
    <div class="btnrow" style="margin-top:0"><button class="primary" type="button" data-act="bookAdd">Log a price</button><button class="ghost" type="button" data-act="receipt">Read a receipt</button></div>
    ${names.length ? names.map(id => `<div><h3>${esc(itemOf(id)?.name || id)}</h3><ul class="prices">${groups[id].map(e => {
      const u = e.loose ? { p: e.p, per: e.per } : perUnit(e.p, e.pk);
      return `<li><span class="nm">${storeTag(e.store)} ${pname(e.name)}<span class="src">${esc(ago(e.date))}${e.src === "receipt" ? " · receipt" : e.src === "paid" ? " · paid" : ""}${e.app ? ` · ${esc(LOYALTY[e.store])}` : ""}</span></span>
        <span class="px">${kc(e.p)}<small>${e.loose ? "loose" : esc(fmtQty(e.pk?.v, e.pk?.u))}${u ? ` · ${esc(kcPer(u))}` : ""}</small></span>
        <span class="lock"><button class="link" type="button" data-act="bookDel" data-id="${esc(e.id)}" style="color:var(--bad)">Delete</button></span></li>`;
    }).join("")}</ul></div>`).join("") : `<div class="empty">No prices logged yet.</div>`}`);
}
on("bookAdd", () => openLogPrice({ back: "book" }));
on("bookDel", el => { const snap = JSON.stringify(S().book); S().book = S().book.filter(e => e.id !== el.dataset.id); changed(); openBook(); toast("Price deleted", () => { S().book = JSON.parse(snap); changed(); openBook(); }); });

// ================= receipts (text recognition on the device) =================
let ocrWorker = null;
function loadScript(src, check) { return new Promise((res, rej) => { if (check && check()) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load")); document.head.appendChild(s); }); }
async function getOcr(progress) {
  if (ocrWorker) return ocrWorker;
  progress("Loading text recognition (first time only, about 10 MB)…", 0);
  await loadScript("ocr/tesseract.min.js", () => window.Tesseract);
  ocrWorker = await window.Tesseract.createWorker(["ces", "eng"], 1, { workerPath: "ocr/worker.min.js", corePath: "ocr/", langPath: "ocr", gzip: true, workerBlobURL: false, cacheMethod: "none",
    logger: m => { if (m.status === "recognizing text") progress("Reading the receipt…", m.progress); else if (/load/.test(m.status || "")) progress("Loading text recognition (first time only, about 10 MB)…", m.progress || 0); } });
  return ocrWorker;
}
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  const g = cv.getContext("2d"); g.filter = "grayscale(1) contrast(1.25)"; g.drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise(r => cv.toBlob(r, "image/png"));
}
export function openReceipt() {
  openSheet("Read a receipt", `<p class="hint">Take a photo of a paper receipt, or a screenshot of a Lidl Plus or Albert e-receipt. The text is read on this phone and nothing is uploaded.</p>
    <label class="primary" style="text-align:center;cursor:pointer">Choose photo or screenshot<input id="rcFile" type="file" accept="image/*" data-change="rcFile" hidden></label>
    <p class="hint" id="rcProg"></p><div id="rcOut"></div>
    <details><summary class="small muted">Or paste the receipt text</summary><textarea id="rcText" placeholder="Paste text from an e-receipt"></textarea><div class="btnrow"><button class="ghost" type="button" data-act="rcPaste">Read text</button></div></details>`);
}
on("receipt", openReceipt);
onChange("rcFile", async el => {
  const f = el.files?.[0]; if (!f) return;
  const prog = (t, p) => { const x = $("rcProg"); if (x) x.textContent = p ? `${t} ${Math.round(p * 100)} %` : t; };
  try {
    const w = await getOcr(prog);
    const img = await shrink(f).catch(() => f);
    const { data } = await w.recognize(img);
    prog("");
    showReceipt(data.text, URL.createObjectURL(f));
  } catch (e) { console.error(e); prog("Couldn't read that image. Try a sharper, flatter photo, or paste the text."); }
});
on("rcPaste", () => showReceipt($("rcText").value, null));
let rc = null;
function showReceipt(text, img) {
  const r = parseReceipt(text, S().custom);
  rc = { ...r, text };
  const out = $("rcOut"); if (!out) return;
  if (!r.rows.length) { out.innerHTML = `<p class="hint err">No priced lines found.</p><div class="raw-text">${esc(text)}</div>`; return; }
  out.innerHTML = `${img ? `<img class="shot" src="${img}" alt="Your receipt">` : ""}
    <div class="grid2"><label class="field"><span class="label">Store</span><select id="rcStore">${storeOptions(r.store || "lidl", true)}</select></label><label class="field"><span class="label">Date</span><input id="rcDate" type="date" value="${r.date || iso()}"></label></div>
    <p class="hint">Check each line. Unticked lines aren't saved. Pick the item where it guessed wrong.</p>
    <div class="parse-rows">${r.rows.map((x, i) => `<div class="prow${x.item ? "" : " off"}" data-i="${i}"><input type="checkbox" class="rcOn" ${x.item ? "checked" : ""} aria-label="Save this line"><div><div class="raw"><b>${esc(en(x.text))}</b> · ${esc(x.text)}${x.qty > 1 ? ` · ${x.qty} × ${kc(x.unitPrice)}` : ""}${x.weightKg ? ` · ${String(x.weightKg).replace(".", ",")} kg × ${kc(x.perKg)}/kg` : ""}</div></div>
      <div class="ctl"><select class="rcItem" aria-label="Item">${itemOptions(x.item?.id || "")}</select><input class="rcPrice" type="number" step="0.01" inputmode="decimal" value="${x.weightKg ? x.perKg : x.unitPrice}" aria-label="${x.weightKg ? "Price per kg" : "Price per pack"}"><input class="rcPack" type="text" value="${x.weightKg ? "loose" : x.pack ? esc(fmtQty(x.pack.v, x.pack.u)) : x.item ? esc(fmtQty(x.item.pack, x.item.unit)) : ""}" placeholder="size" aria-label="Pack size"></div></div>`).join("")}</div>
    ${r.total ? `<label class="check"><input type="checkbox" id="rcTrip" checked> Also log this shop in Budget (${kc(r.total)})</label>` : `<label class="check"><input type="checkbox" id="rcTrip"> Also log this shop in Budget (${kc(r.rows.reduce((n, x) => n + x.price, 0))})</label>`}
    <p class="hint err" id="rcErr"></p><div class="btnrow"><button class="primary" type="button" data-act="rcSave">Save prices</button></div>
    <details><summary class="small muted">Recognised text</summary><div class="raw-text">${esc(text)}</div></details>`;
}
on("rcSave", () => {
  if (!rc) return;
  const store = $("rcStore").value, date = $("rcDate").value || iso();
  let n = 0;
  document.querySelectorAll(".prow").forEach(row => {
    if (!row.querySelector(".rcOn").checked) return;
    const x = rc.rows[+row.dataset.i]; let id = row.querySelector(".rcItem").value;
    if (id === "__new") { const r = resolve(x.text); id = r.item.id; }
    const it = itemOf(id); if (!it) return;
    const p = num(row.querySelector(".rcPrice").value); if (!(p > 0)) return;
    const packText = row.querySelector(".rcPack").value.trim();
    const loose = /loose|voln/i.test(packText) || !!x.weightKg;
    const pk = loose ? null : parsePack(packText) || x.pack || { v: it.pack, u: it.unit };
    S().book.push({ id: uid(), itemId: id, store, name: x.text, p: round2(p), pk, loose, per: loose ? (it.unit === "ml" ? "l" : it.unit === "ks" ? "ks" : "kg") : undefined, date, src: "receipt" });
    n++;
  });
  if ($("rcTrip")?.checked) S().trips.push({ id: uid(), date, store, total: round2(rc.total || rc.rows.reduce((t, x) => t + x.price, 0)), items: rc.rows.length, src: "receipt" });
  changed(); closeSheet(); toast(`Saved ${n} price${n === 1 ? "" : "s"} from the receipt`);
});

// ================= recipes =================
let draft = null; // {id?, title, servings, url, lines:[{raw,itemId,qty,optional,note,include}]}
export function openRecipeImport({ link = false, recipeId = null } = {}) {
  if (recipeId) {
    const r = S().recipes.find(x => x.id === recipeId); if (!r) return;
    draft = JSON.parse(JSON.stringify(r)); openSheet("Edit recipe", ""); renderDraft(); return;
  }
  draft = null;
  const conn = !!gh();
  openSheet(link ? "Recipe from a link" : "Paste a recipe", link ? `
    <p class="hint">${conn ? "GitHub reads the page for the app (it takes about a minute), then you check the ingredients." : "Reading links needs the GitHub connection in Settings, because the app can't open other websites itself. You can paste the ingredients instead."}</p>
    <label class="field"><span class="label">Recipe page</span><input id="riUrl" type="url" inputmode="url" placeholder="https://…" ${conn ? "" : "disabled"}></label>
    <p class="hint" id="riMsg"></p>
    <div class="btnrow"><button class="primary" type="button" data-act="riLink" ${conn ? "" : "disabled"}>Read the recipe</button><button class="ghost" type="button" data-act="recipeImport">Paste instead</button></div>` : `
    <p class="hint">Paste the ingredients, or the whole recipe. English or Czech. The method is ignored.</p>
    <textarea id="riText" placeholder="Chicken curry&#10;Serves 4&#10;500 g chicken thighs&#10;1 onion&#10;2 cloves garlic&#10;400 ml coconut milk"></textarea>
    <div class="btnrow"><button class="primary" type="button" data-act="riRead">Read ingredients</button></div>`);
}
on("recipeImport", el => openRecipeImport({ link: el.dataset.link === "1" }));
on("editRecipe", el => openRecipeImport({ recipeId: el.dataset.id }));
on("riRead", () => {
  const p = parseRecipe($("riText").value, S().custom);
  if (!p.lines.length) { toast("No ingredients found. One per line works best."); return; }
  draft = { title: p.title, servings: p.servings || 4, url: "", lines: p.lines.map(lineDraft) };
  $("sheetTitle").textContent = "Check the ingredients"; renderDraft();
});
function lineDraft(l) { const it = l.item; return { raw: l.raw, itemId: it?.id || "", qty: l.qty, optional: l.optional, note: l.note, include: !!it && !l.optional && !S().pantry.includes(it.id), name: l.name }; }
on("riLink", async () => {
  const g = gh(); const url = $("riUrl").value.trim(); const msg = $("riMsg");
  if (!/^https?:\/\//i.test(url)) { msg.textContent = "Paste the full link, starting with https://"; return; }
  const btn = document.querySelector('[data-act="riLink"]'); btn.disabled = true;
  try {
    msg.textContent = "Asking GitHub to read the page…";
    const since = await g.dispatch({ recipe_url: url, quick: "true", queries: "" });
    const run = await g.waitForRun(since, t => { msg.textContent = t; });
    if (run.conclusion !== "success") throw new Error("The GitHub run failed. Open it on GitHub to see why.");
    const r = await g.readJson(`data/imports/${await sha1hex(url)}.json`);
    if (!r.ok) throw new Error(r.error || "No ingredients found on that page.");
    const lines = r.lines.map(l => parseLine(l, S().custom)).filter(Boolean);
    draft = { title: r.title || "", servings: r.servings || 4, url, lines: lines.map(lineDraft) };
    $("sheetTitle").textContent = "Check the ingredients"; renderDraft();
  } catch (e) { msg.textContent = e.message; msg.className = "hint err"; btn.disabled = false; }
});
function renderDraft() {
  const d = draft; const left = d.lines.filter(l => l.itemId && !l.include && S().pantry.includes(l.itemId)).map(l => itemOf(l.itemId)?.name.toLowerCase());
  setSheet(`<div class="grid3" style="grid-template-columns:minmax(0,1fr) 96px"><label class="field"><span class="label">Name</span><input id="rdTitle" type="text" value="${esc(d.title)}" placeholder="Recipe name"></label>
    <label class="field"><span class="label">Serves</span><input id="rdServ" type="number" min="1" inputmode="numeric" value="${esc(d.servings || 4)}"></label></div>
    ${left.length ? `<p class="note">Unticked because you usually have them: ${esc(left.join(", "))}.</p>` : ""}
    <div class="parse-rows">${d.lines.map((l, i) => { const it = itemOf(l.itemId); const [qv, qu] = shownQty(l.qty); return `<div class="prow${l.include ? "" : " off"}" data-i="${i}">
      <input type="checkbox" class="rdOn" ${l.include ? "checked" : ""} aria-label="Include ${esc(l.raw)}"><div class="raw">${esc(l.raw)}${l.optional ? " · optional" : ""}</div>
      <div class="ctl"><select class="rdItem" aria-label="Item">${itemOptions(l.itemId)}</select><input class="rdQty" type="number" step="any" min="0" inputmode="decimal" value="${esc(qv)}" placeholder="1 pack" aria-label="Amount"><select class="rdUnit" aria-label="Unit">${(it ? unitChoices(it) : ["g", "kg", "ml", "l", "ks"]).map(u => `<option ${u === qu ? "selected" : ""}>${u}</option>`).join("")}</select></div></div>`; }).join("")}</div>
    <p class="hint err" id="rdErr"></p>
    <div class="btnrow"><button class="primary" type="button" data-act="rdSave" data-add="1">Save and add to list</button><button class="ghost" type="button" data-act="rdSave">Save recipe</button><button class="ghost" type="button" data-act="rdAddOnly">Add to list only</button></div>`);
}
function readDraft() {
  const d = draft; d.title = $("rdTitle").value.trim(); d.servings = Math.max(1, Math.round(num($("rdServ").value) || 1));
  document.querySelectorAll(".prow").forEach(row => {
    const l = d.lines[+row.dataset.i]; l.include = row.querySelector(".rdOn").checked;
    let id = row.querySelector(".rdItem").value;
    if (id === "__new") { const it = customItem(l.name || l.raw); if (!S().custom.some(c => c.id === it.id)) S().custom.push(it); id = it.id; }
    l.itemId = id;
    const it = itemOf(id); const v = num(row.querySelector(".rdQty").value);
    l.qty = it && v > 0 ? qtyToBase(v, row.querySelector(".rdUnit").value, it) : null;
  });
  return d;
}
document.addEventListener("change", ev => { if (ev.target.closest?.(".prow")) { const row = ev.target.closest(".prow"); if (ev.target.classList.contains("rdOn") || ev.target.classList.contains("rcOn")) row.classList.toggle("off", !ev.target.checked); } });
on("rdSave", el => {
  const d = readDraft();
  if (!d.lines.some(l => l.itemId && l.include)) { $("rdErr").textContent = "Tick at least one ingredient."; return; }
  const rec = { id: d.id || uid(), title: d.title || "Untitled recipe", servings: d.servings, url: d.url || "", lines: d.lines.map(({ raw, itemId, qty, optional, note, include }) => ({ raw, itemId, qty, optional, note, include })), added: d.added || iso() };
  const i = S().recipes.findIndex(r => r.id === rec.id); if (i >= 0) S().recipes[i] = rec; else S().recipes.push(rec);
  if (el.dataset.add) addRecipeToList(rec, rec.servings);
  changed(); closeSheet(); toast(el.dataset.add ? `Saved “${rec.title}” and added it to your list` : `Saved “${rec.title}”`);
});
on("rdAddOnly", () => { const d = readDraft(); const n = addRecipeToList({ id: "tmp", ...d }, d.servings); changed(); closeSheet(); toast(`Added ${n} ingredients`); });
function addRecipeToList(r, servings) {
  let n = 0;
  for (const e of recipeEntries(r, servings)) { addEntry(e.itemId, e.qty, `recipe:${r.id}`); n++; }
  return n;
}
on("cookRecipe", el => {
  const r = S().recipes.find(x => x.id === el.dataset.id); if (!r) return;
  const c = recipeCost(r);
  openSheet(r.title || "Recipe", `<p class="muted">${r.lines.filter(l => l.include !== false && l.itemId).length} ingredients · about ${kc(c.perServing ?? c.used)} ${c.perServing != null ? "per serving" : "in total"} today</p>
    <label class="field"><span class="label">How many servings?</span><input id="ckServ" type="number" min="1" inputmode="numeric" value="${r.servings || 4}"></label>
    <p class="hint">Amounts scale from the recipe's ${r.servings || "?"} servings. Things you usually have at home are added already ticked.</p>
    <div class="btnrow"><button class="primary" type="button" data-act="ckAdd" data-id="${esc(r.id)}">Add to list</button></div>
    <details><summary class="small muted">Ingredients</summary><ul class="small">${r.lines.map(l => `<li>${esc(l.raw)}</li>`).join("")}</ul></details>`);
});
on("ckAdd", el => { const r = S().recipes.find(x => x.id === el.dataset.id); const snap = snapshot(); const n = addRecipeToList(r, Math.max(1, num($("ckServ").value) || r.servings)); changed(); closeSheet(); toast(`Added ${n} ingredients for ${r.title}`, () => restore(snap)); });
let delArm = null;
on("deleteRecipe", el => {
  if (delArm !== el.dataset.id) { delArm = el.dataset.id; el.textContent = "Tap again to delete"; setTimeout(() => { if (delArm === el.dataset.id) { delArm = null; bump(); } }, 3500); return; }
  const snap = JSON.stringify(S().recipes); S().recipes = S().recipes.filter(r => r.id !== el.dataset.id); delArm = null; changed();
  toast("Recipe deleted", () => { S().recipes = JSON.parse(snap); changed(); });
});

// ================= staples and pantry =================
export function openStaples() {
  const s = S();
  const chip = (id, kind) => { const it = itemOf(id); return it ? `<button class="chip on" type="button" data-act="unpin" data-kind="${kind}" data-id="${esc(id)}" aria-label="Remove ${esc(it.name)}">${esc(it.name)} ✕</button>` : ""; };
  openSheet("Staples and pantry", `<div><h3 style="margin-top:0">Staples</h3><p class="hint">Your usual weekly basics. One tap adds them to the list, and Deals watches them.</p><div class="chips" style="margin-top:8px">${s.staples.map(id => chip(id, "staples")).join("") || `<span class="hint">None yet</span>`}</div></div>
    <div><h3>Usually at home</h3><p class="hint">Left ticked when a recipe adds them, like salt or oil.</p><div class="chips" style="margin-top:8px">${s.pantry.map(id => chip(id, "pantry")).join("") || `<span class="hint">None yet</span>`}</div></div>
    <div><h3>Add</h3><input type="search" id="stQ" placeholder="Search items (English or Czech)" data-input="stQ" autocomplete="off"><div class="suggest" id="stSug"></div></div>`);
}
on("editStaples", openStaples);
on("unpin", el => { const k = el.dataset.kind; S()[k] = S()[k].filter(x => x !== el.dataset.id); changed(); openStaples(); });
export function stapleSuggest(q) {
  const box = $("stSug"); if (!box) return;
  box.innerHTML = suggest(q, 8).map(it => `<span class="row" style="gap:4px"><button class="chip" type="button" data-act="pin" data-kind="staples" data-id="${esc(it.id)}">+ ${esc(it.name)} <small>staple</small></button><button class="chip" type="button" data-act="pin" data-kind="pantry" data-id="${esc(it.id)}"><small>at home</small></button></span>`).join("");
}
on("pin", el => { const k = el.dataset.kind; S()[k] = [...new Set([...S()[k], el.dataset.id])]; changed(); openStaples(); });

// ================= finishing a shop =================
on("finish", el => {
  const st = el.dataset.store;
  const g = shopGroups().find(([k]) => k === st); if (!g) return;
  const ticked = g[1].filter(x => S().checked[x.r.e.id]);
  const est = round2(ticked.reduce((n, x) => n + (x.c?.cost || 0), 0));
  openSheet(`Finish at ${STORES[st].name}`, `<p class="hint">${ticked.length} item${ticked.length === 1 ? "" : "s"} ticked. They come off your list, and the shop goes into Budget.</p>
    <div class="grid2"><label class="field"><span class="label">You paid (Kč)</span><input id="fnTotal" type="number" step="0.01" inputmode="decimal" value="${est}"></label><label class="field"><span class="label">Date</span><input id="fnDate" type="date" value="${iso()}" max="${iso()}"></label></div>
    <div><h3>Prices on the shelf <span class="muted small">(optional)</span></h3><p class="hint">Change any price that was different. Ticked ones go into your price book.</p>
    <div class="parse-rows">${ticked.map((x, i) => `<div class="prow" data-i="${i}" data-id="${esc(x.r.e.id)}"><input type="checkbox" class="fnOn" ${st !== "tesco" ? "checked" : ""} aria-label="Save this price"><div class="raw">${esc(x.r.it?.name || "")}${x.c ? ` · ${esc(en(x.c.name))}` : ""}</div>
      <div class="ctl" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><input class="fnPrice" type="number" step="0.01" inputmode="decimal" value="${x.c ? (x.c.loose ? x.c.unitP?.p ?? "" : x.c.price) : ""}" placeholder="price" aria-label="Price"><input class="fnPack" type="text" value="${x.c?.loose ? "loose" : x.c?.pack ? esc(fmtQty(x.c.pack.v, x.c.pack.u)) : x.r.it ? esc(fmtQty(x.r.it.pack, x.r.it.unit)) : ""}" aria-label="Pack size"></div></div>`).join("")}</div></div>
    <p class="hint err" id="fnErr"></p><div class="btnrow"><button class="primary" type="button" data-act="fnSave" data-store="${esc(st)}">Done</button></div>`);
  finishing = ticked;
});
let finishing = [];
on("fnSave", el => {
  const st = el.dataset.store, date = $("fnDate").value || iso(), total = num($("fnTotal").value);
  const snap = snapshot();
  document.querySelectorAll(".prow").forEach(row => {
    if (!row.querySelector(".fnOn")?.checked) return;
    const x = finishing[+row.dataset.i]; const it = x?.r.it; if (!it) return;
    const p = num(row.querySelector(".fnPrice").value); if (!(p > 0)) return;
    const pt = row.querySelector(".fnPack").value; const loose = /loose|voln/i.test(pt);
    S().book.push({ id: uid(), itemId: it.id, store: st, name: x.c?.name || it.name, p: round2(p), pk: loose ? null : parsePack(pt) || { v: it.pack, u: it.unit }, loose, per: loose ? (it.unit === "ml" ? "l" : it.unit === "ks" ? "ks" : "kg") : undefined, date, src: "paid" });
  });
  const ids = new Set(finishing.map(x => x.r.e.id));
  S().list = S().list.filter(e => !ids.has(e.id));
  for (const id of ids) delete S().checked[id];
  if (total > 0) S().trips.push({ id: uid(), date, store: st, total: round2(total), items: ids.size, src: "shop" });
  changed(); closeSheet(); toast(`Shop at ${STORES[st].name} saved`, () => { restore(snap); S().trips = S().trips.filter(t => !(t.date === date && t.store === st && t.total === round2(total))); changed(); });
});

// ================= budget =================
export function openBudget() {
  const s = S(), today = iso(), month = today.slice(0, 7);
  const trips = s.trips.slice().sort((a, b) => (b.date > a.date ? 1 : -1));
  const thisMonth = trips.filter(t => t.date.startsWith(month));
  const spent = round2(thisMonth.reduce((n, t) => n + t.total, 0));
  const budget = s.settings.budget || 0;
  const d = new Date(today + "T12:00:00"); const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); const dayN = d.getDate();
  const pace = budget ? round2((budget / dim) * dayN) : 0;
  const byStore = {}; for (const t of thisMonth) byStore[t.store] = (byStore[t.store] || 0) + t.total;
  const months = []; for (let i = 5; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); const k = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`; months.push({ k, v: round2(trips.filter(t => t.date.startsWith(k)).reduce((n, t) => n + t.total, 0)), label: m.toLocaleDateString("en-GB", { month: "short" }) }); }
  const fill = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  openSheet("Grocery budget", `<div class="summary" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="kpi"><span class="label">Spent this month</span><span class="big">${kc(spent, true)}</span><span class="sub">${thisMonth.length} shop${thisMonth.length === 1 ? "" : "s"}</span></div>
      <div class="kpi"><span class="label">${budget ? "Left" : "Budget"}</span><span class="big">${budget ? kc(budget - spent, true) : "–"}</span><span class="sub">${budget ? `of ${kc(budget, true)} · on pace: ${kc(pace, true)}` : "Set one below"}</span></div></div>
    ${budget ? `<div class="track" style="height:10px"><div class="fill ${spent > budget ? "bad" : spent > pace * 1.1 ? "warn" : ""}" style="width:${fill}%"></div></div>` : ""}
    <form class="row" data-submit="setBudget" style="align-items:flex-end"><label class="field grow"><span class="label">Monthly grocery budget (Kč)</span><input id="bgV" type="number" inputmode="numeric" min="0" step="100" value="${budget || ""}" placeholder="e.g. 6000"></label><button class="ghost" type="submit" style="height:46px">Save</button></form>
    ${Object.keys(byStore).length ? `<div><h3>This month by store</h3>${barChart(Object.entries(byStore).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: storeTag(k), v, cls: k })))}</div>` : ""}
    <div><h3>Last six months</h3>${barChart(months.map(m => ({ label: esc(m.label), v: m.v, cls: m.k === month ? "" : "past" })))}</div>
    <div><h3>Shops</h3><ul class="prices">${trips.slice(0, 40).map(t => `<li><span class="nm">${storeTag(t.store)} <span class="src">${esc(dayLabel(t.date) === "today" ? "today" : t.date.split("-").reverse().join(". ").replace(/^0/, ""))}${t.items ? ` · ${t.items} items` : ""}${t.src === "receipt" ? " · receipt" : ""}</span></span><span class="px">${kc(t.total)}</span><span class="lock"><button class="link" type="button" data-act="tripDel" data-id="${esc(t.id)}" style="color:var(--bad)">Delete</button></span></li>`).join("") || `<li><span class="hint">No shops logged yet. Finishing a shop on the Shop tab, or reading a receipt, logs it.</span></li>`}</ul></div>
    <details><summary class="small" style="font-weight:600">Log a shop by hand</summary><form class="stack" data-submit="tripAdd" style="margin-top:10px"><div class="grid3"><select id="tpStore" aria-label="Store">${storeOptions("lidl", true)}</select><input id="tpTotal" type="number" step="0.01" inputmode="decimal" placeholder="Kč" aria-label="Amount"><input id="tpDate" type="date" value="${today}" aria-label="Date"></div><button class="ghost" type="submit">Add</button></form></details>
    <div class="btnrow"><button class="ghost" type="button" data-act="exportTrips">Export shops (CSV)</button></div>
    <p class="fine">Your card payments already reach Kč Ledger through your bank file. Use this export to check them, not to import them a second time.</p>`);
}
on("setBudget", () => { S().settings.budget = Math.max(0, Math.round(num($("bgV").value) || 0)); changed(); openBudget(); });
on("tripDel", el => { const snap = JSON.stringify(S().trips); S().trips = S().trips.filter(t => t.id !== el.dataset.id); changed(); openBudget(); toast("Shop deleted", () => { S().trips = JSON.parse(snap); changed(); openBudget(); }); });
on("tripAdd", () => { const v = num($("tpTotal").value); if (!(v > 0)) return; S().trips.push({ id: uid(), date: $("tpDate").value || iso(), store: $("tpStore").value, total: round2(v), src: "manual" }); changed(); openBudget(); });
on("exportTrips", () => {
  const rows = [["Date", "Store", "Amount", "Items", "Note"], ...S().trips.slice().sort((a, b) => (a.date > b.date ? 1 : -1)).map(t => [t.date, STORES[t.store]?.name || t.store, (-t.total).toFixed(2), t.items || "", "Groceries (Kč Basket)"])];
  download(`groceries-${iso()}.csv`, "﻿" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n"), "text/csv");
});
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

// ================= settings =================
export function openSettings() {
  const st = S().settings, g = st.gh;
  openSheet("Settings", `<div><h3 style="margin-top:0">Shops you use</h3>${Object.keys(STORES).map(s => `<div class="switch-row"><span>${storeTag(s)}${s === "tesco" ? ` <span class="muted small">online prices and offers</span>` : ` <span class="muted small">leaflet deals and your prices</span>`}</span><input type="checkbox" data-change="storeOn" data-store="${s}" ${storeOn(s, st.stores) ? "checked" : ""} aria-label="Use ${esc(STORES[s].name)}"></div>`).join("")}</div>
    <div><h3>Card and app prices</h3><p class="hint">Count prices that need the store's card or app.</p>${enabledStores().map(s => `<div class="switch-row"><span>${esc(LOYALTY[s])}</span><input type="checkbox" data-change="loyalty" data-store="${s}" ${st.loyalty[s] !== false ? "checked" : ""} aria-label="${esc(LOYALTY[s])} prices"></div>`).join("")}</div>
    <div><h3>Planning</h3><div class="grid2"><label class="field"><span class="label">Split only if it saves (Kč)</span><input type="number" inputmode="numeric" min="0" step="10" value="${st.splitMin}" data-change="splitMin"></label>
      <label class="field"><span class="label">Use your prices for (days)</span><input type="number" inputmode="numeric" min="7" step="1" value="${st.bookMaxAge}" data-change="bookMaxAge"></label></div></div>
    <div><h3>GitHub connection <span class="muted small">(optional)</span></h3>
      <p class="hint">Lets the app start a price fetch straight away, read recipe links, and add your own items to the daily Tesco searches. Create a fine-grained token on GitHub limited to this app's repository, with <b>Actions: read and write</b> and <b>Contents: read and write</b>. It stays on this device and isn't included in backups.</p>
      <form class="stack" data-submit="saveGh" style="margin-top:8px"><div class="grid2"><label class="field"><span class="label">Owner</span><input id="ghOwner" type="text" autocapitalize="off" spellcheck="false" value="${esc(g.owner)}" placeholder="jonovanvanyken-lab"></label><label class="field"><span class="label">Repository</span><input id="ghRepo" type="text" autocapitalize="off" spellcheck="false" value="${esc(g.repo)}" placeholder="Basket"></label></div>
        <label class="field"><span class="label">Token</span><input id="ghToken" type="password" autocomplete="off" spellcheck="false" value="${g.token ? "••••••••" : ""}" placeholder="github_pat_…"></label>
        <p class="hint" id="ghMsg"></p><div class="btnrow" style="margin-top:0"><button class="primary" type="submit">Save and test</button>${g.token ? `<button class="ghost" type="button" data-act="ghForget">Forget token</button>` : ""}</div></form>
      <p class="fine"><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a token on GitHub</a></p></div>
    <div><h3>Names and photos</h3>
      <div class="switch-row"><span>Product photos <span class="muted small">loaded from Tesco's image server</span></span><input type="checkbox" data-change="photos" ${st.photos !== false ? "checked" : ""} aria-label="Product photos"></div>
      <div class="switch-row"><span>Czech name under the English <span class="muted small">handy on the shelf</span></span><input type="checkbox" data-change="showCz" ${st.showCz !== false ? "checked" : ""} aria-label="Show Czech names"></div>
      <p class="fine">${DATA.status?.translate?.method === "deepl" ? "English names come from DeepL, read with the daily prices." : "English names come from a built-in grocery glossary, word for word. Add a free DeepL key to the repository for natural translations (see the README)."}</p></div>
    <div><h3>Appearance</h3><div class="seg">${["auto", "light", "dark"].map(t => `<button type="button" data-act="theme" data-v="${t}" aria-pressed="${st.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></div>
    <div><h3>Backup</h3><p class="hint">Your list, recipes, price book and shops, as one file.</p><div class="btnrow"><button class="ghost" type="button" data-act="backup">Save a backup</button><label class="ghost" style="cursor:pointer;text-align:center">Restore<input type="file" accept="application/json,.json" data-change="restore" hidden></label></div></div>
    <div><h3>Start again</h3><button class="danger" type="button" data-act="resetAll">Delete everything on this device</button></div>
    <p class="fine">Kč Basket · version 2. Prices: Tesco from nakup.itesco.cz, leaflet deals from kupi.cz, read once a day.</p>`);
}
onChange("storeOn", el => { S().settings.stores[el.dataset.store] = el.checked; DATA.index.cache.clear(); changed(); openSettings(); });
onChange("photos", el => { S().settings.photos = el.checked; changed(); });
onChange("showCz", el => { S().settings.showCz = el.checked; changed(); });
onChange("loyalty", el => { S().settings.loyalty[el.dataset.store] = el.checked; changed(); });
onChange("splitMin", el => { S().settings.splitMin = Math.max(0, num(el.value) || 0); changed(); });
onChange("bookMaxAge", el => { S().settings.bookMaxAge = Math.max(7, Math.round(num(el.value) || 120)); changed(); });
on("theme", el => { S().settings.theme = el.dataset.v; applyTheme(); save(); openSettings(); });
export function applyTheme() { const t = S().settings.theme; if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); }
on("saveGh", async () => {
  const g = S().settings.gh; const msg = $("ghMsg");
  g.owner = $("ghOwner").value.trim(); g.repo = $("ghRepo").value.trim();
  const tk = $("ghToken").value.trim(); if (tk && !/^•+$/.test(tk)) g.token = tk;
  save();
  const c = gh(); if (!c) { msg.textContent = "Fill in all three."; msg.className = "hint err"; return; }
  msg.textContent = "Checking…"; msg.className = "hint";
  try { const r = await c.check(); g.branch = r.branch; save(); msg.textContent = r.note || "Connected. Fetch now is in the menu."; msg.className = r.note ? "hint err" : "hint ok"; bump(); }
  catch (e) { msg.textContent = e.message; msg.className = "hint err"; }
});
on("ghForget", () => { S().settings.gh.token = ""; save(); openSettings(); bump(); });
on("backup", () => download(`kc-basket-backup-${iso()}.json`, exportBackup(), "application/json"));
onChange("restore", async el => { const f = el.files?.[0]; if (!f) return; try { importBackup(await f.text()); applyTheme(); bump(); closeSheet(); toast("Backup restored"); } catch (e) { toast(e.message); } });
let resetArm = false;
on("resetAll", el => { if (!resetArm) { resetArm = true; el.textContent = "Tap again to delete everything"; el.classList.add("confirm"); setTimeout(() => { resetArm = false; }, 4000); return; } reset(); applyTheme(); bump(); closeSheet(); toast("Everything deleted"); });

// ================= price data status and Fetch now =================
export function freshness() {
  const t = DATA.status?.tesco?.at || DATA.tesco?.fetchedAt, d = DATA.deals?.fetchedAt;
  const newest = [t, d].filter(Boolean).sort().pop();
  if (!DATA.loaded) return { cls: "", text: "Loading…" };
  if (!newest) return { cls: "bad", text: "No prices yet" };
  const age = daysBetween(newest.slice(0, 10), iso());
  const time = new Date(newest).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const tescoBad = DATA.status && DATA.status.tesco && DATA.status.tesco.ok === false;
  if (age === 0) return { cls: tescoBad ? "warn" : "ok", text: `Prices today ${time}` };
  return { cls: age <= 2 ? (tescoBad ? "warn" : "ok") : "warn", text: age === 1 ? "Prices yesterday" : `Prices ${age} days old` };
}
export function openStatus() {
  const st = DATA.status || {};
  const line = (label, x, what) => `<div class="switch-row"><span>${label}</span><span class="small">${x ? (x.ok ? `<span class="pill ok">OK</span> ${esc(what(x))}` : `<span class="pill bad">Failed</span> ${esc((x.errors || [])[0] || "no data")}`) : `<span class="muted">not run yet</span>`}</span></div>`;
  const leaf = Object.entries(st.leaflets || {});
  const c = gh();
  openSheet("Price data", `<div class="status-list">
    ${line(storeTag("tesco") + " online", st.tesco, x => `${x.products} products, ${x.searched} searches, ${ago(x.at)}${x.method ? ` (${x.method})` : ""}`)}
    ${leaf.map(([s, x]) => line(storeTag(s) + " leaflet", x, y => `${y.deals} deals, ${ago(y.at)}`)).join("")}
    ${st.runAt ? `<p class="fine">Last run ${esc(new Date(st.runAt).toLocaleString("en-GB"))}${st.quick ? " (quick)" : ""}.</p>` : `<p class="hint">The daily run hasn't happened yet. On GitHub, open the repository's Actions tab, choose Prices, and press Run workflow once.</p>`}
    ${st.tesco?.errors?.length ? `<details><summary class="small muted">Tesco messages</summary><code>${st.tesco.errors.map(esc).join("<br>")}</code></details>` : ""}
    ${st.tesco?.notes?.length ? `<p class="fine">${esc(st.tesco.notes.join(" · "))}</p>` : ""}</div>
    <p class="hint">Prices are read every morning at about 06:17. Tesco's online prices can differ from its Express stores, so they're labelled "Tesco online".</p>
    <div class="btnrow">${c ? `<button class="primary" type="button" data-act="fetchNow">Fetch now</button>` : `<button class="ghost" type="button" data-act="openSettings">Connect GitHub to fetch on demand</button>`}<button class="ghost" type="button" data-act="reloadData">Reload</button></div>
    <p class="hint" id="fnMsg"></p>`);
}
on("reloadData", async () => { await loadData(); openStatus(); toast("Prices reloaded"); });
let fetching = false;
on("fetchNow", async () => {
  const c = gh(); if (!c) { openSettings(); return; }
  if (fetching) return; fetching = true;
  const say = t => { const m = $("fnMsg"); if (m) m.textContent = t; setBanner(t); };
  try {
    const qs = customQueries();
    if (qs.length) { say("Adding your items to the daily searches…"); await c.addWatch(qs).catch(() => {}); }
    say("Starting a quick price fetch on GitHub…");
    const since = await c.dispatch({ queries: qs.join(";"), recipe_url: "", quick: qs.length ? "true" : "false" });
    const run = await c.waitForRun(since, say);
    if (run.conclusion !== "success") throw new Error("The price run failed on GitHub. Open the Actions tab there to see why.");
    say("Reading the new prices…");
    for (const n of ["tesco", "deals", "history", "status"]) { try { const t = await c.readRaw(`data/${n}.json`); await putFresh(n, t); } catch {} }
    await loadData();
    setBanner(""); toast("Prices updated");
    if (!$("sheet").hidden && $("fnMsg")) openStatus();
  } catch (e) { setBanner(""); toast(e.message); const m = $("fnMsg"); if (m) { m.textContent = e.message; m.className = "hint err"; } }
  finally { fetching = false; }
});
export function setBanner(t) {
  const b = $("banners"); if (!b) return;
  b.innerHTML = t ? `<div class="banner"><span>${esc(t)}</span></div>` : "";
}

// ================= menu =================
export function openMenu() {
  const c = gh();
  openSheet("Kč Basket", `<ul class="menu">
    <li><button type="button" data-act="openBook"><span class="qi">₭</span><span><b>Price book</b><small>${S().book.length} prices you've logged · read a receipt</small></span></button></li>
    <li><button type="button" data-act="openBudget"><span class="qi">◔</span><span><b>Budget</b><small>Spending this month, by store</small></span></button></li>
    <li><button type="button" data-act="editStaples"><span class="qi">★</span><span><b>Staples and pantry</b><small>Your basics, and what you usually have</small></span></button></li>
    <li><button type="button" data-act="openHistory"><span class="qi">↗</span><span><b>Price history</b><small>Any item, every store, last 4 months</small></span></button></li>
    <li><button type="button" data-act="openStatus"><span class="qi">⟳</span><span><b>Price data</b><small>${esc(freshness().text)}${c ? " · Fetch now" : ""}</small></span></button></li>
    <li><button type="button" data-act="openSettings"><span class="qi">⚙</span><span><b>Settings</b><small>Shops, card prices, GitHub, backup</small></span></button></li></ul>`);
}
on("openBook", openBook); on("openBudget", openBudget); on("openStatus", openStatus); on("openSettings", openSettings);
on("openHistory", () => {
  openSheet("Price history", `<input type="search" id="hiQ" placeholder="Which item? (English or Czech)" data-input="hiQ" autocomplete="off"><div class="suggest" id="hiSug"></div>
    <div><h3>Your items</h3><div class="chips">${[...new Set([...S().list.map(e => e.itemId), ...S().staples])].map(itemOf).filter(Boolean).map(it => `<button class="chip" type="button" data-act="historyItem" data-id="${esc(it.id)}">${esc(it.name)}</button>`).join("") || `<span class="hint">Search above.</span>`}</div></div>`);
});
export function historySuggest(q) { const b = $("hiSug"); if (b) b.innerHTML = suggest(q, 8).map(it => `<button class="chip" type="button" data-act="historyItem" data-id="${esc(it.id)}"><b>${esc(it.name)}</b><small>${esc(it.custom ? "" : it.cz)}</small></button>`).join(""); }
on("historyItem", el => openItem(el.dataset.id));
