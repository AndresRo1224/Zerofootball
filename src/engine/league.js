/**
 * engine/league.js — Capa de LIGA (sustituye al motor de torneo del Mundial).
 *
 *  - parseLeague: arma la estructura interna (S.T) a partir de partidos ya
 *    normalizados + tablas de la API.
 *  - simulateSeason: Monte Carlo de los partidos restantes para estimar
 *    probabilidad de título, plazas de Champions y descenso.
 *
 * Reutiliza computeStandings (desempates) y eloToLambdas/scoreMatrix del motor.
 */
import { mulberry32, computeStandings } from "./tournament.js";
import { eloToLambdas } from "./poisson.js";
import { HOME_ADVANTAGE } from "./elo.js";

function samplePoisson(lam, rnd){
  const L = Math.exp(-lam); let k = 0, p = 1;
  do { k++; p *= rnd(); } while(p > L);
  return k - 1;
}

/** Construye S.T para una competición a partir de partidos + tablas normalizados. */
export function parseLeague(matches, standings, meta = {}){
  const list = matches.slice().sort((a, b) => {
    const ka = a.kickoff ? a.kickoff.getTime() : 0, kb = b.kickoff ? b.kickoff.getTime() : 0;
    return ka !== kb ? ka - kb : (a.num || 0) - (b.num || 0);
  });
  list.forEach((m, i) => { if(m.num == null) m.num = i + 1; });

  const byNum = {}; list.forEach(m => byNum[m.num] = m);

  // grupos (solo copas con fase de grupos); en liga queda vacío
  const groupsSet = {}, groupMatches = {};
  for(const m of list){
    if(m.group){
      (groupsSet[m.group] = groupsSet[m.group] || new Set()).add(m.team1Ref);
      groupsSet[m.group].add(m.team2Ref);
      (groupMatches[m.group] = groupMatches[m.group] || []).push(m);
    }
  }
  const groups = {}; Object.keys(groupsSet).sort().forEach(g => groups[g] = [...groupsSet[g]].sort());

  // equipos: unión de partidos + tablas (por si alguno no tiene fixtures aún)
  const set = new Set();
  list.forEach(m => { if(m.team1Ref) set.add(m.team1Ref); if(m.team2Ref) set.add(m.team2Ref); });
  if(Array.isArray(standings)) standings.flat().forEach(r => { if(r && r.team) set.add(r.team); });
  const teams = [...set].sort();

  // rondas distintas en orden cronológico
  const rounds = [];
  for(const m of list) if(m.round && !rounds.includes(m.round)) rounds.push(m.round);

  return {
    name: meta.name || "", type: meta.type || "league",
    leagueId: meta.leagueId, season: meta.season,
    matches: list, byNum, groups, groupMatches,
    teams, teamsSet: new Set(teams),
    standings: standings || null, rounds
  };
}

/** Resultados ya jugados, en formato [home, away, gh, ga]. */
export function playedResults(T){
  const out = [];
  for(const m of T.matches) if(m.played && m.score) out.push([m.team1Ref, m.team2Ref, m.score[0], m.score[1]]);
  return out;
}
function remaining(T){
  return T.matches.filter(m => !m.played && T.teamsSet.has(m.team1Ref) && T.teamsSet.has(m.team2Ref));
}

/**
 * Monte Carlo de la temporada. Devuelve por equipo:
 *  { title, top (Champions), releg (descenso), avgRank, avgPts }
 */
export function simulateSeason(T, model, n, opts = {}){
  const seed = opts.seed == null ? (Date.now() >>> 0) : opts.seed;
  const clSpots = opts.clSpots || 4;
  const relegSpots = opts.relegSpots || 3;
  const rnd = mulberry32(seed >>> 0);
  const base = playedResults(T);
  const rest = remaining(T);
  const teams = T.teams;
  const N = teams.length;

  const c = {}; teams.forEach(t => c[t] = { title:0, top:0, releg:0, rankSum:0, ptsSum:0 });

  for(let i = 0; i < n; i++){
    const results = base.slice();
    for(const m of rest){
      const [l1, l2] = eloToLambdas(model.get(m.team1Ref), model.get(m.team2Ref), m.neutral ? 0 : HOME_ADVANTAGE);
      results.push([m.team1Ref, m.team2Ref, samplePoisson(l1, rnd), samplePoisson(l2, rnd)]);
    }
    const table = computeStandings(teams, results, rnd);   // array ordenado de filas
    for(let pos = 0; pos < table.length; pos++){
      const row = table[pos], o = c[row.team]; if(!o) continue;
      o.rankSum += pos + 1; o.ptsSum += row.pts;
      if(pos === 0) o.title++;
      if(pos < clSpots) o.top++;
      if(pos >= N - relegSpots) o.releg++;
    }
    if(opts.onProgress && (i + 1) % Math.max(1, Math.floor(n / 20)) === 0) opts.onProgress(i + 1, n);
  }

  const probs = {};
  teams.forEach(t => {
    const o = c[t];
    probs[t] = { title:o.title / n, top:o.top / n, releg:o.releg / n, avgRank:o.rankSum / n, avgPts:o.ptsSum / n };
  });
  return probs;
}
