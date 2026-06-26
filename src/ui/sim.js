/**
 * ui/sim.js — Simuladores Monte Carlo.
 *  - runSeasonSim: liga (título/Champions/descenso).
 *  - runMonteCarlo: Mundial (campeón/finalista/ronda alcanzada), por lotes con
 *    requestAnimationFrame para no congelar la UI.
 */
import { S, Engine, currentLeagueMeta } from "../state.js";
import { toast, hideToast } from "./components.js";
import { simulateSeasonApi } from "../data/providers/predict.js";

/* ---------- LIGA: modelo robusto (Python/Dixon-Coles) con respaldo JS ---------- */
export async function runSeasonSim(n, done){
  const meta = currentLeagueMeta();
  const results = S.T.matches.filter(m => m.played && m.score)
    .map(m => [m.team1Ref, m.team2Ref, m.score[0], m.score[1]]);
  const fixtures = S.T.matches.filter(m => !m.played && S.T.teamsSet.has(m.team1Ref) && S.T.teamsSet.has(m.team2Ref))
    .map(m => [m.team1Ref, m.team2Ref]);

  toast(fixtures.length ? "Simulando temporada (Dixon-Coles)…" : "Calculando…");
  try{
    S.simProbs = await simulateSeasonApi({
      results, fixtures, teams: S.T.teams, clSpots: meta.cl, relegSpots: meta.releg, sims: n
    });
  }catch{
    S.simProbs = Engine.simulateSeason(S.T, S.model, fixtures.length ? n : 1, { clSpots: meta.cl, relegSpots: meta.releg });
  }
  hideToast();
  if(done) done();
}

/* ---------- MUNDIAL ---------- */
export function runMonteCarlo(n, done){
  toast("Simulando " + n.toLocaleString() + " torneos…");
  const rnd = Engine.mulberry32((Date.now()) >>> 0);
  const teams = S.T.teams;
  const c = {}; teams.forEach(t => c[t] = { champion:0, final:0, sf:0, qf:0, r16:0, qual:0, first:0, second:0 });
  let i = 0;
  const batch = Math.max(150, Math.floor(n / 40));
  const bar = document.getElementById("toast");

  function step(){
    const end = Math.min(n, i + batch);
    for(; i < end; i++){
      const r = Engine.simulateOnce(S.T, S.model, rnd, "mc");
      if(r.champion in c) c[r.champion].champion++;
      r.finalists.forEach(t => { if(t in c) c[t].final++; });
      r.reached.SF.forEach(t => { if(t in c) c[t].sf++; });
      r.reached.QF.forEach(t => { if(t in c) c[t].qf++; });
      r.reached.R16.forEach(t => { if(t in c) c[t].r16++; });
      r.reached.R32.forEach(t => { if(t in c) c[t].qual++; });
      Object.values(r.winners).forEach(w => { if(w in c) c[w].first++; });
      Object.values(r.runners).forEach(w => { if(w in c) c[w].second++; });
    }
    bar.textContent = "Simulando… " + Math.round(i / n * 100) + "%";
    bar.classList.add("show");
    if(i < n){ requestAnimationFrame(step); }
    else {
      const probs = {}; teams.forEach(t => { const o = {}; for(const k in c[t]) o[k] = c[t][k] / n; probs[t] = o; });
      S.simProbs = probs;
      hideToast();
      if(done) done();
    }
  }
  requestAnimationFrame(step);
}
