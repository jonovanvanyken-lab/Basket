// Kč Basket: start-up, tabs and the shared event handling.
import { load, S, save, saveWorked } from "./state.js";
import { loadData, addText, addEntry, changed, bump, snapshot, restore, suggest, itemOf, plan, DATA } from "./core.js";
import { $, esc, on, onChange, ACTIONS, CHANGES, toast, closeSheet, sheetOpen } from "./ui.js";
import { renderList, renderPlan, renderShop, renderDeals, renderRecipes, setDealView, setDealFilter, moreDeals } from "./views.js";
import { openMenu, freshness, applyTheme, openStatus, stapleSuggest, historySuggest, renderItemSheet } from "./sheets.js";

const TABS = { list: ["List", renderList], plan: ["Plan", renderPlan], shop: ["Shop", renderShop], deals: ["Deals", renderDeals], recipes: ["Recipes", renderRecipes] };
let tab = "list";

function render() {
  const [title, fn] = TABS[tab];
  $("topTitle").textContent = title;
  for (const k of Object.keys(TABS)) $("tab-" + k).hidden = k !== tab;
  document.querySelectorAll(".tabbar button").forEach(b => b.setAttribute("aria-current", b.dataset.go === tab ? "page" : "false"));
  const el = $("tab-" + tab);
  // keep focus and caret in the add box / search boxes across re-renders
  const act = document.activeElement; const keep = act && el.contains(act) && (act.id || act.dataset.input) ? { id: act.id, input: act.dataset.input, start: act.selectionStart, end: act.selectionEnd, value: act.value } : null;
  const scroll = window.scrollY;
  el.innerHTML = fn();
  if (keep) {
    const n = keep.id ? $(keep.id) : el.querySelector(`[data-input="${keep.input}"]`);
    if (n) { n.value = keep.value; n.focus(); try { n.setSelectionRange(keep.start, keep.end); } catch {} }
  }
  window.scrollTo(0, scroll);
  const f = freshness(); const fb = $("freshBtn");
  fb.className = "fresh " + f.cls; fb.innerHTML = `<span class="dot"></span>${esc(f.text)}`;
  // badge with the number of unticked items on the Shop tab
  const shopBtn = document.querySelector('.tabbar [data-go="shop"]');
  const left = S().list.filter(e => !e.have && !S().checked[e.id]).length;
  shopBtn.querySelector(".badge")?.remove();
  if (left) shopBtn.insertAdjacentHTML("beforeend", `<span class="badge">${left}</span>`);
}
let raf = 0;
function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { render(); if (sheetOpen()) renderItemSheet(); }); }
document.addEventListener("kcb:change", schedule);
document.addEventListener("kcb:savefail", () => toast("This device's storage is full, so the last change may not be kept. Save a backup in Settings."));

function go(t) { if (!TABS[t]) return; tab = t; window.scrollTo(0, 0); render(); try { sessionStorage.setItem("kcb.tab", t); } catch {} }

