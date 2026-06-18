/**
 * api/football.js — Proxy serverless (Vercel) hacia API-Football (API-Sports).
 *
 * POR QUÉ: la clave NUNCA debe ir en el cliente. Aquí vive como variable de
 * entorno secreta (process.env.API_FOOTBALL_KEY), configurada en Vercel y en el
 * .env local (que está en .gitignore). El navegador llama a /api/football?path=…
 * y esta función añade la cabecera x-apisports-key y reenvía a API-Sports.
 *
 * Defensa:
 *  - Allowlist de endpoints (no se puede pedir cualquier cosa).
 *  - Validación/saneo de parámetros (longitud y formato).
 *  - Caché de borde (s-maxage) para no agotar la cuota (plan gratis = 100/día).
 *  - Mismo origen (no se añaden cabeceras CORS permisivas).
 */

const UPSTREAM = "https://v3.football.api-sports.io";

// Endpoints permitidos del proxy.
const ALLOWED_PATHS = new Set(["fixtures", "standings", "teams", "leagues", "players"]);

// Parámetros que se pueden reenviar a API-Sports (lo demás se ignora).
const ALLOWED_PARAMS = new Set([
  "league", "season", "team", "date", "from", "to", "round",
  "live", "next", "last", "id", "search", "ids", "status", "timezone"
]);

// Caché por endpoint (segundos). Protege la cuota y acelera respuestas.
const CACHE_SECONDS = { fixtures: 45, standings: 300, teams: 86400, leagues: 86400, players: 600 };

function clean(value) {
  // Acepta solo cadenas cortas y seguras (sin permitir inyección de URL).
  const v = Array.isArray(value) ? value[0] : value;
  if (v == null) return null;
  const s = String(v).slice(0, 64);
  return /^[A-Za-z0-9 _,:+\-]+$/.test(s) ? s : null;
}

export default async function handler(req, res) {
  try {
    const { path, ...rest } = req.query || {};

    const ep = clean(path);
    if (!ep || !ALLOWED_PATHS.has(ep)) {
      res.status(400).json({ error: "Endpoint no permitido", allowed: [...ALLOWED_PATHS] });
      return;
    }

    const key = process.env.API_FOOTBALL_KEY;
    if (!key) {
      res.status(500).json({ error: "API_FOOTBALL_KEY no configurada en el servidor" });
      return;
    }

    const usp = new URLSearchParams();
    for (const [k, raw] of Object.entries(rest)) {
      if (!ALLOWED_PARAMS.has(k)) continue;
      const val = clean(raw);
      if (val != null) usp.set(k, val);
    }

    const upstreamUrl = `${UPSTREAM}/${ep}?${usp.toString()}`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000);

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        headers: { "x-apisports-key": key, "Accept": "application/json" },
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(to);
    }

    const data = await upstream.json().catch(() => ({ error: "Respuesta no válida del proveedor" }));

    const ttl = CACHE_SECONDS[ep] || 60;
    res.setHeader("Cache-Control", `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(upstream.status).json(data);
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    res.status(aborted ? 504 : 502).json({ error: aborted ? "Tiempo de espera agotado" : "Error del proxy" });
  }
}
