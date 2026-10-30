// Optional GitHub connection: lets the app start a quick price run ("Fetch now"), read a recipe link,
// and add searches to the daily run. Uses a fine-grained token limited to the app's own repository.
const API = "https://api.github.com";
const WF = "prices.yml";

export class GitHub {
  constructor({ owner, repo, token, branch }) { this.owner = owner.trim(); this.repo = repo.trim(); this.token = token.trim(); this.branch = branch || ""; }
  get ok() { return !!(this.owner && this.repo && this.token); }
  async req(path, opts = {}, raw = false) {
    const res = await fetch(`${API}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${path}`, {
      ...opts, cache: "no-store",
      headers: { Authorization: `Bearer ${this.token}`, Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    });
    if (res.status === 204) return null;
    const text = await res.text();
    if (!res.ok) {
      let msg = text; try { msg = JSON.parse(text).message || text; } catch {}
      const e = new Error(explain(res.status, msg)); e.status = res.status; throw e;
    }
    return raw ? text : text ? JSON.parse(text) : null;
  }
  async check() {
    const r = await this.req("");
    this.branch = r.default_branch;
    if (r.private) return { ok: true, branch: r.default_branch, note: "This repository is private, so GitHub Pages needs a paid plan to host the app from it." };
    return { ok: true, branch: r.default_branch };
  }
  async readRaw(path) { return this.req(`/contents/${path}${this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ""}`, {}, true); }
  async readJson(path) { return JSON.parse(await this.readRaw(path)); }
  /** Add searches to data/watch.json so the daily run includes them. */
  async addWatch(queries) {
    let sha = null, cur = { queries: [] };
    try { const f = await this.req(`/contents/data/watch.json`); sha = f.sha; cur = JSON.parse(b64dec(f.content)); } catch (e) { if (e.status !== 404) throw e; }
    const set = new Set(cur.queries || []); const before = set.size;
    for (const q of queries) if (q && q.length <= 60) set.add(q);
    if (set.size === before) return false;
    const next = { queries: [...set].sort() };
    await this.req(`/contents/data/watch.json`, { method: "PUT", body: JSON.stringify({ message: "Add searches", content: b64enc(JSON.stringify(next, null, 1) + "\n"), ...(sha ? { sha } : {}), ...(this.branch ? { branch: this.branch } : {}) }) });
    return true;
  }
  /** Create or replace a JSON file in the repository. */
  async writeJson(path, obj, message) {
    let sha = null;
    try { const f = await this.req(`/contents/${path}${this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ""}`); sha = f.sha; } catch (e) { if (e.status !== 404) throw e; }
    await this.req(`/contents/${path}`, { method: "PUT", body: JSON.stringify({ message, content: b64enc(JSON.stringify(obj, null, 1) + "\n"), ...(sha ? { sha } : {}), ...(this.branch ? { branch: this.branch } : {}) }) });
  }
  async dispatch(inputs) {
    if (!this.branch) await this.check();
    const since = Date.now();
    await this.req(`/actions/workflows/${WF}/dispatches`, { method: "POST", body: JSON.stringify({ ref: this.branch, inputs }) });
    return since;
  }
  /** Wait for the run started after `since` to finish. onTick(statusText) */
  async waitForRun(since, onTick = () => {}, timeoutMs = 8 * 60e3) {
    const end = Date.now() + timeoutMs; let run = null;
    while (Date.now() < end) {
      await new Promise(r => setTimeout(r, run ? 6000 : 4000));
      const r = await this.req(`/actions/workflows/${WF}/runs?event=workflow_dispatch&per_page=5`);
      run = (r.workflow_runs || []).find(x => new Date(x.created_at).getTime() >= since - 60e3) || null;
      if (!run) { onTick("Waiting for GitHub to start the run…"); continue; }
      if (run.status === "completed") return run;
      onTick(run.status === "in_progress" ? "Fetching prices on GitHub…" : "Queued on GitHub…");
    }
    throw new Error("The run is taking longer than usual. The prices will appear once it finishes.");
  }
}
function explain(status, msg) {
  if (status === 401) return "GitHub didn't accept the token. Check it hasn't expired.";
  if (status === 403) return "The token can't do that. It needs Actions: read and write, and Contents: read and write, on this repository.";
  if (status === 404) return "GitHub couldn't find that repository or file. Check the owner and repository name.";
  if (status === 422) return "GitHub couldn't start the run: " + msg;
  return `GitHub said: ${msg}`;
}
const b64enc = s => { const b = new TextEncoder().encode(s); let out = ""; for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(out); };
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), c => c.charCodeAt(0)));
export async function sha1hex(s) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
