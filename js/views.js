// The five tabs: List, Plan, Shop, Deals, Recipes.
import { S } from "./state.js";
import { DATA, plan, planFor, itemOf, enabledStores, ctx } from "./core.js";
import { assignment, STORES, LOYALTY, unitInBase } from "./plan.js";
import { CATS, CAT_NAME, CAT_ORDER, ITEMS } from "./dict.js";
import { findItem } from "./match.js";
import { esc, kc, storeTag, srcLabel, pills, buyText, dayLabel, ago } from "./ui.js";
import { fmtQty, kcPer, iso, norm, round2 } from "./units.js";

const qtyLabel = (e, it) => (e.qty ? fmtQty(e.qty.v, e.qty.u) : it ? `1 pack` : "");
const catOf = it => (it ? it.cat : "other");
function groupByCat(rows, get = r => catOf(r.it)) {
  const g = {};
  for (const r of rows) (g[get(r)] ||= []).push(r);
  return Object.entries(g).sort((a, b) => (CAT_ORDER[a[0]] ?? 99) - (CAT_ORDER[b[0]] ?? 99));
}

// ---------------- List ----------------
export function renderList() {
  const s = S(), p = plan();
  const rowsById = Object.fromEntries(p.rows.map(r => [r.e.id, r]));
  const entries = s.list.map(e => ({ e, it: itemOf(e.itemId), r: rowsById[e.id] }));
  const inList = new Set(s.list.map(e => e.itemId));
  const staples = s.staples.map(itemOf).filter(Boolean);
  let html = `<section class="panel">
    <form class="addbox" data-submit="add" autocomplete="off"><label class="grow"><span class="label" style="display:block;margin-bottom:6px">Add to your list</span>
      <input id="addInput" type="text" inputmode="text" enterkeyhint="done" placeholder="eggs, butter 500 g, 1 kg chicken thighs" aria-describedby="addHint"></label>
      <button class="primary" type="submit" style="align-self:flex-end;height:46px">Add</button></form>
    <div class="suggest" id="suggest" aria-live="polite"></div>
    <p class="hint" id="addHint" style="margin-top:6px">English or Czech. Separate items with commas.</p>
    <div class="quick" style="margin-top:12px">
      <button class="quick-btn" type="button" data-act="recipeImport"><span class="qi">❦</span><span><b>Paste a recipe</b><small>Text, or a link</small></span></button>
      <button class="quick-btn" type="button" data-act="receipt"><span class="qi">⎙</span><span><b>Read a receipt</b><small>Saves the prices you paid</small></span></button>
    </div></section>`;
  html += `<section class="panel"><div class="panel-head"><h2>Staples</h2><span class="row"><button class="link" type="button" data-act="addAllStaples">Add all</button><button class="link" type="button" data-act="editStaples">Edit</button></span></div>
    <div class="chips">${staples.length ? staples.map(it => `<button class="chip${inList.has(it.id) ? " on" : ""}" type="button" data-act="addStaple" data-id="${esc(it.id)}" aria-pressed="${inList.has(it.id)}">${inList.has(it.id) ? "✓ " : "+ "}${esc(it.name)}</button>`).join("") : `<p class="hint">No staples yet. Tap Edit to choose your weekly basics.</p>`}</div></section>`;
  if (!entries.length) {
    html += `<section class="panel"><div class="empty"><b>Your list is empty</b>Add items above, tap your staples, or paste a recipe.</div></section>`;
    return html;
  }
  const have = entries.filter(x => x.e.have).length;
  html += `<section class="panel"><div class="panel-head"><h2>Your list <span class="muted small">· ${entries.length} item${entries.length === 1 ? "" : "s"}</span></h2>
    <span class="row">${have ? `<button class="link" type="button" data-act="clearHave">Remove ${have} at home</button>` : ""}<button class="link" type="button" data-act="clearList">Clear</button></span></div>
    <p class="hint" style="margin-bottom:6px">Tick what you already have at home. Tap an item for every store's price.</p>`;
  for (const [cat, rows] of groupByCat(entries)) {
    html += `<div class="cat-h"><span class="label">${esc(CAT_NAME[cat] || "Other")}</span></div><ul class="items">`;
    for (const { e, it, r } of rows) {
      const best = r?.best;
      html += `<li class="${e.have ? "have" : ""}">
        <input type="checkbox" data-change="have" data-id="${esc(e.id)}" ${e.have ? "checked" : ""} aria-label="Already have ${esc(it?.name || "")}">
        <button class="rowbtn" type="button" data-act="openEntry" data-id="${esc(e.id)}">
          <span class="nm">${esc(it?.name || "?")}</span>${it && !it.custom ? ` <span class="cz">${esc(it.cz)}</span>` : ""}
          <span class="meta"><span class="qty">${esc(qtyLabel(e, it))}</span>${e.have ? `<span>At home</span>` : best ? `${storeTag(best.store)}<span class="src">${esc(srcLabel(best))}</span>` : `<span>No price yet</span>`}${e.lock && Object.keys(e.lock).length ? `<span class="pill">Brand chosen</span>` : ""}</span>
        </button>
        <span class="px">${e.have ? "" : best ? `${kc(best.cost)}<small>${esc(buyText(best))}</small>` : "–"}</span></li>`;
    }
    html += `</ul>`;
  }
  html += `</section>`;
  return html;
}

