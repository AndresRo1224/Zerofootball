/**
 * state.js — Estado compartido de la app.
 * `S` guarda la competición actual, el modelo Elo y la caché de simulación.
 * `S.go`/`S.refresh` los asigna el router para re-renderizar desde cualquier módulo.
 */
import * as Engine from "./engine/index.js";
import { CONFIG } from "./config.js";

export const S = {
  T: null,                 // competición parseada (parseLeague)
  model: null,             // EloModel (sembrado + refinado)
  simProbs: null,          // probabilidades de temporada (Monte Carlo, bajo demanda)

  currentTab: "hoy",
  currentLeague: CONFIG.DEFAULT_LEAGUE,
  leagues: CONFIG.LEAGUES,

  partidosFilter: "prox",
  partidosRound: "",
  sourceLabel: "",
  isLive: false,           // true si hay algún partido en vivo real

  // estado del predictor de cruces
  predictor: { a: null, b: null, neutral: true, ko: false, result: null },

  // asignados por el router
  go: () => {},
  refresh: () => {}
};

/** (Re)construye competición + modelo Elo a partir de los datos parseados. */
export function setLeagueData(parsed, { isLive = false, label = "" } = {}){
  S.T = parsed;
  const base = Engine.seedFromStandings(parsed.standings);
  S.model = new Engine.EloModel(base, Engine.K_CLUB);
  S.model.applyTournament(parsed.matches, parsed.teamsSet, { homeAdv: Engine.HOME_ADVANTAGE });
  S.simProbs = null;
  S.isLive = isLive;
  S.sourceLabel = label;

  // predictor por defecto: los dos mejores del ranking Elo
  if(!S.predictor.a || !parsed.teamsSet.has(S.predictor.a) || !parsed.teamsSet.has(S.predictor.b)){
    const lb = S.model.leaderboard(parsed.teamsSet);
    S.predictor.a = lb[0] ? lb[0][0] : parsed.teams[0] || null;
    S.predictor.b = lb[1] ? lb[1][0] : parsed.teams[1] || null;
    S.predictor.result = null;
  }
}

/** Liga seleccionada (objeto de CONFIG.LEAGUES). */
export function currentLeagueMeta(){
  return S.leagues.find(l => l.id === S.currentLeague) || S.leagues[0];
}

export { Engine };
