/**
 * data/providers/apiSports.js — Cliente de API-Football vía NUESTRO proxy.
 *
 * No conoce ninguna clave: llama a CONFIG.API_BASE (/api/football) y el servidor
 * añade la cabecera secreta. Normaliza la respuesta de la API al "shape" interno
 * de partido que ya consumen el motor (EloModel, computeStandings) y la UI.
 */
import { CONFIG } from "../../config.js";
import { registerTeams } from "../teams.js";

/* ---------- llamada al proxy ---------- */
async function apiGet(path, params = {}, timeoutMs = 9000) {
  const url = new URL(CONFIG.API_BASE, location.origin);
  url.searchParams.set("path", path);
  for (const k in params) if (params[k] != null) url.searchParams.set(k, params[k]);

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || ("HTTP " + res.status));
    if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length) {
      // API-Football devuelve { errors: { plan: "..." } } cuando el plan no cubre algo.
      throw new Error(Object.values(json.errors)[0]);
    }
    return json;
  } finally {
    clearTimeout(to);
  }
}

/* ---------- estados de partido ---------- */
const LIVE = new Set(["1H", "2H", "ET", "BT", "P", "HT", "LIVE", "SUSP", "INT"]);
const DONE = new Set(["FT", "AET", "PEN"]);

/* ---------- ronda -> etapa/grupo ---------- */
const pad = n => String(n).padStart(2, "0");
function roundInfo(round, leagueType) {
  const r = round || "";
  let m = /^Group ([A-Z]) - /i.exec(r);          // UCL/Libertadores: "Group A - 1"
  if (m) return { stage: "group", group: m[1].toUpperCase() };
  if (/^Group Stage/i.test(r)) return { stage: "group", group: null };   // Mundial: "Group Stage - 1"
  if (/Final|Semi|Quarter|Round of|8th Finals|16th Finals|Play-?offs|Knockout/i.test(r))
    return { stage: "ko", group: null };
  return { stage: leagueType === "cup" ? "ko" : "league", group: null };
}

/* ---------- normalización de fixtures ---------- */
export function normalizeFixtures(json, leagueType) {
  const teamReg = [];
  const list = [];
  for (const f of (json.response || [])) {
    const home = f.teams?.home, away = f.teams?.away;
    if (!home?.name || !away?.name) continue;
    teamReg.push({ id: home.id, name: home.name, logo: home.logo });
    teamReg.push({ id: away.id, name: away.name, logo: away.logo });

    const short = f.fixture?.status?.short || "NS";
    const played = DONE.has(short);
    const live = LIVE.has(short);
    const ts = f.fixture?.timestamp ? f.fixture.timestamp * 1000 : Date.parse(f.fixture?.date || "");
    const kickoff = Number.isFinite(ts) ? new Date(ts) : null;

    const ft = f.score?.fulltime || {};
    const goals = f.goals || {};
    let score = null;
    if (played) score = [ft.home ?? goals.home ?? 0, ft.away ?? goals.away ?? 0];
    else if (live) score = [goals.home ?? 0, goals.away ?? 0];

    const ht = f.score?.halftime;
    const pen = f.score?.penalty;
    const { stage, group } = roundInfo(f.league?.round, leagueType);

    list.push({
      id: f.fixture?.id,
      round: f.league?.round || "",
      stage, group,
      date: kickoff ? `${kickoff.getFullYear()}-${pad(kickoff.getMonth() + 1)}-${pad(kickoff.getDate())}` : "",
      time: kickoff ? `${pad(kickoff.getHours())}:${pad(kickoff.getMinutes())}` : "",
      ground: f.fixture?.venue?.name || "",
      kickoff,
      team1Ref: home.name, team2Ref: away.name,
      score,
      pens: (short === "PEN" && pen && pen.home != null) ? [pen.home, pen.away] : null,
      ht: (ht && ht.home != null) ? [ht.home, ht.away] : null,
      goals1: [], goals2: [],
      played, live,
      minute: f.fixture?.status?.elapsed ?? null,
      neutral: false
    });
  }
  // orden cronológico y numeración estable
  list.sort((a, b) => {
    const ka = a.kickoff ? a.kickoff.getTime() : 0, kb = b.kickoff ? b.kickoff.getTime() : 0;
    return ka - kb;
  });
  list.forEach((m, i) => { m.num = i + 1; });
  registerTeams(teamReg);
  return list;
}

/* ---------- normalización de tablas (liga = 1 grupo; copa = varios) ---------- */
export function normalizeStandings(json) {
  const block = json.response?.[0]?.league;
  if (!block || !Array.isArray(block.standings)) return null;
  const reg = [];
  const groups = block.standings.map(rows => rows.map(r => {
    if (r.team) reg.push({ id: r.team.id, name: r.team.name, logo: r.team.logo });
    return {
      rank: r.rank, team: r.team?.name, group: r.group || "",
      pj: r.all?.played ?? 0, w: r.all?.win ?? 0, d: r.all?.draw ?? 0, l: r.all?.lose ?? 0,
      gf: r.all?.goals?.for ?? 0, ga: r.all?.goals?.against ?? 0,
      gd: r.goalsDiff ?? 0, pts: r.points ?? 0,
      form: r.form || ""
    };
  }));
  registerTeams(reg);
  return groups;
}

/**
 * Capa EN VIVO del Mundial: marcador + minuto reales de API-Football (liga 1)
 * para superponer sobre la estructura de openfootball. Devuelve entradas
 * { home, away, date, live, minute, score:[h,a], pens } normalizables por nombre.
 * Lanza si el plan no cubre la temporada (se ignora arriba).
 */
export async function fetchWorldCupOverlay(season) {
  const json = await apiGet("fixtures", { league: 1, season });
  const out = [];
  for (const f of (json.response || [])) {
    const short = f.fixture?.status?.short || "NS";
    const home = f.teams?.home?.name, away = f.teams?.away?.name;
    if (!home || !away) continue;
    const date = (f.fixture?.date || "").slice(0, 10);
    const gh = f.goals?.home ?? 0, ga = f.goals?.away ?? 0;
    if (LIVE.has(short)) {
      out.push({ home, away, date, live: true, minute: f.fixture?.status?.elapsed ?? 0, score: [gh, ga] });
    } else if (DONE.has(short)) {
      const pen = (short === "PEN" && f.score?.penalty) ? [f.score.penalty.home ?? 0, f.score.penalty.away ?? 0] : null;
      out.push({ home, away, date, live: false, score: [f.score?.fulltime?.home ?? gh, f.score?.fulltime?.away ?? ga], pens: pen });
    }
  }
  return out;
}

/* ---------- API pública (ligas) ---------- */
export function fetchFixtures(leagueId, season) { return apiGet("fixtures", { league: leagueId, season }); }
export function fetchStandings(leagueId, season) { return apiGet("standings", { league: leagueId, season }); }
