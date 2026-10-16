// Replaces fetch() with canned pages so the fetch job can be tested without the network.
import { readFileSync } from "node:fs";
const dir = process.env.FIXTURES;
const page = n => readFileSync(dir + n, "utf8");
const empty = "<!doctype html><html><body><p>Nic nenalezeno</p></body></html>";
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const reply = (body, status = 200, finalUrl = u.href) => ({ ok: status < 400, status, url: finalUrl, text: async () => body, json: async () => JSON.parse(body) });
  if (u.host === "xapi.tesco.com") return reply("Invalid Client", 403);
  if (u.host === "nakup.itesco.cz") {
    if (u.pathname === "/shop/cs-CZ") return reply("<html><body>home</body></html>");
    const q = u.searchParams.get("query") || "";
    return reply(/m[aá]slo|banán|banan/i.test(q) ? page("tesco-tiles.html") : page("tesco-json.html"));
  }
  if (u.host === "www.kupi.cz") {
    if (u.searchParams.get("page")) return reply(page("kupi-lidl.html"), 200, u.origin + u.pathname); // redirect back to page 1 = no more pages
    if (/\/(ovoce-a-zelenina|nealko-napoje)\//.test(u.pathname)) return reply(page("kupi-lidl.html"));
    return reply(empty);
  }
  if (u.host === "example.com") return reply(page("recipe.html"));
  if (u.host === "api-free.deepl.com") {
    const body = JSON.parse(opts.body); globalThis.__deeplCalls = (globalThis.__deeplCalls || 0) + 1;
    if (opts.headers.Authorization !== "DeepL-Auth-Key test-key:fx") return reply("", 403);
    return reply(JSON.stringify({ translations: body.text.map(t => ({ text: "EN " + t })) }));
  }
  throw new Error("unexpected request " + u.href);
};
