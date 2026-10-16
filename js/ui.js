// Small DOM helpers, formatting, sheets, toasts and SVG charts.
import { kc, daysBetween, iso, fmtQty } from "./units.js";
import { STORES, LOYALTY } from "./plan.js";
import { en, differs } from "./translate.js";
import { iconOf, CAT_ICON } from "./dict.js";
import { S } from "./state.js";

export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const attr = esc;

// ---- actions: one delegated listener, handlers registered by name ----
export const ACTIONS = {};
export const CHANGES = {};
export function on(name, fn) { ACTIONS[name] = fn; }
export function onChange(name, fn) { CHANGES[name] = fn; }

// ---- toast ----
let toastTimer = null;
export function toast(msg, undo) {
  const t = $("toast");
  t.innerHTML = esc(msg) + (undo ? ` <button type="button" id="toastUndo">Undo</button>` : "");
  t.hidden = false;
  if (undo) $("toastUndo").onclick = () => { t.hidden = true; undo(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, undo ? 6000 : 3200);
}

// ---- sheet (bottom drawer) ----
let sheetOnClose = null, lastFocus = null;
export function openSheet(title, html, { onClose } = {}) {
  lastFocus = document.activeElement;
  $("sheetTitle").textContent = title;
  $("sheetBody").innerHTML = html;
  $("sheet").hidden = false;
  document.body.style.overflow = "hidden";
  sheetOnClose = onClose || null;
  const first = $("sheetBody").querySelector("input:not([type=checkbox]),textarea,select");
  if (first && matchMedia("(min-width:700px)").matches) first.focus();
}
export function setSheet(html) { $("sheetBody").innerHTML = html; }
export function closeSheet() {
  if ($("sheet").hidden) return;
  $("sheet").hidden = true; document.body.style.overflow = "";
  const f = sheetOnClose; sheetOnClose = null; if (f) f();
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus?.();
}
export const sheetOpen = () => !$("sheet").hidden;

// ---- formatting ----
export function ago(day, today = iso()) {
  if (!day) return "";
  const d = daysBetween(day.slice(0, 10), today);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? `${d} days ago` : d < 60 ? `${Math.round(d / 7)} weeks ago` : `${Math.round(d / 30)} months ago`;
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayLabel(day, today = iso()) {
  if (!day) return "";
  const d = daysBetween(today, day);
  if (d === 0) return "today"; if (d === 1) return "tomorrow";
  const x = new Date(day + "T12:00:00");
  return `${DOW[x.getDay()]} ${x.getDate()}. ${x.getMonth() + 1}.`;
}
export function storeTag(s) { return `<span class="st ${esc(s)}"><i></i>${esc(STORES[s]?.name || s)}</span>`; }
export function srcLabel(c, today = iso()) {
  if (!c) return "";
  if (c.src === "tesco") return `Tesco online · ${ago(c.seen, today)}`;
  if (c.src === "deal") {
    const fmt = c.fmt && c.fmt.toLowerCase() !== (STORES[c.store]?.name || "").toLowerCase() ? ` ${c.fmt.replace(/^albert\s*/i, "")}` : "";
    return `Leaflet${fmt} · until ${dayLabel(c.until, today) || "?"}`;
  }
  if (c.src === "book") return `Your price · ${ago(c.seen, today)}`;
  return "";
}
export function pills(c, row) {
  const out = [];
  if (c?.loyalty) out.push(`<span class="pill card">${esc(LOYALTY[c.store] || "app")} price</span>`);
  if (c?.src === "deal" && c.disc) out.push(`<span class="pill deal">−${c.disc} %</span>`);
  else if (c?.src === "deal") out.push(`<span class="pill deal">Offer</span>`);
  if (c?.promo && c.src === "tesco") out.push(`<span class="pill deal">${esc(c.promo)}</span>`);
  if (row?.good) {
    if (row.good.lowest) out.push(`<span class="pill ok">Lowest in 8 weeks</span>`);
    else if (row.good.pct >= 8) out.push(`<span class="pill warn">${row.good.pct} % above 8-week low</span>`);
  }
  return out.join(" ");
}
export function buyText(c) {
  if (!c) return "";
  if (c.n == null && c.buyQty) return `≈ ${fmtQty(c.buyQty.v, c.buyQty.u)} loose`;
  if (c.pack) return `${c.n > 1 ? c.n + " × " : ""}${fmtQty(c.pack.v, c.pack.u)}`;
  return c.n > 1 ? `${c.n} ×` : "";
}
export { kc };

// ---- charts ----
/** Step-line chart. series: [{key, label, cls, pts:[[isoDay, value]]}], extra points: [{day, v, cls}] */
export function lineChart(series, { days = 120, today = iso(), unit = "", points = [] } = {}) {
  const W = 340, H = 150, L = 44, R = 8, T = 10, B = 22;
  const start = new Date(today + "T12:00:00"); start.setDate(start.getDate() - days);
  const s0 = iso(start);
  const all = series.flatMap(s => s.pts.map(p => p[1])).concat(points.map(p => p.v)).filter(v => v > 0);
  if (!all.length) return `<p class="hint">No price history yet. It builds up from the daily fetch and the prices you log.</p>`;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < hi * 0.08) { lo *= 0.95; hi *= 1.05; }
  const x = d => L + ((Math.max(0, Math.min(days, daysBetween(s0, d)))) / days) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const lines = series.map(s => {
    const pts = s.pts.filter(p => p[1] > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (!pts.length) return "";
    let d = "", prev = null;
    for (const [day, v] of pts) {
      const xx = x(day < s0 ? s0 : day), yy = y(v);
      d += prev == null ? `M${xx.toFixed(1)},${yy.toFixed(1)}` : `H${xx.toFixed(1)}V${yy.toFixed(1)}`;
      prev = v;
    }
    d += `H${x(today).toFixed(1)}`;
    return `<path d="${d}" fill="none" stroke="var(--s-${s.cls})" stroke-width="2.2" stroke-linejoin="round"/>`;
  }).join("");
  const dots = points.map(p => `<circle cx="${x(p.day).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.6" fill="var(--panel)" stroke="var(--s-${p.cls})" stroke-width="2"/>`).join("");
  const grid = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join("");
  const xl = [s0, iso(new Date(new Date(today + "T12:00:00").getTime() - (days / 2) * 864e5)), today].map((d, i) => `<text x="${x(d)}" y="${H - 5}" text-anchor="${i === 0 ? "start" : i === 2 ? "end" : "middle"}">${d.slice(8, 10)}.${+d.slice(5, 7)}.</text>`).join("");
  const legend = series.filter(s => s.pts.length).map(s => `<span><span class="st ${s.cls}"><i></i>${esc(s.label)}</span></span>`).join("") + (points.length ? `<span>○ your prices</span>` : "");
  return `<div class="chart" role="img" aria-label="Price history, ${esc(unit)}"><svg viewBox="0 0 ${W} ${H}">${grid}${lines}${dots}${xl}</svg></div><div class="legend">${legend}<span>Kč${unit ? "/" + esc(unit) : ""}</span></div>`;
}

export function barChart(rows, { fmt = v => kc(v, true) } = {}) {
  const max = Math.max(1, ...rows.map(r => r.v), ...rows.map(r => r.line || 0));
  return `<div class="bars">${rows.map(r => `<div class="bar"><div class="bar-top"><span>${r.label}</span><span class="v">${fmt(r.v)}${r.sub ? ` <span class="muted">${r.sub}</span>` : ""}</span></div><div class="track"><div class="fill ${esc(r.cls || "")}" style="width:${Math.round((r.v / max) * 100)}%"></div></div></div>`).join("")}</div>`;
}

// ---- English names and pictures ----
export const TESCO_IMG = "https://digitalcontent.api.tesco.com/v2/media/ghs/";
export const imgUrl = i => (i.startsWith("http") ? i : TESCO_IMG + i) + "?w=140";
const showCz = () => S()?.settings?.showCz !== false;
/** A Czech product name shown in English, with the Czech underneath (when it differs and the setting is on). */
export function pname(cz, { cls = "" } = {}) {
  const e = en(cz);
  return `<span class="pn ${cls}">${esc(e)}</span>${showCz() && differs(cz, e) ? `<span class="czn">${esc(cz)}</span>` : ""}`;
}
/** The item's Czech name as a small grey line (for finding it on the shelf). */
export const czLine = it => (it && !it.custom && showCz() ? `<span class="czn">${esc(it.cz)}</span>` : "");
/** Product photo (Tesco) or the item's icon. */
export function thumb({ img = null, it = null, cat = "other", big = false } = {}) {
  const ic = it ? iconOf(it) : CAT_ICON[cat] || "🛒";
  if (img && S()?.settings?.photos !== false) return `<span class="th${big ? " big" : ""}"><img src="${esc(imgUrl(img))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-ic="${esc(ic)}"></span>`;
  return `<span class="th ic${big ? " big" : ""}" aria-hidden="true">${ic}</span>`;
}
/** A photo that fails to load turns back into the icon. */
document.addEventListener("error", ev => {
  const t = ev.target;
  if (t?.tagName === "IMG" && t.dataset.ic && t.parentElement?.classList.contains("th")) { const p = t.parentElement; p.classList.add("ic"); p.textContent = t.dataset.ic; }
}, true);
