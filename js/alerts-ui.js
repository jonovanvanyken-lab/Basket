// Sale alerts: what to be told about, and push notifications on this phone.
// The morning job on GitHub reads data/alerts.json (your alert list, saved there by this screen) and sends the
// notification. It needs the phone's push address and signing keys, which you paste once into a repository
// secret called PUSH_CONFIG. The keys are made on this phone.
import { S, save } from "./state.js";
import { DATA, itemOf, enabledStores, changed, bump, gh, suggest } from "./core.js";
import { $, esc, on, onChange, openSheet, setSheet, toast, ago } from "./ui.js";
import { iso, num, kcPer } from "./units.js";

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => { const p = s.replace(/-/g, "+").replace(/_/g, "/"); const b = atob(p + "===".slice((p.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => !!(navigator.standalone || matchMedia("(display-mode: standalone)").matches);
const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// ---------- the alert list, saved to GitHub ----------
export function alertList() {
  const s = S();
  const ids = [...new Set([...(s.alertStaples ? s.staples : []), ...Object.keys(s.alerts || {})])].filter(id => itemOf(id));
  return {
    v: 1, updated: new Date().toISOString(),
    items: ids.map(id => ({ id, ...(s.alerts?.[id]?.maxUnit ? { maxUnit: s.alerts[id].maxUnit } : {}) })),
    words: s.watchWords, minDisc: s.alertMinDisc || 0, stores: enabledStores(), loyalty: s.settings.loyalty,
    custom: s.custom.filter(c => ids.includes(c.id)),
  };
}
let syncTimer = null;
export function scheduleAlertSync(now = false) {
  clearTimeout(syncTimer);
  if (!S().push?.on || !gh()) return;
  syncTimer = setTimeout(syncAlerts, now ? 0 : 3500);
}
export async function syncAlerts() {
  const g = gh(), p = S().push; if (!g || !p.on) return false;
  try { await g.writeJson("data/alerts.json", alertList(), "Update sale alerts"); p.synced = new Date().toISOString(); p.syncError = ""; save(); bump(); return true; }
  catch (e) { p.syncError = e.message; save(); bump(); return false; }
}

// ---------- turning notifications on ----------
async function enablePush() {
  const msg = t => { const m = $("alMsg"); if (m) { m.textContent = t; m.className = "hint err"; } };
  if (!gh()) return msg("Connect GitHub first (Settings → GitHub connection). The morning job needs to know what to alert you about.");
  if (!canPush()) return msg(isIOS() ? "This needs iOS 16.4 or later, with Kč Basket added to your Home Screen and opened from there." : "This browser can't receive notifications.");
  if (isIOS() && !standalone()) return msg("Open Kč Basket from its Home Screen icon (not in Safari or Chrome) and try again. iPhones only allow notifications for apps on the Home Screen.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return msg("Notifications are blocked. Allow them for Kč Basket in your phone's Settings → Notifications, then try again.");
  try {
    const reg = await navigator.serviceWorker.ready;
    const p = S().push;
    if (!p.publicKey || !p.privateKey) {
      const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      p.publicKey = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
      p.privateKey = (await crypto.subtle.exportKey("jwk", kp.privateKey)).d;
    }
    const old = await reg.pushManager.getSubscription();
    if (old && old.options?.applicationServerKey && b64u(old.options.applicationServerKey) !== p.publicKey) await old.unsubscribe();
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(p.publicKey) });
    p.on = true; p.endpoint = sub.endpoint; p.sub = sub.toJSON(); p.configured = false;
    save(); await syncAlerts(); openAlerts();
  } catch (e) { msg("The phone couldn't set up notifications: " + (e.message || e)); }
}
export const pushConfig = () => { const p = S().push; return JSON.stringify({ publicKey: p.publicKey, privateKey: p.privateKey, subject: location.origin + location.pathname, subscription: p.sub }); };

async function sendTest() {
  const g = gh(), m = $("alTest"); if (!g || !m) return;
  const say = (t, err) => { m.textContent = t; m.className = err ? "hint err" : "hint"; };
  try {
    say("Asking GitHub to send a test…");
    const since = await g.dispatch({ test_push: "true", quick: "true", queries: "", recipe_url: "" });
    const run = await g.waitForRun(since, t => say(t));
    const st = await g.readJson("data/status.json").catch(() => null);
    if (st?.push?.ok) { S().push.configured = true; save(); say("Sent. It should arrive on this phone within a minute."); m.className = "hint ok"; }
    else say(st?.push?.error || (run.conclusion !== "success" ? "The GitHub run failed. If it says \"Unexpected inputs\", update the workflow file first (see the README)." : "GitHub didn't send it. Check the PUSH_CONFIG secret."), true);
  } catch (e) { say(e.message, true); }
}
async function disablePush() {
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch {}
  const p = S().push; p.on = false; p.endpoint = ""; p.sub = null; p.configured = false; save(); openAlerts();
  toast("Sale alerts are off. You can delete the PUSH_CONFIG secret on GitHub too.");
}
/** At start-up: if the phone dropped the subscription, say so. */
export async function checkPush() {
  const p = S().push; if (!p?.on || !canPush()) return null;
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); return sub && sub.endpoint === p.endpoint ? "ok" : "lost"; } catch { return null; }
}

// ---------- the screen ----------
export function openAlerts() {
  const s = S(), p = s.push, g = gh();
  const items = [...new Set([...(s.alertStaples ? s.staples : []), ...Object.keys(s.alerts || {})])].map(itemOf).filter(Boolean);
  const st = DATA.status?.push;
  let html = `<p class="hint">Each morning, after the prices are read, you get one notification listing anything below that has gone on offer. Each offer is only mentioned once.</p>
    <div><h3 style="margin-top:4px">Alert me about</h3>
      <label class="check"><input type="checkbox" data-change="alStaples" ${s.alertStaples ? "checked" : ""}> My staples (${s.staples.length})</label>
      <div class="chips" style="margin-top:8px">${Object.keys(s.alerts || {}).map(id => { const it = itemOf(id); if (!it) return ""; const a = s.alerts[id]; return `<button class="chip on" type="button" data-act="alDel" data-id="${esc(id)}" aria-label="Stop alerts for ${esc(it.name)}">${esc(it.name)}${a.maxUnit ? ` ≤ ${esc(kcPer({ p: a.maxUnit, per: it.unit === "g" ? "kg" : it.unit === "ml" ? "l" : "ks" }))}` : ""} ✕</button>`; }).join("") || `<span class="hint">No extra items yet.</span>`}</div>
      <input type="search" id="alQ" data-input="alQ" placeholder="Add an item (English or Czech)" autocomplete="off" style="margin-top:8px"><div class="suggest" id="alSug"></div>
      <p class="fine">Set a target price for an item from its own screen (tap it on your list): "only tell me when it's under …".</p></div>
    <div><h3>Watch words</h3><div class="chips">${s.watchWords.map(w => `<button class="chip on" type="button" data-act="delWord" data-w="${esc(w)}">★ ${esc(w)} ✕</button>`).join("") || `<span class="hint">None yet. Add brands like Nutella or Pilsner on the Deals tab.</span>`}</div></div>
    <div><h3>Only offers of at least</h3><div class="seg">${[[0, "Any"], [20, "20 %"], [30, "30 %"], [50, "50 %"]].map(([v, l]) => `<button type="button" data-act="alMin" data-v="${v}" aria-pressed="${(s.alertMinDisc || 0) === v}">${l}</button>`).join("")}</div>
      <p class="fine">Items with a target price are alerted whenever they're under it, whatever the discount. Only shops you use in Settings count.</p></div>
    <div><h3>Notifications on this phone</h3>`;
  if (!p.on) {
    html += `<p class="hint">${!g ? "First connect GitHub in Settings. " : ""}${isIOS() && !standalone() ? "Open Kč Basket from its Home Screen icon to turn these on. " : ""}You'll be asked to allow notifications, then given a code to paste into GitHub once.</p>
      <p class="hint err" id="alMsg"></p><div class="btnrow"><button class="primary" type="button" data-act="alOn">Turn on sale alerts</button></div>`;
  } else {
    html += `<p class="small">${p.configured ? "✅ Working: the test notification was sent." : "Almost there. Add this code to GitHub, then send a test."}</p>
      <details${p.configured ? "" : " open"}><summary class="small" style="font-weight:600">Setup code for GitHub</summary>
        <ol class="small steps"><li>Copy the code.</li><li>On GitHub open your Basket repository → <b>Settings → Secrets and variables → Actions → New repository secret</b>.</li><li>Name it <code>PUSH_CONFIG</code>, paste the code, and click <b>Add secret</b>.</li></ol>
        <textarea id="alCode" readonly rows="4" class="code">${esc(pushConfig())}</textarea>
        <div class="btnrow"><button class="ghost" type="button" data-act="alCopy">Copy code</button></div>
        <p class="fine">The code lets GitHub send notifications to this phone only. Keep it in the secret, not in a file.</p></details>
      <p class="hint" id="alTest">${st ? (st.ok ? `Last alert run ${esc(ago(st.at))}: ${st.test ? "test sent" : `${st.matched} matching offers, ${st.sent ? "notification sent" : "nothing new"}`}.` : `Last run: ${esc(st.error || "failed")}`) : ""}</p>
      <div class="btnrow"><button class="primary" type="button" data-act="alTestBtn">Send a test notification</button><button class="ghost" type="button" data-act="alOff">Turn off</button></div>
      <p class="fine">Alert list saved to GitHub ${p.synced ? esc(ago(p.synced)) : "not yet"}${p.syncError ? ` · <span style="color:var(--bad)">${esc(p.syncError)}</span>` : ""}. <button class="link" type="button" data-act="alSync">Save now</button></p>
      <p class="fine">Because your repository is public, the alert list (data/alerts.json) can be seen there.</p>`;
  }
  html += `</div>`;
  openSheet("Sale alerts", html);
}
export function alertSuggest(q) {
  const box = $("alSug"); if (!box) return;
  box.innerHTML = suggest(q, 8).map(it => `<button class="chip" type="button" data-act="alAdd" data-id="${esc(it.id)}"><b>${esc(it.name)}</b>${it.custom ? "" : `<small>${esc(it.cz)}</small>`}</button>`).join("");
}
on("alOn", enablePush);
on("alOff", disablePush);
on("alTestBtn", sendTest);
on("alSync", async () => { if (await syncAlerts()) toast("Alert list saved to GitHub"); openAlerts(); });
on("alCopy", async () => { try { await navigator.clipboard.writeText(pushConfig()); toast("Copied"); } catch { const t = $("alCode"); t.select(); document.execCommand?.("copy"); toast("Copied"); } });
on("alAdd", el => { S().alerts[el.dataset.id] ||= {}; changed(); scheduleAlertSync(); openAlerts(); });
on("alDel", el => { delete S().alerts[el.dataset.id]; changed(); scheduleAlertSync(); openAlerts(); });
on("alMin", el => { S().alertMinDisc = +el.dataset.v; changed(); scheduleAlertSync(); openAlerts(); });
onChange("alStaples", el => { S().alertStaples = el.checked; changed(); scheduleAlertSync(); openAlerts(); });
// from an item's screen or a deal: toggle alerts for one item
onChange("alertItem", el => {
  const s = S(), id = el.dataset.id;
  if (el.checked) s.alerts[id] ||= {}; else delete s.alerts[id];
  changed(); scheduleAlertSync();
  toast(el.checked ? (s.push.on ? "You'll get a notification when it's on offer" : "Saved. Turn on sale alerts (Deals → For you) to get notifications.") : "Alert removed");
});
on("alertTarget", form => {
  const s = S(), id = form.dataset.id, v = num($("alTarget").value);
  s.alerts[id] ||= {};
  if (v > 0) s.alerts[id].maxUnit = v; else delete s.alerts[id].maxUnit;
  changed(); scheduleAlertSync(); toast(v > 0 ? "Target price saved" : "Target price removed");
});

// keep the saved alert list in step with staples, items, watch words and shops
let lastSig = null;
document.addEventListener("kcb:change", () => {
  if (!S()?.push?.on) return;
  const { updated, ...rest } = alertList(); const sig = JSON.stringify(rest);
  if (lastSig !== null && sig !== lastSig) scheduleAlertSync();
  lastSig = sig;
});
