// The Deals tab: For you (your items and watch words), All deals (filters, sorting, grouping),
// Cook (cheap protein and veg), and the deal detail sheet.
import { S, save } from "./state.js";
import { DATA, itemOf, enabledStores, ctx, addEntry, addText, snapshot, restore, changed } from "./core.js";
import { STORES, LOYALTY, pricesByStore } from "./plan.js";
import { analyser, DEAL_CATS, DEAL_CAT_NAME, dealKey, watchHit, brandWords } from "./deals.js";
import { findItem } from "./match.js";
import { $, esc, kc, storeTag, dayLabel, ago, pname, thumb, on, onChange, openSheet, closeSheet, toast, srcLabel, buyText } from "./ui.js";
import { kcPer, iso, norm, num, fmtQty, daysBetween } from "./units.js";
import { en } from "./translate.js";
import { recipeCost } from "./views.js";
import { toItemUnit } from "./recipe.js";
import { scheduleAlertSync, openAlerts } from "./alerts-ui.js";

let view = "watch", limit = 60, moreOpen = false;
document.addEventListener("toggle", e => { if (e.target?.matches?.("details.more")) moreOpen = e.target.open; }, true);
export function setDealView(v) { view = v; limit = 60; }
export function moreDeals() { limit += 60; }
export function setDealFilter(k, v) { if (k === "q") { S().dealPrefs.q = v; limit = 60; save(); } }

// one analyser per data load
let anState = null;
function A() {
  if (!anState || anState.index !== DATA.index || anState.n !== S().custom.length || anState.day !== iso()) anState = { index: DATA.index, n: S().custom.length, day: iso(), fn: analyser({ index: DATA.index, history: DATA.history, usual: DATA.usual, custom: S().custom, today: iso() }) };
  return anState.fn;
}
const today = () => iso();
const fmtName = d => (d.f && norm(d.f) !== norm(STORES[d.s]?.name || "") ? d.f.replace(/^Albert\s*/i, "") : "");

function baseDeals({ upcoming = false } = {}) {
  const t = today(), stores = new Set(enabledStores());
  return (DATA.index.deals || []).filter(d => stores.has(d.s) && (!d.until || d.until >= t) && (upcoming || !d.from || d.from <= t));
}

// ---------- For you ----------
export function watchIds() {
  const s = S(), ids = new Set([...s.staples, ...s.list.map(e => e.itemId), ...Object.keys(s.alerts || {})]);
  for (const r of s.recipes) for (const l of r.lines) if (l.itemId) ids.add(l.itemId);
  return ids;
}
function forYou() {
  const s = S(), ids = watchIds(), an = A(), loy = s.settings.loyalty;
  const out = [];
  for (const d of baseDeals()) {
    if (d.app && loy[d.s] === false) continue;
    const r = an(d), word = watchHit(d.n, s.watchWords);
    if ((r.it && ids.has(r.it.id)) || word) out.push({ d, r, word, key: dealKey(d) });
  }
  for (const p of DATA.index.tesco || []) {
    if (!p.cc && !p.promo && !p.was) continue;
    if (!enabledStores().includes("tesco")) break;
    const it = findItem(p.ws, s.custom), word = watchHit(p.t, s.watchWords);
    if (!(it && ids.has(it.id)) && !word) continue;
    const until = p.cc ? p.ccUntil : p.promoUntil;
    if (until && until < today()) continue;
    if (p.cc && loy.tesco === false && !p.was) continue;
    out.push({ p, it, word, until, key: `tesco-online|${p.id}|${p.cc || p.p}` });
  }
  return out;
}
export function unseenCount() {
  if (!DATA.deals) return 0;
  const seen = new Set(S().seenDeals || []);
  return forYou().filter(x => !seen.has(x.key)).length;
}