// ---------------- Plan ----------------
export function renderPlan() {
  const s = S(), p = plan();
  if (!p.rows.length) return `<section class="panel"><div class="empty"><b>Nothing to compare yet</b>Add items on the List tab and the plan shows where each one is cheapest.</div></section>`;
  if (!DATA.tesco && !DATA.deals && !s.book.length) return `<section class="panel"><div class="empty"><b>No prices yet</b>The first daily price fetch hasn't run. Open the menu → Price data to see why, or log prices you know in the price book.</div></section>`;
  const mode = s.mode;
  const stores = new Set(p.rows.filter(r => r.best).map(r => r.best.store));
  const bs = p.bestSingle, sp = p.splitAny;
  let html = `<div class="summary" role="group" aria-label="Plan">
    <button class="kpi" type="button" data-act="mode" data-mode="cheapest" aria-pressed="${mode === "cheapest"}"><span class="label">Cheapest each</span><span class="big">${kc(p.perItem.total, true)}</span><span class="sub">${stores.size} store${stores.size === 1 ? "" : "s"}${p.perItem.missing ? ` · ${p.perItem.missing} not priced` : ""}</span></button>
    <button class="kpi" type="button" data-act="mode" data-mode="single" aria-pressed="${mode === "single"}" ${bs ? "" : "disabled"}><span class="label">One store</span><span class="big">${bs ? kc(bs.total, true) : "–"}</span><span class="sub">${bs ? `${esc(STORES[bs.store].name)}${bs.missing.length ? ` · ${bs.missing.length} not priced there` : ""}` : "No prices"}</span></button>
    <button class="kpi" type="button" data-act="mode" data-mode="split" aria-pressed="${mode === "split"}" ${sp ? "" : "disabled"}><span class="label">Two stores</span><span class="big">${sp ? kc(sp.total, true) : "–"}</span><span class="sub">${sp ? `${sp.stores.map(x => esc(STORES[x].name)).join(" + ")} · saves ${kc(Math.max(0, sp.savings), true)}` : "Not enough prices"}</span></button>
  </div>`;
  if (sp && !p.split) html += `<p class="note">Splitting between ${sp.stores.map(x => STORES[x].name).join(" and ")} saves only ${kc(Math.max(0, sp.savings), true)} over ${bs ? STORES[bs.store].name : "one store"}, under your ${kc(p.threshold, true)} threshold. One shop is probably worth it.</p>`;
  else if (p.split) html += `<p class="note">Two shops save ${kc(p.split.savings, true)} on the items ${STORES[bs.store].name} prices. That's over your ${kc(p.threshold, true)} threshold.</p>`;
  // store totals
  if (p.singles.length) {
    const max = Math.max(...p.singles.map(x => x.total));
    html += `<section class="panel"><div class="panel-head"><h2>Whole list at one store</h2></div><div class="bars">${p.singles.map(x => `<div class="bar"><div class="bar-top"><span>${storeTag(x.store)} <span class="muted small">${x.priced} of ${p.rows.length} priced</span></span><span class="v">${kc(x.total, true)}</span></div><div class="track"><div class="fill ${x.store}" style="width:${Math.round((x.total / max) * 100)}%"></div></div></div>`).join("")}</div>
      <p class="fine">Totals only count the items that store has a price for. Albert and Lidl prices come from this week's leaflets and your price book, so they cover fewer items than Tesco.</p></section>`;
  }
  // items
  const asg = assignment(p, mode);
  const priced = p.rows.filter(r => asg[r.e.id]), unpriced = p.rows.filter(r => !asg[r.e.id]);
  html += `<section class="panel"><div class="panel-head"><h2>${mode === "single" ? "One-store plan" : mode === "split" ? "Two-store plan" : "Cheapest for each item"}</h2></div><ul class="items">`;
  for (const r of priced) {
    const c = r.by[asg[r.e.id]];
    const away = mode === "single" && bs && asg[r.e.id] !== bs.store;
    html += `<li style="grid-template-columns:minmax(0,1fr) auto">
      <button class="rowbtn" type="button" data-act="openEntry" data-id="${esc(r.e.id)}"><span class="nm">${esc(r.it.name)}</span> <span class="cz">${esc(c.name)}</span>
        <span class="meta">${storeTag(c.store)}<span class="qty">${esc(qtyLabel(r.e, r.it))}</span><span class="src">${esc(srcLabel(c))}</span>${pills(c, r)}${away ? `<span class="pill warn">Not priced at ${esc(STORES[bs.store].name)}</span>` : ""}</span></button>
      <span class="px">${kc(c.cost)}<small>${esc(buyText(c))}${c.unitP ? `<br>${esc(kcPer(c.unitP))}` : ""}</small></span>
      ${r.swap ? `<button class="swap" type="button" data-act="swap" data-id="${esc(r.e.id)}" data-to="${esc(r.swap.item.id)}" style="grid-column:1/-1">Swap idea: ${esc(r.swap.item.name)} is ${Math.round(r.swap.save * 100)} % cheaper per ${esc(c.unitP?.per || "unit")} at ${esc(STORES[r.swap.cand.store].name)} (${esc(kcPer(r.swap.cand.unitP))})</button>` : ""}</li>`;
  }
  html += `</ul></section>`;
  if (unpriced.length) {
    html += `<section class="panel"><div class="panel-head"><h2>No price yet</h2></div><ul class="items">${unpriced.map(r => `<li style="grid-template-columns:minmax(0,1fr) auto"><span><span class="nm">${esc(r.it?.name || "?")}</span><span class="meta">${r.it?.custom ? "Not in the dictionary, so it needs its own Tesco search." : "No store has a current price for it."}</span></span><button class="link" type="button" data-act="logPrice" data-item="${esc(r.e.itemId)}">Log a price</button></li>`).join("")}</ul>
      ${unpriced.some(r => r.it?.custom) ? `<div class="btnrow"><button class="ghost" type="button" data-act="fetchNow">Look these up at Tesco now</button></div>` : ""}</section>`;
  }
  return html;
}

