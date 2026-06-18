/**
 * ui/sim.js — Lanza el Monte Carlo de temporada y guarda S.simProbs.
 * Si la temporada ya terminó no quedan partidos por simular: el resultado es
 * determinista, así que basta 1 pasada.
 */
import { S, Engine, currentLeagueMeta } from "../state.js";
import { toast, hideToast } from "./components.js";

export function runSeasonSim(n, done){
  const meta = currentLeagueMeta();
  const remaining = S.T.matches.filter(m =>
    !m.played && S.T.teamsSet.has(m.team1Ref) && S.T.teamsSet.has(m.team2Ref)).length;
  const runs = remaining === 0 ? 1 : n;

  toast(remaining === 0 ? "Calculando…" : "Simulando " + runs.toLocaleString() + " temporadas…");
  // setTimeout para que el toast pinte antes de la simulación.
  setTimeout(() => {
    S.simProbs = Engine.simulateSeason(S.T, S.model, runs, {
      clSpots: meta.cl, relegSpots: meta.releg
    });
    hideToast();
    if(done) done();
  }, 30);
}