// ---------- rows ----------
function pillsFor(d, r, word) {
  const out = [];
  if (r.isNew) out.push(`<span class="pill new">New</span>`);
  if (r.upcoming) out.push(`<span class="pill">From ${esc(dayLabel(d.from))}</span>`);
  if (d.d) out.push(`<span class="pill deal">−${d.d} %</span>`);
  if (d.app) out.push(`<span class="pill card">${esc(LOYALTY[d.s])}</span>`);
  if (r.usual && r.usual.pct < 0) out.push(`<span class="pill warn">Above usual price</span>`);
  if (r.stockUp) out.push(`<span class="pill ok">Stock up</span>`);
  else if (r.lowest) out.push(`<span class="pill ok">Lowest in 8 weeks</span>`);
  if (r.real && r.real.pct <= -5 && d.s !== "tesco") out.push(`<span class="pill warn">Tesco online cheaper</span>`);
  else if (r.real && r.real.pct >= 10 && d.s !== "tesco") out.push(`<span class="pill ok">${r.real.pct} % under Tesco</span>`);
  if (word) out.push(`<span class="pill watch">★ ${esc(word)}</span>`);
  return out.join("");
}
export function dealRow(d, r = A()(d), word = null) {
  const it = r.it;
  return `<div class="dealrow">${thumb({ it, cat: d.c })}
    <button class="rowbtn" type="button" data-act="openDeal" data-i="${d.i}"><span class="nm">${pname(d.n)}</span>
      <span class="meta">${storeTag(d.s)}${fmtName(d) ? `<span>${esc(fmtName(d))}</span>` : ""}${d.a ? `<span>${esc(d.a)}</span>` : ""}${d.until ? `<span>until ${esc(dayLabel(d.until))}</span>` : ""}</span>
      <span class="meta">${pillsFor(d, r, word)}</span></button>
    <div class="px">${kc(d.p)}<small>${r.unit ? esc(kcPer(r.unit)) : ""}${r.usual ? `<br>usual ${esc(kc(r.usual.p))}` : ""}${r.saving >= 1 ? `<br><span class="save">save ${esc(kc(r.saving, true))}</span>` : ""}</small></div>
    <div class="add">${it ? `<button class="link" type="button" data-act="addItem" data-id="${esc(it.id)}">+ Add ${esc(it.name.toLowerCase())}</button>` : `<button class="link" type="button" data-act="addDealName" data-name="${esc(d.n)}">+ Add to list</button>`}</div></div>`;
}
function tescoRow({ p, it, word, until }) {
  const pct = p.was ? Math.round((1 - p.p / p.was) * 100) : p.cc ? Math.round((1 - p.cc / p.p) * 100) : 0;
  return `<div class="dealrow">${thumb({ img: p.i, it })}
    <button class="rowbtn" type="button" data-act="historyItem" data-id="${esc(it?.id || "")}" ${it ? "" : "disabled"}><span class="nm">${pname(p.t)}</span>
      <span class="meta">${storeTag("tesco")}<span>online</span>${until ? `<span>until ${esc(dayLabel(until))}</span>` : ""}</span>
      <span class="meta">${pct ? `<span class="pill deal">−${pct} %</span>` : ""}${p.cc ? `<span class="pill card">Clubcard</span>` : ""}${p.promo ? `<span class="pill deal">${esc(p.promo)}</span>` : ""}${word ? `<span class="pill watch">★ ${esc(word)}</span>` : ""}</span></button>
    <div class="px">${kc(p.cc || p.p)}<small>${p.cc ? `was ${esc(kc(p.p))}` : p.was ? `was ${esc(kc(p.was))}` : ""}</small></div>
    <div class="add">${it ? `<button class="link" type="button" data-act="addItem" data-id="${esc(it.id)}">+ Add ${esc(it.name.toLowerCase())}</button>` : ""}</div></div>`;
}