// ---------------- Shop ----------------
export function shopGroups() {
  const s = S(), p = plan(), asg = assignment(p, s.mode);
  const groups = {};
  for (const r of p.rows) { const st = asg[r.e.id] || "anywhere"; (groups[st] ||= []).push({ r, c: r.by[st] || null }); }
  return Object.entries(groups).sort((a, b) => (a[0] === "anywhere") - (b[0] === "anywhere") || b[1].length - a[1].length);
}
export function renderShop() {
  const s = S(), p = plan();
  if (!p.rows.length) return `<section class="panel"><div class="empty"><b>Nothing to buy</b>Your shopping checklist appears here, sorted by store and aisle.</div></section>`;
  const modeName = { cheapest: "cheapest for each item", single: "one store", split: "two stores" }[s.mode];
  let html = `<div class="seg" role="group" aria-label="Plan">${["cheapest", "single", "split"].map(m => `<button type="button" data-act="mode" data-mode="${m}" aria-pressed="${s.mode === m}">${{ cheapest: "Cheapest each", single: "One store", split: "Two stores" }[m]}</button>`).join("")}</div>
    <p class="hint">Following the ${modeName} plan. Ticks stay put if you close the app.</p>`;
  for (const [st, list] of shopGroups()) {
    const done = list.filter(x => s.checked[x.r.e.id]).length;
    const est = list.reduce((n, x) => n + (x.c?.cost || 0), 0);
    html += `<section class="panel"><div class="store-h"><h2>${st === "anywhere" ? "Anywhere" : `<i style="background:var(--s-${st})"></i>${esc(STORES[st].name)}`}</h2><span class="num small">${done}/${list.length}${est ? ` · ≈ ${kc(est, true)}` : ""}</span></div>
      <div class="progress" aria-hidden="true"><i style="width:${Math.round((done / list.length) * 100)}%"></i></div><ul class="items checks">`;
    for (const [cat, rows] of groupByCat(list, x => catOf(x.r.it))) {
      html += `<li style="display:block;border-top:0;padding:8px 0 0"><span class="label">${esc(CAT_NAME[cat] || "Other")}</span></li>`;
      for (const { r, c } of rows) {
        const on = !!s.checked[r.e.id];
        html += `<li class="${on ? "done" : ""}"><input type="checkbox" id="ck-${esc(r.e.id)}" data-change="check" data-id="${esc(r.e.id)}" ${on ? "checked" : ""}>
          <label for="ck-${esc(r.e.id)}" style="display:block;min-width:0"><span class="nm">${esc(r.it?.name || "?")}</span> <span class="cz">${esc(c ? c.name : r.it?.cz || "")}</span>
            <span class="meta"><span class="qty">${esc(c ? buyText(c) || qtyLabel(r.e, r.it) : qtyLabel(r.e, r.it))}</span>${c ? `<span class="src">${esc(srcLabel(c))}</span>${c.loyalty ? `<span class="pill card">${esc(LOYALTY[c.store])}</span>` : ""}` : ""}</span></label>
          <span class="px">${c ? kc(c.cost) : ""}</span></li>`;
      }
    }
    html += `</ul>${st !== "anywhere" ? `<div class="btnrow"><button class="primary" type="button" data-act="finish" data-store="${esc(st)}" ${done ? "" : "disabled"}>Finish at ${esc(STORES[st].name)}</button></div>` : ""}</section>`;
  }
  if (Object.keys(s.checked).length) html += `<div class="btnrow"><button class="ghost" type="button" data-act="untickAll">Untick everything</button></div>`;
  return html;
}

