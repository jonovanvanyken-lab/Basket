// Everything the app remembers lives in this device's browser storage.
import { DEFAULT_STORES, STORES } from "./plan.js";

const KEY = "kcb.v1";
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function defaults() {
  return {
    v: 1,
    list: [],          // [{id, itemId, qty:{v,u}|null, have, lock:{store:key}, src, added}]
    staples: ["milk", "eggs", "bread", "butter", "banana"],
    pantry: ["salt", "pepper", "oil", "olive-oil", "oregano", "bay-leaves"],
    custom: [],        // items not in the dictionary
    book: [],          // price book [{id,itemId,store,name,p,pk,loose,per,date,app,src}]
    recipes: [],       // [{id,title,servings,url,lines:[{raw,itemId,qty,optional,note}],added}]
    trips: [],         // [{id,date,store,total,items,src}]
    checked: {},       // shop checklist ticks {entryId:true}
    mode: "cheapest",  // cheapest | single | split
    settings: {
      stores: Object.fromEntries(Object.keys(STORES).map(s => [s, DEFAULT_STORES.includes(s)])),
      loyalty: Object.fromEntries(Object.keys(STORES).map(s => [s, true])),
      splitMin: 80, bookMaxAge: 120, budget: 0, theme: "auto",
      gh: { owner: "", repo: "", token: "", branch: "" },
    },
    seenWelcome: false,
  };
}

let state = null;
export function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { raw = null; }
  const d = defaults();
  state = raw && raw.v === 1 ? { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}), stores: { ...d.settings.stores, ...(raw.settings?.stores || {}) }, loyalty: { ...d.settings.loyalty, ...(raw.settings?.loyalty || {}) }, gh: { ...d.settings.gh, ...(raw.settings?.gh || {}) } } } : d;
  return state;
}
export const S = () => state;
let saveTimer = null, saveOk = true;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); saveOk = true; }
    catch (e) { saveOk = false; console.warn("save failed", e); document.dispatchEvent(new CustomEvent("kcb:savefail")); }
  }, 120);
}
export const saveWorked = () => saveOk;

/** Backup without the GitHub token. */
export function exportBackup() {
  const copy = JSON.parse(JSON.stringify(state));
  copy.settings.gh.token = "";
  return JSON.stringify({ app: "kc-basket", exported: new Date().toISOString(), state: copy }, null, 1);
}
export function importBackup(text) {
  const j = JSON.parse(text);
  if (j.app !== "kc-basket" || !j.state || j.state.v !== 1) throw new Error("That isn't a Kč Basket backup.");
  const token = state.settings.gh.token;
  localStorage.setItem(KEY, JSON.stringify(j.state));
  load(); state.settings.gh.token = token; save();
}
export function reset() { localStorage.removeItem(KEY); load(); }
