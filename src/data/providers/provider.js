/**
 * data/providers/provider.js — Carga de una competición según su tipo.
 *  - "worldcup": openfootball (estructura del torneo) con respaldo offline.
 *  - "league"/"cup": API-Football vía proxy, con respaldo a instantánea de liga.
 * Nunca lanza.
 */
import { CONFIG, leagueById, seasonOf } from "../../config.js";
import snapshot from "../snapshot.js";
import wcSnapshot from "../wcSnapshot.js";
import { fetchOpenFootball } from "./openfootball.js";
import { fetchFixtures, fetchStandings, fetchWorldCupOverlay, normalizeFixtures, normalizeStandings } from "./apiSports.js";

const seasonLabel = s => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;
const clone = o => JSON.parse(JSON.stringify(o));

/** Punto de entrada: decide según el tipo de competición. */
export async function loadCompetition(meta){
  return meta.type === "worldcup" ? loadWorldCup(meta) : loadLeague(meta.id);
}

/* ---- normalización de nombres (openfootball <-> API-Football) ---- */
const NAME_FIX = {
  "united states":"usa", "usa":"usa", "korea republic":"south korea", "south korea":"south korea",
  "ir iran":"iran", "iran":"iran", "cote d'ivoire":"ivory coast", "ivory coast":"ivory coast",
  "cape verde islands":"cape verde", "cabo verde":"cape verde", "czechia":"czech republic",
  "bosnia and herzegovina":"bosnia & herzegovina", "congo dr":"dr congo", "dr congo":"dr congo",
  "curacao":"curaçao", "turkiye":"turkey"
};
function normName(name){
  if(!name) return "";
  const base = name.toString().trim().toLowerCase()
    .replace(/ç/g, "c").replace(/[áàä]/g, "a").replace(/[éèë]/g, "e")
    .replace(/[íï]/g, "i").replace(/[óòö]/g, "o").replace(/[úùü]/g, "u");
  return NAME_FIX[base] || base;
}

/** Superpone marcador/minuto reales (API) sobre los partidos de openfootball. */
function applyWcOverlay(raw, overlay){
  const idx = new Map(), idxND = new Map();
  for(const m of raw.matches){
    const t1 = normName(m.team1), t2 = normName(m.team2);
    if(!t1 || !t2) continue;
    idx.set(t1 + "|" + t2 + "|" + (m.date || ""), m);
    idxND.set(t1 + "|" + t2, m);
  }
  let n = 0;
  for(const o of overlay){
    const t1 = normName(o.home), t2 = normName(o.away);
    const m = idx.get(t1 + "|" + t2 + "|" + o.date) || idxND.get(t1 + "|" + t2);
    if(!m) continue;
    if(o.live){ m.live = true; m.status = "live"; m.minute = o.minute; m.live_score = o.score.slice(); }
    else { m.score = Object.assign({}, m.score, { ft: o.score.slice() }); if(o.pens) m.score.p = o.pens.slice(); m.live = false; }
    n++;
  }
  return n;
}

/** Mundial (openfootball) + opcional overlay EN VIVO de API-Football. */
async function loadWorldCup(meta){
  let raw, label, error = null;
  try{
    raw = clone(await fetchOpenFootball());
    label = meta.name + " · openfootball";
  }catch(e){
    raw = clone(wcSnapshot);
    label = meta.name + " · local";
    error = e;
  }

  let isLive = false;
  if(CONFIG.WORLDCUP_LIVE){
    try{
      const overlay = await fetchWorldCupOverlay(CONFIG.WORLDCUP_API_SEASON);
      if(applyWcOverlay(raw, overlay) > 0 && overlay.some(o => o.live)){ isLive = true; label += " + en vivo"; }
    }catch{ /* plan no cubre la temporada o sin red: seguimos con openfootball */ }
  }
  return { type: "worldcup", league: meta, raw, standings: null, isLive, label, error };
}

/** Liga/copa (API-Football). Devuelve { type, matches, standings, ... }. */
async function loadLeague(leagueId){
  const league = leagueById(leagueId);
  const season = seasonOf(league);
  let matches = [], standings = null, error = null, label;

  try{
    const [fxRes, stRes] = await Promise.allSettled([
      fetchFixtures(leagueId, season),
      fetchStandings(leagueId, season)
    ]);
    if(fxRes.status === "fulfilled") matches = normalizeFixtures(fxRes.value, league.type);
    else throw fxRes.reason;
    if(stRes.status === "fulfilled") standings = normalizeStandings(stRes.value);
    label = `${league.name} · ${seasonLabel(season)}`;
  }catch(e){
    error = e;
    if(snapshot && snapshot.leagueId === leagueId && snapshot.fixtures){
      matches = normalizeFixtures(snapshot.fixtures, league.type);
      standings = snapshot.standings ? normalizeStandings(snapshot.standings) : null;
      label = `${league.name} · local`;
    } else {
      label = `${league.name} · sin conexión`;
    }
  }

  const isLive = matches.some(m => m.live);
  return { type: league.type, league, season, matches, standings, isLive, label, error };
}