// ---------------- Deals ----------------
let dealView = "watch", dealStore = "all", dealCat = "all", dealQuery = "", dealLimit = 60;
export function setDealView(v) { dealView = v; dealLimit = 60; }
export function setDealFilter(k, v) { if (k === "store") dealStore = v; if (k === "cat") dealCat = v; if (k === "q") dealQuery = v; dealLimit = 60; }
export function moreDeals() { dealLimit += 60; }

function liveDeals() {
  const today = iso(), on = new Set(enabledStores()), loy = S().settings.loyalty;
  return (DATA.index.deals || []).filter(d => on.has(d.s) && (!d.until || d.until >= today) && (!d.from || d.from <= today) && (!d.app || loy[d.s] !== false));
}
const dealItemCache = new WeakMap();
function dealItem(d) { if (!dealItemCache.has(d)) dealItemCache.set(d, findItem(d.ws, S().custom)); return dealItemCache.get(d); }

export function watchIds() {
  const s = S(), ids = new Set([...s.staples, ...s.list.map(e => e.itemId)]);
  for (const r of s.recipes) for (const l of r.lines) if (l.itemId) ids.add(l.itemId);
  return ids;
}
function dealRow(d, it) {
  const until = d.until ? `until ${dayLabel(d.until)}` : "";
  const fmt = d.f && norm(d.f) !== norm(STORES[d.s]?.name || "") ? d.f : "";
  return `<div class="dealrow"><div><div class="nm">${esc(d.n)}</div><div class="meta">${storeTag(d.s)}${fmt ? `<span>${esc(fmt.replace(/^Albert\s*/i, ""))}</span>` : ""}${d.a ? `<span>${esc(d.a)}</span>` : ""}<span>${esc(until)}</span>${d.d ? `<span class="pill deal">−${d.d} %</span>` : ""}${d.app ? `<span class="pill card">${esc(LOYALTY[d.s])}</span>` : ""}${d.from && d.from > iso() ? `<span class="pill">from ${esc(dayLabel(d.from))}</span>` : ""}</div></div>
    <div class="px">${kc(d.p)}<small>${d.u ? esc(kcPer(d.u)) : ""}</small></div>
    <div class="add">${it ? `<button class="link" type="button" data-act="addItem" data-id="${esc(it.id)}">+ Add ${esc(it.name.toLowerCase())}</button>` : `<button class="link" type="button" data-act="addDealName" data-name="${esc(d.n)}">+ Add to list</button>`}</div></div>`;
}
function tescoOffers(ids) {
  const out = [], today = iso();
  for (const p of DATA.index.tesco || []) {
    if (!p.cc && !p.promo && !p.was) continue;
    const it = findItem(p.ws, S().custom); if (!it || !ids.has(it.id)) continue;
    const until = p.cc ? p.ccUntil : p.promoUntil;
    if (until && until < today) continue;
    out.push({ p, it, until });
  }
  return out;
}

