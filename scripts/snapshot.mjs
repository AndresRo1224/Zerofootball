/**
 * scripts/snapshot.mjs — Regenera src/data/snapshot.js con datos reales de la
 * liga por defecto (para primer pintado / offline). Lee la clave de .env.
 *   ->  npm run snapshot
 * Guarda solo los últimos ~80 partidos + la tabla completa para no abultar.
 */
import { writeFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, leagueById, seasonOf } from "../src/config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = "https://v3.football.api-sports.io";

function loadEnv() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const KEY = process.env.API_FOOTBALL_KEY;
if (!KEY) { console.error("Falta API_FOOTBALL_KEY en .env"); process.exit(1); }

const get = async (path, params) => {
  const usp = new URLSearchParams(params);
  const r = await fetch(`${UPSTREAM}/${path}?${usp}`, { headers: { "x-apisports-key": KEY } });
  return r.json();
};

const slimFixture = f => ({
  fixture: {
    id: f.fixture?.id, timestamp: f.fixture?.timestamp, date: f.fixture?.date,
    venue: { name: f.fixture?.venue?.name },
    status: { short: f.fixture?.status?.short, elapsed: f.fixture?.status?.elapsed }
  },
  league: { round: f.league?.round },
  teams: {
    home: { id: f.teams?.home?.id, name: f.teams?.home?.name, logo: f.teams?.home?.logo },
    away: { id: f.teams?.away?.id, name: f.teams?.away?.name, logo: f.teams?.away?.logo }
  },
  goals: f.goals,
  score: { fulltime: f.score?.fulltime, halftime: f.score?.halftime, penalty: f.score?.penalty }
});

(async () => {
  const league = leagueById(CONFIG.DEFAULT_LEAGUE);
  const season = seasonOf(league);
  console.log(`Descargando ${league.name} ${season}…`);

  const [fx, st] = await Promise.all([
    get("fixtures", { league: league.id, season }),
    get("standings", { league: league.id, season })
  ]);

  const all = (fx.response || []).slice()
    .sort((a, b) => (a.fixture?.timestamp || 0) - (b.fixture?.timestamp || 0));
  const last = all.slice(-80).map(slimFixture);

  const out = {
    leagueId: league.id, season,
    fixtures: { response: last },
    standings: { response: st.response || [] }
  };

  const body =
`/**
 * data/snapshot.js — Instantánea de respaldo (offline / primer pintado).
 * Generada con \`npm run snapshot\`. ${league.name} · temporada ${season}.
 */
export default ${JSON.stringify(out)};
`;
  await writeFile(join(ROOT, "src", "data", "snapshot.js"), body, "utf8");
  console.log(`✓ snapshot.js (${last.length} partidos, ${(out.standings.response[0]?.league?.standings?.[0]?.length) || 0} equipos en tabla)`);
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
