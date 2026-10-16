// Translates new product and deal names with DeepL (when a DEEPL_KEY secret is set) and keeps them in
// data/translations.json, so each name is only translated once. Without a key the app uses its
// built-in glossary instead.
const MAX_ENTRIES = 15000;   // keep the file a sensible size
const RUN_BUDGET = 120000;   // characters per run (DeepL Free allows 500,000 a month)

export async function translateNames(names, cache, { key, fetchImpl = fetch, log = () => {} } = {}) {
  const want = [...new Set(names.map(s => String(s || "").trim()).filter(Boolean))].filter(n => !(n in cache));
  const res = { method: key ? "deepl" : "glossary", added: 0, waiting: want.length, error: null };
  if (!key || !want.length) return res;
  const url = /:fx$/.test(key) ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
  let used = 0;
  for (let i = 0; i < want.length; i += 50) {
    const batch = [];
    for (const n of want.slice(i, i + 50)) { if (used + n.length > RUN_BUDGET) break; batch.push(n); used += n.length; }
    if (!batch.length) break;
    let r;
    try {
      r = await fetchImpl(url, { method: "POST", headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: batch, source_lang: "CS", target_lang: "EN-GB", context: "Supermarket product names from Czech grocery shops." }) });
    } catch (e) { res.error = "DeepL couldn't be reached: " + e.message; break; }
    if (r.status === 456) { res.error = "DeepL's free monthly allowance is used up; the glossary fills in until it resets."; break; }
    if (r.status === 403) { res.error = "DeepL didn't accept the key."; break; }
    if (!r.ok) { res.error = `DeepL answered HTTP ${r.status}`; break; }
    const j = await r.json();
    (j.translations || []).forEach((t, k) => { if (t?.text) { cache[batch[k]] = t.text.trim(); res.added++; } });
    if (batch.length < 50 && i + 50 < want.length) break; // budget reached
  }
  res.waiting = want.length - res.added;
  // trim the oldest entries
  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete cache[k];
  log(`translate: ${res.added} new names translated${res.waiting ? `, ${res.waiting} waiting` : ""}${res.error ? ` (${res.error})` : ""}`);
  return res;
}