export function renderDeals() {
  const all = liveDeals();
  let html = `<div class="seg" role="group" aria-label="Deals view">${[["watch", "For you"], ["all", "All deals"], ["cook", "Cook"]].map(([k, l]) => `<button type="button" data-act="dealView" data-v="${k}" aria-pressed="${dealView === k}">${l}</button>`).join("")}</div>`;
  if (!DATA.deals) return html + `<section class="panel"><div class="empty"><b>No leaflet deals yet</b>They arrive with the first daily price fetch.</div></section>`;
  const fetched = DATA.deals.fetchedAt ? `Leaflets read ${ago(DATA.deals.fetchedAt)} from kupi.cz.` : "";
  if (dealView === "watch") {
    const ids = watchIds();
    const mine = all.map(d => ({ d, it: dealItem(d) })).filter(x => x.it && ids.has(x.it.id))
      .sort((a, b) => (a.d.until || "9") < (b.d.until || "9") ? -1 : (a.d.until || "9") > (b.d.until || "9") ? 1 : (b.d.d || 0) - (a.d.d || 0));
    const tes = tescoOffers(ids);
    html += `<section class="panel"><div class="panel-head"><h2>Your items on offer</h2><span class="muted small">${mine.length + tes.length}</span></div>
      <p class="hint">Deals on your staples, your list and your saved recipes, ending soonest first.</p>`;
    if (!mine.length && !tes.length) html += `<div class="empty">Nothing you usually buy is on offer right now.</div>`;
    else {
      html += mine.map(x => dealRow(x.d, x.it)).join("");
      html += tes.map(({ p, it, until }) => `<div class="dealrow"><div><div class="nm">${esc(p.t)}</div><div class="meta">${storeTag("tesco")}<span>online</span>${until ? `<span>until ${esc(dayLabel(until))}</span>` : ""}${p.cc ? `<span class="pill card">Clubcard</span>` : ""}${p.promo ? `<span class="pill deal">${esc(p.promo)}</span>` : ""}</div></div>
        <div class="px">${kc(p.cc || p.p)}<small>${p.cc ? `was ${esc(kc(p.p))}` : p.was ? `was ${esc(kc(p.was))}` : ""}</small></div><div class="add"><button class="link" type="button" data-act="addItem" data-id="${esc(it.id)}">+ Add ${esc(it.name.toLowerCase())}</button></div></div>`).join("");
    }
    html += `<p class="fine">${esc(fetched)}</p></section>`;
    return html;
  }
  if (dealView === "all") {
    const stores = enabledStores();
    const q = norm(dealQuery);
    let list = all.filter(d => (dealStore === "all" || d.s === dealStore) && (dealCat === "all" || d.c === dealCat) && (!q || norm(d.n).includes(q)));
    list.sort((a, b) => (b.d || 0) - (a.d || 0) || a.p - b.p);
    const cats = CATS.filter(([k]) => all.some(d => d.c === k));
    html += `<section class="panel"><div class="filters">
      <input type="search" placeholder="Search deals (Czech)" value="${esc(dealQuery)}" data-input="dealQ" aria-label="Search deals">
      <div class="scroll-chips">${[["all", "All shops"], ...stores.map(s => [s, STORES[s].name])].map(([k, l]) => `<button class="chip${dealStore === k ? " on" : ""}" type="button" data-act="dealFilter" data-k="store" data-v="${k}">${esc(l)}</button>`).join("")}</div>
      <div class="scroll-chips">${[["all", "Everything"], ...cats].map(([k, l]) => `<button class="chip${dealCat === k ? " on" : ""}" type="button" data-act="dealFilter" data-k="cat" data-v="${k}">${esc(l)}</button>`).join("")}</div></div>
      <p class="hint" style="margin-top:8px">${list.length} deal${list.length === 1 ? "" : "s"}, biggest discount first.</p>
      ${list.slice(0, dealLimit).map(d => dealRow(d, dealItem(d))).join("") || `<div class="empty">No deals match.</div>`}
      ${list.length > dealLimit ? `<div class="btnrow"><button class="ghost" type="button" data-act="moreDeals">Show more</button></div>` : ""}
      <p class="fine">${esc(fetched)}</p></section>`;
    return html;
  }
  // cook from deals
  const meat = all.filter(d => d.c === "meat" && d.u && d.u.per === "kg").sort((a, b) => a.u.p - b.u.p);
  const pickMeat = []; const seenItem = new Set();
  for (const d of meat) { const it = dealItem(d); const k = it ? it.id : d.n; if (seenItem.has(k)) continue; seenItem.add(k); pickMeat.push(d); if (pickMeat.length >= 8) break; }
  const veg = all.filter(d => d.c === "produce").sort((a, b) => (b.d || 0) - (a.d || 0)).slice(0, 10);
  const dealIds = new Set(all.map(dealItem).filter(Boolean).map(i => i.id));
  const recs = S().recipes.map(r => {
    const used = r.lines.filter(l => l.itemId && !l.optional && dealIds.has(l.itemId));
    return { r, used };
  }).filter(x => x.used.length).sort((a, b) => b.used.length - a.used.length);
  html += `<section class="panel"><div class="panel-head"><h2>Cheapest protein this week</h2></div><p class="hint">Meat and fish on offer, cheapest per kilo first.</p>${pickMeat.map(d => dealRow(d, dealItem(d))).join("") || `<div class="empty">No meat or fish offers right now.</div>`}</section>`;
  html += `<section class="panel"><div class="panel-head"><h2>Fruit and veg on offer</h2></div>${veg.map(d => dealRow(d, dealItem(d))).join("") || `<div class="empty">No fruit or veg offers right now.</div>`}</section>`;
  html += `<section class="panel"><div class="panel-head"><h2>Your recipes with ingredients on offer</h2></div>${recs.length ? recs.map(({ r, used }) => {
    const cost = recipeCost(r);
    return `<div class="recipe"><div><div class="nm">${esc(r.title || "Untitled recipe")}</div><div class="meta small muted">On offer: ${used.map(l => esc(itemOf(l.itemId)?.name.toLowerCase() || "")).join(", ")}</div></div><div class="px">${cost.perServing ? kc(cost.perServing) : "–"}<small>per serving</small></div><div class="acts"><button class="link" type="button" data-act="cookRecipe" data-id="${esc(r.id)}">Add to list</button></div></div>`;
  }).join("") : `<div class="empty">${S().recipes.length ? "None of your saved recipes use this week's offers." : "Save some recipes and the ones that use this week's offers show up here."}</div>`}</section>`;
  return html;
}

