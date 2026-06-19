/**
 * state.js — Estado compartido. Soporta DOS modos de competición:
 *  - "worldcup": Mundial (openfootball + motor de torneo: grupos/bracket/MC).
 *  - "league"/"cup": grandes ligas (API-Football + tabla/pronóstico de temporada).
 */
import * as Engine from "./engine/index.js";
import { CONFIG } from "./config.js";

export const S = {
  T: null,                 // competición parseada
  model: null,             // EloModel
  simProbs: null,          // probabilidades (MC) — forma según el modo
  likely: null,            // camino más probable (bracket del Mundial)

  currentTab: "hoy",
  currentLeague: CONFIG.DEFAULT_LEAGUE,
  leagues: CONFIG.LEAGUES,
  leagueType: "league",    // tipo de la competición activa

  partidosFilter: "prox",
  partidosRound: "",
  sourceLabel: "",
  isLive: false,

  predictor: { a: null, b: null, neutral: true, ko: false, result: null },

  go: () => {},
  refresh: () => {}
};

/** (Re)construye competición + modelo Elo según el tipo. */
export function setCompetitionData(T, { type = "league", isLive = false, label = "" } = {}){
  S.T = T;
  S.leagueType = type;

  if(type === "worldcup"){
    // Selecciones: Elo base nacional + refinado con ventaja de local de anfitriones.
    S.model = new Engine.EloModel(Engine.BASE_ELO, Engine.K_WC);
    S.model.applyTournament(T.matches, T.teamsSet, {
      homeAdvFn: m => Engine.homeBonus(m.team1Ref, m.ground) - Engine.homeBonus(m.team2Ref, m.ground)
    });
  } else {
    // Clubes: Elo sembrado con la tabla + ventaja de local del equipo de casa.
    const base = Engine.seedFromStandings(T.standings);
    S.model = new Engine.EloModel(base, Engine.K_CLUB);
    S.model.applyTournament(T.matches, T.teamsSet, { homeAdv: Engine.HOME_ADVANTAGE });
  }

  S.simProbs = null;
  S.likely = null;
  S.isLive = isLive;
  S.sourceLabel = label;

  if(!S.predictor.a || !T.teamsSet.has(S.predictor.a) || !T.teamsSet.has(S.predictor.b)){
    const lb = S.model.leaderboard(T.teamsSet);
    S.predictor.a = lb[0] ? lb[0][0] : T.teams[0] || null;
    S.predictor.b = lb[1] ? lb[1][0] : T.teams[1] || null;
    S.predictor.result = null;
  }
}

/** Liga/competición seleccionada (objeto de CONFIG.LEAGUES). */
export function currentLeagueMeta(){
  return S.leagues.find(l => l.id === S.currentLeague) || S.leagues[0];
}

/**
 * Opciones de predicción para un partido según el modo:
 *  - Mundial: ventaja de local solo de anfitriones (vía ground).
 *  - Liga/copa: el local (team1) tiene ventaja salvo cancha neutral.
 */
export function predictOptions(m, extra = {}){
  const base = S.leagueType === "worldcup"
    ? { ground: m.ground }
    : { neutral: !!m.neutral };
  return Object.assign(base, extra);
}

export { Engine };
