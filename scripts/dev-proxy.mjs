/**
 * scripts/dev-proxy.mjs — Servidor de desarrollo (sin dependencias).
 *
 * Sirve los archivos estáticos Y reproduce el proxy /api/football usando la
 * clave de .env, igual que la función serverless de Vercel. Así puedes probar
 * en local con datos reales SIN exponer la clave en el cliente y sin tener que
 * desplegar.  ->  npm run dev   (http://localhost:5173)
 */
import http from "node:http";
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
