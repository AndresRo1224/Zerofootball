/**
 * scripts/dev-proxy.mjs — Servidor de desarrollo (sin dependencias).
 *
 * Sirve los archivos estáticos Y reproduce el proxy /api/football usando la
 * clave de .env, igual que la función serverless de Vercel. Así puedes probar
 * en local con datos reales SIN exponer la clave en el cliente y sin tener que
 * desplegar.  ->  npm run dev   (http://localhost:5173)
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const PORT = process.env.PORT || 5173;
const UPSTREAM = "https://v3.football.api-sports.io";

// --- carga .env (simple) ---
function loadEnv() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const ALLOWED_PATHS = new Set(["fixtures", "standings", "teams", "leagues", "players"]);
const ALLOWED_PARAMS = new Set(["league", "season", "team", "date", "from", "to", "round",
  "live", "next", "last", "id", "search", "ids", "status", "timezone"]);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".map": "application/json"
};
const clean = v => {
  const s = String(Array.isArray(v) ? v[0] : v).slice(0, 64);
  return /^[A-Za-z0-9 _,:+\-]+$/.test(s) ? s : null;
};

// --- noticias (RSS -> JSON), igual que api/news.js ---
const NEWS_SOURCES = {
  md:   { url: "https://www.mundodeportivo.com/feed/rss/futbol/", name: "Mundo Deportivo" },
  espn: { url: "https://www.espn.com/espn/rss/soccer/news",       name: "ESPN" }
};
const decodeRss = s => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
function parseRss(xml, sourceName) {
  const items = []; const re = /<item[\s\S]*?<\/item>/g; let m;
  while ((m = re.exec(xml)) && items.length < 24) {
    const block = m[0];
    const pick = tag => { const r = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">").exec(block); return r ? decodeRss(r[1]) : ""; };
    const title = pick("title"); const link = pick("link") || pick("guid");
    if (!title || !link) continue;
    items.push({ title, link, summary: pick("description").slice(0, 180), date: pick("pubDate"), source: sourceName });
  }
  return items;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // --- proxy API ---
  if (url.pathname === "/api/football") {
    const ep = clean(url.searchParams.get("path") || "");
    if (!ep || !ALLOWED_PATHS.has(ep)) { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: "Endpoint no permitido" })); }
    const key = process.env.API_FOOTBALL_KEY;
    if (!key) { res.writeHead(500, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: "API_FOOTBALL_KEY no configurada (.env)" })); }
    const usp = new URLSearchParams();
    for (const [k, v] of url.searchParams) { if (k !== "path" && ALLOWED_PARAMS.has(k)) { const c = clean(v); if (c != null) usp.set(k, c); } }
    try {
      const up = await fetch(`${UPSTREAM}/${ep}?${usp}`, { headers: { "x-apisports-key": key } });
      const body = await up.text();
      res.writeHead(up.status, { "content-type": "application/json; charset=utf-8" });
      return res.end(body);
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "Error del proxy: " + e.message }));
    }
  }

  // --- predictor Python (Dixon-Coles) ---
  if (url.pathname === "/api/predict" && req.method === "POST") {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const py = spawn(process.platform === "win32" ? "python" : "python3", [join(ROOT, "api", "predict.py")]);
      let out = "", err = "";
      py.stdout.on("data", d => out += d);
      py.stderr.on("data", d => err += d);
      py.on("error", () => { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "python no disponible" })); });
      py.on("close", () => {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(out || JSON.stringify({ error: err || "sin salida" }));
      });
      py.stdin.write(body); py.stdin.end();
    });
    return;
  }

  // --- noticias ---
  if (url.pathname === "/api/news") {
    const src = NEWS_SOURCES[url.searchParams.get("source")] || NEWS_SOURCES.md;
    try {
      const r = await fetch(src.url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml, application/xml, text/xml" } });
      const xml = await r.text();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ source: src.name, items: parseRss(xml, src.name) }));
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "news", items: [] }));
    }
  }

  // --- estáticos ---
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = normalize(join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404: " + pathname);
  }
});

server.listen(PORT, () => {
  const ok = process.env.API_FOOTBALL_KEY ? "✓ clave cargada" : "✗ FALTA API_FOOTBALL_KEY en .env";
  console.log(`\n  Fútbol dev server  ->  http://localhost:${PORT}   (${ok})\n`);
});