// ---------------- Recipes ----------------
export function recipeEntries(r, servings) {
  const k = servings && r.servings ? servings / r.servings : 1;
  return r.lines.filter(l => l.itemId && l.include !== false).map((l, i) => ({ id: `${r.id}:${i}`, itemId: l.itemId, qty: l.qty ? { v: round2(l.qty.v * k), u: l.qty.u } : null }));
}
export function recipeCost(r) {
  const entries = recipeEntries(r).filter(e => !S().pantry.includes(e.itemId));
  const p = planFor(entries);
  let used = 0, shop = 0, missing = 0;
  for (const row of p.rows) { if (row.best) { used += row.best.used; shop += row.best.cost; } else missing++; }
  return { used: round2(used), shop: round2(shop), missing, perServing: r.servings ? round2(used / r.servings) : null, n: entries.length };
}
export function renderRecipes() {
  const s = S();
  let html = `<div class="quick"><button class="quick-btn" type="button" data-act="recipeImport"><span class="qi">❦</span><span><b>Paste a recipe</b><small>Ingredients as text</small></span></button>
    <button class="quick-btn" type="button" data-act="recipeImport" data-link="1"><span class="qi">↗</span><span><b>From a link</b><small>Reads the recipe page</small></span></button></div>`;
  if (!s.recipes.length) return html + `<section class="panel"><div class="empty"><b>No saved recipes</b>Saved recipes show what they cost per serving with today's prices, and which ones use this week's offers.</div></section>`;
  html += `<section class="panel"><div class="panel-head"><h2>Saved recipes</h2><span class="muted small">cost with today's cheapest prices</span></div>`;
  for (const r of [...s.recipes].sort((a, b) => (a.title || "").localeCompare(b.title || ""))) {
    const c = recipeCost(r);
    html += `<div class="recipe"><div><div class="nm">${esc(r.title || "Untitled recipe")}</div><div class="small muted">${r.servings ? `Serves ${r.servings} · ` : ""}${c.n} ingredients${c.missing ? ` · ${c.missing} not priced` : ""}</div></div>
      <div class="px">${c.perServing != null ? kc(c.perServing) : kc(c.used)}<small>${c.perServing != null ? "per serving" : "in total"} · shop ${esc(kc(c.shop, true))}</small></div>
      <div class="acts"><button class="link" type="button" data-act="cookRecipe" data-id="${esc(r.id)}">Add to list</button><button class="link" type="button" data-act="editRecipe" data-id="${esc(r.id)}">Edit</button><button class="link" type="button" data-act="deleteRecipe" data-id="${esc(r.id)}" style="color:var(--bad)">Delete</button></div></div>`;
  }
  html += `<p class="fine">"Per serving" counts only the share of each pack the recipe uses. "Shop" is what you'd pay for whole packs. Items you usually have at home are left out.</p></section>`;
  return html;
}
