/**
 * data/providers/provider.js — Carga de una liga/competición.
 *
 * Pide fixtures + tabla a la API (vía proxy), los normaliza al shape interno y,
 * si la red falla y hay instantánea local de esa liga, cae a ella. Nunca lanza.
 */
import { leagueById, seasonOf } from "../../config.js";
import snapshot from "../snapshot.js";
import { fetchFixtures, fetchStandings, normalizeFixtures, normalizeStandings } from "./apiSports.js";

const seasonLabel = s => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

/**
 * loadLeague(id) -> { league, season, matches, standings, isLive, label, error }
 *  - matches:   partidos en shape interno (cronológico)
 *  - standings: array de tablas (liga = 1; copa = varias) o null
 */
export async function loadLeague(leagueId) {
  const league = leagueById(leagueId);
  const season = seasonOf(league);
  let matches = [], standings = null, error = null, label;

  try {
    const [fxRes, stRes] = await Promise.allSettled([
      fetchFixtures(leagueId, season),
      fetchStandings(leagueId, season)
    ]);
    if (fxRes.status === "fulfilled") matches = normalizeFixtures(fxRes.value, league.type);
    else throw fxRes.reason;
    if (stRes.status === "fulfilled") standings = normalizeStandings(stRes.value);
    label = `${league.name} · ${seasonLabel(season)}`;
  } catch (e) {
    error = e;
    if (snapshot && snapshot.leagueId === leagueId && snapshot.fixtures) {
      matches = normalizeFixtures(snapshot.fixtures, league.type);
      standings = snapshot.standings ? normalizeStandings(snapshot.standings) : null;
      label = `${league.name} · local`;
    } else {
      label = `${league.name} · sin conexión`;
    }
  }

  const isLive = matches.some(m => m.live);
  return { league, season, matches, standings, isLive, label, error };
}