// ---------- All deals ----------
const SORTS = [["disc", "Biggest % off"], ["save", "Biggest saving (Kč)"], ["real", "Best vs Tesco online"], ["unit", "Lowest price per kg / l"], ["price", "Lowest price"], ["ending", "Ending soonest"], ["new", "Newest"], ["az", "A–Z"]];
function filtered() {
  const p = S().dealPrefs, an = A(), t = today();
  const hidden = new Set(S().hiddenCats || []);
  const stores = new Set(p.stores?.length ? p.stores : enabledStores());
  const cats = new Set(p.cats || []);
  const q = norm(p.q || "");
  const list = [];
  for (const d of baseDeals({ upcoming: true })) {
    if (!stores.has(d.s)) continue;
    if (cats.size ? !cats.has(d.kc) : hidden.has(d.kc)) continue;
    if (p.minDisc && !(d.d >= p.minDisc)) continue;
    if (p.card === "hide" && d.app) continue;
    if (p.card === "only" && !d.app) continue;
    const r = an(d);
    if (p.timing === "now" && r.upcoming) continue;
    if (p.timing === "soon" && !(r.endsSoon && !r.upcoming)) continue;
    if (p.timing === "later" && !r.upcoming) continue;
    if (p.realOnly && ((r.real && r.real.pct < 0) || (r.usual && r.usual.pct < 0))) continue;
    if (p.stockOnly && !r.stockUp) continue;
    if (p.newOnly && !r.isNew) continue;
    if (q && !norm(d.n).includes(q) && !norm(en(d.n)).includes(q)) continue;
    list.push({ d, r });
  }
  const by = {
    disc: (a, b) => (b.d.d || 0) - (a.d.d || 0) || b.r.saving - a.r.saving,
    save: (a, b) => b.r.saving - a.r.saving || (b.d.d || 0) - (a.d.d || 0),
    real: (a, b) => (b.r.real?.pct ?? -999) - (a.r.real?.pct ?? -999) || (b.d.d || 0) - (a.d.d || 0),
    unit: (a, b) => unitRank(a) - unitRank(b),
    price: (a, b) => a.d.p - b.d.p,
    ending: (a, b) => (a.d.until || "9999") < (b.d.until || "9999") ? -1 : (a.d.until || "9999") > (b.d.until || "9999") ? 1 : (b.d.d || 0) - (a.d.d || 0),
    new: (a, b) => (b.d.fs || "") < (a.d.fs || "") ? -1 : (b.d.fs || "") > (a.d.fs || "") ? 1 : (b.d.d || 0) - (a.d.d || 0),
    az: (a, b) => en(a.d.n).localeCompare(en(b.d.n)),
  }[p.sort] || ((a, b) => (b.d.d || 0) - (a.d.d || 0));
  return list.sort(by);
}
// per-kg and per-litre prices first (cheapest first), then per-piece, then unknown
const unitRank = x => (x.r.unit ? (x.r.unit.per === "ks" ? 1e6 : 0) + x.r.unit.p : 2e6);
function activeFilters() {
  const p = S().dealPrefs; let n = 0;
  if (p.minDisc) n++; if (p.card !== "include") n++; if (p.timing !== "all") n++; if (p.realOnly) n++; if (p.stockOnly) n++; if (p.newOnly) n++;
  return n;
}
function seg(key, opts) {
  const cur = S().dealPrefs[key];
  return `<div class="seg small-seg">${opts.map(([v, l]) => `<button type="button" data-act="dp" data-k="${key}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join("")}</div>`;
}
function renderAll() {
  const p = S().dealPrefs, stores = enabledStores();
  const list = filtered();
  const present = new Set(baseDeals({ upcoming: true }).map(d => d.kc));
  const hidden = new Set(S().hiddenCats || []);
  const nf = activeFilters();
  const anyFilter = nf || p.stores.length || p.cats.length || p.q || p.sort !== "disc";
  let html = `<section class="panel"><div class="filters">
    <input type="search" placeholder="Search deals (English or Czech)" value="${esc(p.q)}" data-input="dealQ" aria-label="Search deals">
    <div class="scroll-chips" role="group" aria-label="Shops">${stores.map(s => `<button class="chip${p.stores.includes(s) ? " on" : ""}" type="button" data-act="dpToggle" data-k="stores" data-v="${s}" aria-pressed="${p.stores.includes(s)}">${esc(STORES[s].name)}</button>`).join("")}</div>
    <div class="scroll-chips" role="group" aria-label="Categories">${DEAL_CATS.filter(([k]) => present.has(k) && (!hidden.has(k) || p.cats.includes(k))).map(([k, l]) => `<button class="chip${p.cats.includes(k) ? " on" : ""}" type="button" data-act="dpToggle" data-k="cats" data-v="${k}" aria-pressed="${p.cats.includes(k)}">${esc(l)}</button>`).join("")}</div>
    <div class="row"><label class="grow"><span class="sr">Sort</span><select data-change="dpSort" aria-label="Sort deals">${SORTS.map(([k, l]) => `<option value="${k}" ${p.sort === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <div class="seg" style="width:auto;flex:none"><button type="button" data-act="dp" data-k="group" data-v="false" aria-pressed="${!p.group}">List</button><button type="button" data-act="dp" data-k="group" data-v="true" aria-pressed="${!!p.group}">By shop</button></div></div>
    <details class="more"${nf || moreOpen ? " open" : ""}><summary>More filters${nf ? ` <span class="pill card">${nf}</span>` : ""}</summary><div class="stack" style="margin-top:10px">
      <div><span class="label">Discount</span>${seg("minDisc", [[0, "Any"], [20, "20 %+"], [30, "30 %+"], [50, "50 %+"]])}</div>
      <div><span class="label">Card and app deals</span>${seg("card", [["include", "Include"], ["hide", "Hide"], ["only", "Only these"]])}</div>
      <div><span class="label">When</span>${seg("timing", [["all", "All"], ["now", "On now"], ["soon", "Ending soon"], ["later", "Starting later"]])}</div>
      <label class="check"><input type="checkbox" data-change="dpCheck" data-k="realOnly" ${p.realOnly ? "checked" : ""}> Hide deals that aren't a real saving (dearer than Tesco online or the usual price)</label>
      <label class="check"><input type="checkbox" data-change="dpCheck" data-k="stockOnly" ${p.stockOnly ? "checked" : ""}> Stock-up deals only (long-life, lowest in 8 weeks)</label>
      <label class="check"><input type="checkbox" data-change="dpCheck" data-k="newOnly" ${p.newOnly ? "checked" : ""}> New in the last two days</label>
      <div><span class="label">Hide these categories everywhere</span><div class="chips" style="margin-top:6px">${DEAL_CATS.map(([k, l]) => `<button class="chip${hidden.has(k) ? " on" : ""}" type="button" data-act="hideCat" data-v="${k}" aria-pressed="${hidden.has(k)}">${hidden.has(k) ? "Hidden: " : ""}${esc(l)}</button>`).join("")}</div></div>
    </div></details>
    <div class="row" style="justify-content:space-between"><span class="hint">${list.length} deal${list.length === 1 ? "" : "s"}</span>${anyFilter ? `<button class="link" type="button" data-act="dpClear">Clear filters</button>` : ""}</div></div>`;
  if (!list.length) html += `<div class="empty">No deals match. Try fewer filters.</div>`;
  else if (p.group) {
    const groups = {};
    for (const x of list) (groups[x.d.s] ||= []).push(x);
    for (const s of Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)) {
      const g = groups[s];
      html += `<div class="group-h">${storeTag(s)} <span class="muted small">${g.length} deal${g.length === 1 ? "" : "s"}</span></div>` + g.slice(0, Math.max(10, Math.round(limit / 3))).map(x => dealRow(x.d, x.r)).join("");
      if (g.length > Math.max(10, Math.round(limit / 3))) html += `<div class="btnrow"><button class="ghost" type="button" data-act="moreDeals">More from ${esc(STORES[s].name)} and others</button></div>`;
    }
  } else {
    html += list.slice(0, limit).map(x => dealRow(x.d, x.r)).join("");
    if (list.length > limit) html += `<div class="btnrow"><button class="ghost" type="button" data-act="moreDeals">Show more</button></div>`;
  }
  html += `<p class="fine">${DATA.deals?.fetchedAt ? `Leaflets read ${esc(ago(DATA.deals.fetchedAt))} from kupi.cz. ` : ""}"Usual" is kupi.cz's usual price for the same product and size. "Under Tesco" compares with Tesco online's cheapest everyday price for the same item.</p></section>`;
  return html;
}

// ---------- tab ----------
export function renderDeals() {
  let html = `<div class="seg" role="group" aria-label="Deals view">${[["watch", "For you"], ["all", "All deals"], ["cook", "Cook"]].map(([k, l]) => `<button type="button" data-act="dealView" data-v="${k}" aria-pressed="${view === k}">${l}</button>`).join("")}</div>`;
  if (!DATA.deals) return html + `<section class="panel"><div class="empty"><b>No leaflet deals yet</b>They arrive with the first daily price fetch.</div></section>`;
  if (view === "all") return html + renderAll();
  if (view === "cook") return html + renderCook();
  const s = S(), list = forYou();
  // mark them as seen (the Deals badge counts unseen ones)
  const keys = list.map(x => x.key);
  if (keys.join("|") !== (s.seenDeals || []).join("|")) { s.seenDeals = keys; save(); }
  list.sort((a, b) => (a.word ? 0 : 1) - (b.word ? 0 : 1) || ((a.d?.until || a.until || "9999") < (b.d?.until || b.until || "9999") ? -1 : 1));
  const alertsOn = s.push?.on;
  html += `<section class="panel"><div class="panel-head"><h2>Your items on offer</h2><span class="muted small">${list.length}</span></div>
    <p class="hint">Offers on your staples, list, recipes and alert items, plus anything mentioning a watch word. Ending soonest first.</p>
    <div class="watchbox"><span class="label">Watch words</span><div class="chips" style="margin-top:6px">${s.watchWords.map(w => `<button class="chip on" type="button" data-act="delWord" data-w="${esc(w)}" aria-label="Stop watching ${esc(w)}">★ ${esc(w)} ✕</button>`).join("")}
      <form class="row" data-submit="addWord" style="flex:1 1 180px"><input id="wordIn" type="text" placeholder="Add a brand or product, e.g. Nutella" autocomplete="off" style="padding:7px 10px"><button class="ghost" type="submit" style="padding:7px 12px">Add</button></form></div></div>
    <button class="note alerts-line" type="button" data-act="openAlerts">${alertsOn ? `🔔 Sale alerts are on. Tap to change what you're told about.` : `🔔 Get a notification when your items go on offer. Tap to set up sale alerts.`}</button>`;
  if (!list.length) html += `<div class="empty">Nothing you usually buy is on offer right now.</div>`;
  else html += list.map(x => (x.p ? tescoRow(x) : dealRow(x.d, x.r, x.word))).join("");
  html += `<p class="fine">${DATA.deals.fetchedAt ? `Leaflets read ${esc(ago(DATA.deals.fetchedAt))} from kupi.cz.` : ""}</p></section>`;
  return html;
}

function renderCook() {
  const an = A(), all = baseDeals().filter(d => !d.app || S().settings.loyalty[d.s] !== false);
  const meat = all.filter(d => d.c === "meat" && an(d).unit?.per === "kg").sort((a, b) => an(a).unit.p - an(b).unit.p);
  const pickMeat = []; const seen = new Set();
  for (const d of meat) { const it = an(d).it; const k = it ? it.id : d.n; if (seen.has(k)) continue; seen.add(k); pickMeat.push(d); if (pickMeat.length >= 8) break; }
  const veg = all.filter(d => d.c === "produce").sort((a, b) => (b.d || 0) - (a.d || 0)).slice(0, 10);
  const dealIds = new Set(all.map(d => an(d).it?.id).filter(Boolean));
  const recs = S().recipes.map(r => ({ r, used: r.lines.filter(l => l.itemId && !l.optional && dealIds.has(l.itemId)) })).filter(x => x.used.length).sort((a, b) => b.used.length - a.used.length);
  let html = `<section class="panel"><div class="panel-head"><h2>Cheapest protein this week</h2></div><p class="hint">Meat and fish on offer, cheapest per kilo first.</p>${pickMeat.map(d => dealRow(d)).join("") || `<div class="empty">No meat or fish offers right now.</div>`}</section>`;
  html += `<section class="panel"><div class="panel-head"><h2>Fruit and veg on offer</h2></div>${veg.map(d => dealRow(d)).join("") || `<div class="empty">No fruit or veg offers right now.</div>`}</section>`;
  html += `<section class="panel"><div class="panel-head"><h2>Your recipes with ingredients on offer</h2></div>${recs.length ? recs.map(({ r, used }) => {
    const cost = recipeCost(r);
    return `<div class="recipe"><div><div class="nm">${esc(r.title || "Untitled recipe")}</div><div class="meta small muted">On offer: ${used.map(l => esc(itemOf(l.itemId)?.name.toLowerCase() || "")).join(", ")}</div></div><div class="px">${cost.perServing ? kc(cost.perServing) : "–"}<small>per serving</small></div><div class="acts"><button class="link" type="button" data-act="cookRecipe" data-id="${esc(r.id)}">Add to list</button></div></div>`;
  }).join("") : `<div class="empty">${S().recipes.length ? "None of your saved recipes use this week's offers." : "Save some recipes and the ones that use this week's offers show up here."}</div>`}</section>`;
  return html;
}

// ---------- actions ----------
on("dp", el => { const p = S().dealPrefs, k = el.dataset.k; let v = el.dataset.v; if (k === "minDisc") v = +v; if (k === "group") v = v === "true"; p[k] = v; limit = 60; changed(); });
on("dpToggle", el => { const p = S().dealPrefs, k = el.dataset.k, v = el.dataset.v; p[k] = p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v]; limit = 60; changed(); });
onChange("dpSort", el => { S().dealPrefs.sort = el.value; limit = 60; changed(); });
onChange("dpCheck", el => { S().dealPrefs[el.dataset.k] = el.checked; limit = 60; changed(); });
on("dpClear", () => { const q = S().dealPrefs; Object.assign(q, { stores: [], cats: [], sort: "disc", minDisc: 0, card: "include", timing: "all", realOnly: false, stockOnly: false, newOnly: false, q: "" }); limit = 60; changed(); });
on("hideCat", el => { const s = S(), v = el.dataset.v; s.hiddenCats = s.hiddenCats.includes(v) ? s.hiddenCats.filter(x => x !== v) : [...s.hiddenCats, v]; s.dealPrefs.cats = s.dealPrefs.cats.filter(x => x !== v); changed(); });
on("addWord", () => {
  const inp = $("wordIn"); const w = inp?.value.trim(); if (!w) return;
  inp.value = "";
  const s = S(); if (!s.watchWords.some(x => norm(x) === norm(w))) s.watchWords.push(w);
  changed(); scheduleAlertSync(); toast(`Watching “${w}”`);
});
on("addWordBtn", el => { const s = S(), w = el.dataset.w; if (!s.watchWords.some(x => norm(x) === norm(w))) s.watchWords.push(w); changed(); scheduleAlertSync(); toast(`Watching “${w}”`); openDeal(+el.dataset.i); });
on("delWord", el => { const s = S(), w = el.dataset.w, before = s.watchWords.slice(); s.watchWords = s.watchWords.filter(x => x !== w); changed(); scheduleAlertSync(); if ($("alQ")) openAlerts(); toast(`Stopped watching “${w}”`, () => { s.watchWords = before; changed(); scheduleAlertSync(); }); });
on("openDeal", el => openDeal(+el.dataset.i));
on("openAlerts", () => openAlerts());

// ---------- deal detail ----------
export function openDeal(i) {
  const d = (DATA.index.deals || []).find(x => x.i === i); if (!d) return;
  const r = A()(d), it = r.it, s = S();
  const t = today();
  const valid = d.from && d.from > t ? `${dayLabel(d.from)} to ${dayLabel(d.until)}` : d.until ? `until ${dayLabel(d.until)}` : "dates not given";
  let html = `<div class="row" style="align-items:flex-start">${thumb({ it, cat: d.c, big: true })}<div class="grow"><div class="nm" style="font-weight:700;font-size:17px">${pname(d.n)}</div>
      <div class="meta small" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${storeTag(d.s)}${fmtName(d) ? `<span class="muted">${esc(fmtName(d))}</span>` : ""}<span class="muted">${esc(DEAL_CAT_NAME[d.kc] || "")}</span></div></div></div>
    <div class="summary" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="kpi"><span class="label">Price</span><span class="big">${kc(d.p)}</span><span class="sub">${esc(d.a || "")}${r.unit ? ` · ${esc(kcPer(r.unit))}` : ""}</span></div>
      ${r.usual ? `<div class="kpi"><span class="label">${r.usual.pct >= 0 ? `${r.usual.pct} % below usual` : `${-r.usual.pct} % above usual`}</span><span class="big">${r.usual.pct >= 0 ? `−${kc(r.saving, true)}` : `+${kc(d.p - r.usual.p, true)}`}</span><span class="sub">usual price ${esc(kc(r.usual.p))}</span></div>`
        : `<div class="kpi"><span class="label">${d.d ? `${d.d} % off` : "Offer"}</span><span class="big">${r.saving >= 1 ? `−${kc(r.saving, true)}` : "–"}</span><span class="sub">${r.was ? `was about ${esc(kc(r.was))}` : "no discount given"}</span></div>`}</div>
    <p class="small">Valid ${esc(valid)}${d.app ? ` · needs ${esc(LOYALTY[d.s])}` : ""}${r.isNew ? ` · <span class="pill new">New</span>` : ""}</p>`;
  // verdict
  const lines = [];
  if (r.usual) lines.push(r.usual.pct >= 0 ? `kupi.cz lists the usual price for this product and size as <b>${esc(kc(r.usual.p))}</b>, so this offer is ${r.usual.pct} % below it${d.d && Math.abs(d.d - r.usual.pct) >= 8 ? ` (the leaflet says −${d.d} %)` : ""}.` : `<b>Not a real deal:</b> it costs more than kupi.cz's usual price of ${esc(kc(r.usual.p))}.`);
  if (r.real && d.s !== "tesco") {
    if (r.real.pct >= 0) lines.push(`<b>${r.real.pct} % cheaper</b> than Tesco online's cheapest everyday ${esc((it?.name || "price").toLowerCase())} (${esc(kcPer(r.real.unit))}, ${esc(en(r.real.name))}).`);
    else lines.push(`<b>Tesco online is ${-r.real.pct} % cheaper</b> with ${esc(en(r.real.name))} at ${esc(kcPer(r.real.unit))}, so this offer isn't a real saving unless you want this brand.`);
  }
  if (r.stockUp) lines.push(`<b>Stock up:</b> it keeps, and this is the lowest price for ${esc(it.name.toLowerCase())} in 8 weeks.`);
  else if (r.lowest) lines.push(`The lowest price for ${esc(it.name.toLowerCase())} in 8 weeks.`);
  if (lines.length) html += `<div class="note">${lines.join("<br>")}</div>`;
  // same item at every shop
  if (it) {
    const { by } = pricesByStore(it, null, ctx());
    const rows = enabledStores().map(st => ({ st, c: by[st] })).filter(x => x.c).sort((a, b) => (a.c.unitP?.p ?? 1e9) - (b.c.unitP?.p ?? 1e9));
    if (rows.length) html += `<div><h3>${esc(it.name)} at every shop</h3><ul class="prices">${rows.map(({ st, c }, k) => `<li class="opt${k === 0 ? " best" : ""}">${thumb({ img: c.src === "tesco" ? c.img : null, it })}<span class="nm">${storeTag(st)} ${pname(c.name)}<span class="src">${esc(srcLabel(c))}</span></span><span class="px">${kc(c.price)}<small>${c.unitP ? esc(kcPer(c.unitP)) : esc(buyText(c))}</small></span></li>`).join("")}</ul></div>`;
  }
  // other sizes at this shop
  const sizes = (DATA.index.deals || []).filter(x => x !== d && x.s === d.s && norm(x.n) === norm(d.n) && (!x.until || x.until >= t));
  if (sizes.length) html += `<div><h3>Other sizes at ${esc(STORES[d.s].name)}</h3><ul class="prices">${sizes.map(x => `<li><span class="nm">${esc(x.a || "")} ${fmtName(x) ? `<span class="src">${esc(fmtName(x))}</span>` : ""}</span><span class="px">${kc(x.p)}<small>${x.u ? esc(kcPer(x.u)) : ""}${x.d ? ` · −${x.d} %` : ""}</small></span></li>`).join("")}</ul></div>`;
  // add to list
  if (it) {
    const units = it.unit === "g" ? ["g", "kg", ...(it.e ? ["ks"] : [])] : it.unit === "ml" ? ["ml", "l"] : ["ks"];
    html += `<form class="row" data-submit="dealAdd" data-id="${esc(it.id)}" style="align-items:flex-end"><label class="field grow"><span class="label">Add to your list</span><input id="daQty" type="number" step="any" min="0" inputmode="decimal" placeholder="one pack"></label>
      <label class="field" style="width:84px"><span class="label">Unit</span><select id="daUnit">${units.map(u => `<option>${u}</option>`).join("")}</select></label><button class="primary" type="submit" style="height:46px">Add</button></form>
      <label class="check"><input type="checkbox" data-change="alertItem" data-id="${esc(it.id)}" ${s.alerts?.[it.id] ? "checked" : ""}> Tell me when ${esc(it.name.toLowerCase())} is on offer</label>`;
  } else {
    html += `<div class="btnrow"><button class="primary" type="button" data-act="addDealName" data-name="${esc(d.n)}">Add to your list</button></div>`;
  }
  const brands = brandWords(d.n).filter(w => !s.watchWords.some(x => norm(x) === norm(w)));
  if (brands.length) html += `<div class="row wrap"><span class="small muted">Watch for this brand:</span>${brands.map(w => `<button class="chip" type="button" data-act="addWordBtn" data-w="${esc(w)}" data-i="${d.i}">★ ${esc(w)}</button>`).join("")}</div>`;
  if (d.l) html += `<p class="fine"><a href="https://www.kupi.cz${esc(d.l)}" target="_blank" rel="noopener noreferrer">Open this deal on kupi.cz</a></p>`;
  openSheet("Deal", html);
}
on("dealAdd", form => {
  const it = itemOf(form.dataset.id); if (!it) return;
  const v = num($("daQty").value), u = $("daUnit").value;
  const q = v > 0 ? toItemUnit(u === "kg" ? { v: v * 1000, u: "g" } : u === "l" ? { v: v * 1000, u: "ml" } : { v, u }, it) : null;
  const snap = snapshot(); addEntry(it.id, q, "deal", { have: false }); changed(); closeSheet();
  toast(`Added ${it.name.toLowerCase()}`, () => restore(snap));
});
