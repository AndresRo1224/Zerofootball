/**
 * data/providers/provider.js — Carga de una competición según su tipo.
 *  - "worldcup": openfootball (estructura del torneo) con respaldo offline.
 *  - "league"/"cup": API-Football vía proxy, con respaldo a instantánea de liga.
 * Nunca lanza.
 */
import { leagueById, seasonOf } from "../../config.js";
import snapshot from "../snapshot.js";
import wcSnapshot from "../wcSnapshot.js";
import { fetchOpenFootball } from "./openfootball.js";
import { fetchFixtures, fetchStandings, normalizeFixtures, normalizeStandings } from "./apiSports.js";

const seasonLabel = s => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

/** Punto de entrada: decide según el tipo de competición. */
export async function loadCompetition(meta){
  return meta.type === "worldcup" ? loadWorldCup(meta) : loadLeague(meta.id);
}

/** Mundial (openfootball). Devuelve { type:"worldcup", raw, ... }. */
async function loadWorldCup(meta){
  let raw, label, error = null;
  try{
    raw = await fetchOpenFootball();
    label = meta.name + " · openfootball";
  }catch(e){
    raw = wcSnapshot;
    label = meta.name + " · local";
    error = e;
  }
  return { type: "worldcup", league: meta, raw, standings: null, isLive: false, label, error };
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
