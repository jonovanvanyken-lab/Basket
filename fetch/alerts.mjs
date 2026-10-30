// Sale alerts: after the morning fetch, find deals that match your alert list (data/alerts.json, written
// by the app) and send one push notification to your phone. Each deal is only notified once.
// The phone's address and the signing keys come from the PUSH_CONFIG repository secret.
import webpush from "web-push";
import { createHash } from "node:crypto";
import { buildIndex, STORES } from "../js/plan.js";
import { alertMatches } from "../js/deals.js";
import { kc, daysBetween } from "../js/units.js";

const hash = s => createHash("sha1").update(s).digest("hex").slice(0, 12);

export async function runAlerts({ configText, alerts, sent, tesco, deals, history, today, test = false, log = () => {}, send = (sub, payload, opts) => webpush.sendNotification(sub, payload, opts) }) {
  const res = { at: new Date().toISOString(), ok: true, matched: 0, sent: 0, error: null, test };
  let cfg;
  try { cfg = JSON.parse(configText); } catch { return { ...res, ok: false, error: "The PUSH_CONFIG secret isn't valid. Copy it again from the app (Settings → Sale alerts)." }; }
  if (!cfg?.subscription?.endpoint || !cfg.publicKey || !cfg.privateKey) return { ...res, ok: false, error: "The PUSH_CONFIG secret is incomplete. Copy it again from the app." };
  const opts = { vapidDetails: { subject: cfg.subject || "https://github.com", publicKey: cfg.publicKey, privateKey: cfg.privateKey }, TTL: 12 * 3600, urgency: "normal" };
  const push = async payload => {
    try { await send(cfg.subscription, JSON.stringify(payload), opts); res.sent++; return true; }
    catch (e) {
      const code = e.statusCode || 0;
      res.ok = false;
      res.error = code === 404 || code === 410 ? "Your phone's notification address has expired. Turn sale alerts on again in the app and copy the new code into PUSH_CONFIG."
        : code === 403 || code === 401 ? "The push service refused the keys. Copy the code from the app into PUSH_CONFIG again."
        : `Sending failed (${code || e.message}).`;
      return false;
    }
  };
  if (test) {
    await push({ title: "Kč Basket", body: "Sale alerts are working. You'll hear from me when your items go on offer.", url: "./#deals", tag: "kcb-test" });
    log(`push test: ${res.ok ? "sent" : res.error}`);
    return res;
  }
  if (!alerts) { log("alerts: no alert list yet"); return { ...res, error: null }; }

  const index = buildIndex(tesco, deals);
  const custom = alerts.custom || [];
  const matches = alertMatches({ index, history, custom, alerts, today });
  res.matched = matches.length;
  // forget sent deals after three weeks
  for (const [k, day] of Object.entries(sent)) if (daysBetween(day, today) > 21) delete sent[k];
  const fresh = matches.filter(m => !sent[hash(m.key)]);
  if (!fresh.length) { log(`alerts: ${matches.length} matching deals, nothing new`); return res; }
  // one line per item, cheapest first
  const byItem = new Map();
  for (const m of fresh.sort((a, b) => a.price - b.price)) { const k = m.it?.id || m.word || m.key; if (!byItem.has(k)) byItem.set(k, m); }
  const picks = [...byItem.values()];
  const line = m => `${m.it ? m.it.name : m.name} — ${STORES[m.store]?.name || m.store}${m.online ? " online" : ""} ${kc(m.price)}${m.disc ? ` (−${m.disc} %)` : ""}`;
  const title = picks.length === 1 ? `${picks[0].it ? picks[0].it.name : picks[0].name} is on offer` : `${picks.length} of your items are on offer`;
  const body = picks.slice(0, 4).map(line).join("\n") + (picks.length > 4 ? `\n+ ${picks.length - 4} more` : "");
  if (await push({ title, body, url: "./#deals", tag: "kcb-deals", count: fresh.length })) for (const m of fresh) sent[hash(m.key)] = today;
  log(`alerts: ${matches.length} matching deals, notified ${fresh.length}${res.error ? ` (${res.error})` : ""}`);
  return res;
}