// ---- list actions ----
on("add", () => {
  const inp = $("addInput"); const v = inp.value.trim(); if (!v) return;
  const snap = snapshot();
  const added = addText(v);
  inp.value = ""; $("suggest").innerHTML = "";
  changed();
  const names = added.map(e => itemOf(e.itemId)?.name.toLowerCase()).filter(Boolean);
  toast(names.length === 1 ? `Added ${names[0]}` : `Added ${names.length} items`, () => restore(snap));
});
on("pick", el => {
  const inp = $("addInput"); const parts = inp.value.split(",");
  const last = parts.pop() || ""; const qty = last.match(/\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|ks|x)?\b/i)?.[0];
  const it = itemOf(el.dataset.id); if (!it) return;
  const snap = snapshot();
  const rest = parts.join(",").trim();
  if (rest) addText(rest);
  if (qty) addText(`${qty} ${it.name}`); else addEntry(it.id, null);
  inp.value = ""; $("suggest").innerHTML = ""; changed(); inp.focus();
  toast(`Added ${it.name.toLowerCase()}`, () => restore(snap));
});
on("addStaple", el => {
  const id = el.dataset.id; const cur = S().list.find(e => e.itemId === id);
  const snap = snapshot();
  if (cur) { S().list = S().list.filter(e => e !== cur); changed(); toast(`Removed ${itemOf(id)?.name.toLowerCase()}`, () => restore(snap)); }
  else { addEntry(id, null, "staple"); changed(); }
});
on("addAllStaples", () => { const snap = snapshot(); let n = 0; for (const id of S().staples) if (!S().list.some(e => e.itemId === id)) { addEntry(id, null, "staple"); n++; } changed(); toast(n ? `Added ${n} staples` : "Your staples are already on the list", n ? () => restore(snap) : null); });
on("addItem", el => { const snap = snapshot(); const e = addEntry(el.dataset.id, null, "deal", { have: false }); changed(); toast(`Added ${itemOf(e.itemId)?.name.toLowerCase()}`, () => restore(snap)); });
on("addDealName", el => { const snap = snapshot(); addText(el.dataset.name, "deal"); changed(); toast("Added to your list", () => restore(snap)); });
on("clearList", () => { const snap = snapshot(); S().list = []; S().checked = {}; changed(); toast("List cleared", () => restore(snap)); });
on("clearHave", () => { const snap = snapshot(); S().list = S().list.filter(e => !e.have); changed(); toast("Removed what you have at home", () => restore(snap)); });
onChange("have", el => { const e = S().list.find(x => x.id === el.dataset.id); if (e) { e.have = el.checked; changed(); } });
onChange("check", el => { if (el.checked) S().checked[el.dataset.id] = true; else delete S().checked[el.dataset.id]; changed(); });
on("untickAll", () => { const snap = snapshot(); S().checked = {}; changed(); toast("Unticked", () => restore(snap)); });
on("mode", el => { S().mode = el.dataset.mode; changed(); });
on("dealView", el => { setDealView(el.dataset.v); render(); });
on("dealFilter", el => { setDealFilter(el.dataset.k, el.dataset.v); render(); });
on("moreDeals", () => { moreDeals(); render(); });

// ---- delegated events ----
document.addEventListener("click", ev => {
  const close = ev.target.closest("[data-close]"); if (close) { closeSheet(); return; }
  const go_ = ev.target.closest("[data-go]"); if (go_) { go(go_.dataset.go); return; }
  const el = ev.target.closest("[data-act]"); if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act]; if (!fn) return;
  ev.preventDefault(); fn(el, ev);
});
document.addEventListener("submit", ev => {
  const f = ev.target.closest("[data-submit]"); if (!f) return;
  ev.preventDefault(); const fn = ACTIONS[f.dataset.submit]; if (fn) fn(f, ev);
});
document.addEventListener("change", ev => {
  const el = ev.target.closest("[data-change]"); if (!el) return;
  const fn = CHANGES[el.dataset.change]; if (fn) fn(el, ev);
});
document.addEventListener("input", ev => {
  const el = ev.target;
  if (el.id === "addInput") {
    const last = el.value.split(",").pop().replace(/\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|ks|x)?\b/gi, "").trim();
    const box = $("suggest");
    box.innerHTML = suggest(last).map(it => `<button class="chip" type="button" data-act="pick" data-id="${esc(it.id)}"><b>${esc(it.name)}</b>${it.custom ? "" : `<small>${esc(it.cz)}</small>`}</button>`).join("");
    return;
  }
  if (el.dataset.input === "dealQ") { setDealFilter("q", el.value); render(); return; }
  if (el.dataset.input === "stQ") { stapleSuggest(el.value); return; }
  if (el.dataset.input === "hiQ") { historySuggest(el.value); return; }
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && sheetOpen()) closeSheet(); });
$("menuBtn").addEventListener("click", openMenu);
$("freshBtn").addEventListener("click", openStatus);

// ---- start ----
load(); applyTheme();
try { const t = sessionStorage.getItem("kcb.tab"); if (t && TABS[t]) tab = t; } catch {}
render();
loadData().catch(e => { DATA.error = e; render(); });
if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("sw.js").catch(() => {});
window.addEventListener("online", () => loadData());
// test hook
window.__kcb = { S, plan, DATA, go, render };
