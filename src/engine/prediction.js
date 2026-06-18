/**
 * engine/prediction.js — Predicción de partidos.
 *  - predictMatch: 1X2, goles esperados, marcadores, ambos marcan, +2.5...
 *  - knockoutAdvance: probabilidad de avanzar (incluye prórroga y penales)
 *  - inPlayProbability: probabilidad EN VIVO dado marcador y minuto actuales
 */
import { homeBonus, expectedScore, HOME_ADVANTAGE } from "./elo.js";
import { eloToLambdas, poissonVector, scoreMatrix, RHO, MAXG } from "./poisson.js";

function dcTau(i, j, l1, l2, rho){
  if(i === 0 && j === 0) return 1 - l1 * l2 * rho;
  if(i === 0 && j === 1) return 1 + l1 * rho;
  if(i === 1 && j === 0) return 1 + l2 * rho;
  if(i === 1 && j === 1) return 1 - rho;
  return 1;
}

export function predictMatch(t1, t2, model, opts = {}){
  const r1 = model.get(t1), r2 = model.get(t2);
  let neutral = opts.neutral, net = 0;
  if(neutral === undefined || neutral === null){
    net = homeBonus(t1, opts.ground || "") - homeBonus(t2, opts.ground || "");
    neutral = (net === 0);
  } else {
    net = neutral ? 0 : HOME_ADVANTAGE;
  }
  const [l1, l2] = eloToLambdas(r1, r2, net);
  const m = scoreMatrix(l1, l2);

  let p1 = 0, pd = 0, p2 = 0, both = 0, over = 0;
  const flat = [];
  for(let i = 0; i <= MAXG; i++) for(let j = 0; j <= MAXG; j++){
    const p = m[i][j];
    flat.push([[i, j], p]);
    if(i > j) p1 += p; else if(i === j) pd += p; else p2 += p;
    if(i > 0 && j > 0) both += p;
    if(i + j > 2) over += p;
  }
  flat.sort((a, b) => b[1] - a[1]);

  let e1 = 0, e2 = 0;
  for(let i = 0; i <= MAXG; i++){ let row = 0; for(let j = 0; j <= MAXG; j++) row += m[i][j]; e1 += i * row; }
  for(let j = 0; j <= MAXG; j++){ let col = 0; for(let i = 0; i <= MAXG; i++) col += m[i][j]; e2 += j * col; }

  const res = {
    team1: t1, team2: t2, rating1: r1, rating2: r2, lambda1: l1, lambda2: l2,
    pWin1: p1, pDraw: pd, pWin2: p2, expected1: e1, expected2: e2,
    topScores: flat.slice(0, 7), bothScore: both, over25: over, neutral
  };
  if(opts.knockout){
    const [a1, a2] = knockoutAdvanceLambdas(l1, l2, r1, r2, net);
    res.pAdvance1 = a1; res.pAdvance2 = a2;
  }
  return res;
}

export function knockoutAdvanceLambdas(l1, l2, r1, r2, net){
  const v1 = poissonVector(l1, MAXG), v2 = poissonVector(l2, MAXG);
  let p1 = 0, pd = 0, p2 = 0, tot = 0;
  for(let i = 0; i <= MAXG; i++) for(let j = 0; j <= MAXG; j++){
    let p = v1[i] * v2[j] * dcTau(i, j, l1, l2, RHO);
    if(p < 0) p = 0; tot += p;
    if(i > j) p1 += p; else if(i === j) pd += p; else p2 += p;
  }
  p1 /= tot; pd /= tot; p2 /= tot;

  // prórroga (ritmo reducido)
  const ek = 6, w1 = poissonVector(l1 / 3, ek), w2 = poissonVector(l2 / 3, ek);
  let e1 = 0, ed = 0, e2 = 0, et = 0;
  for(let i = 0; i <= ek; i++) for(let j = 0; j <= ek; j++){
    const p = w1[i] * w2[j]; et += p;
    if(i > j) e1 += p; else if(i === j) ed += p; else e2 += p;
  }
  e1 /= et; ed /= et; e2 /= et;

  // penales: sesgo leve al equipo más fuerte
  const we = expectedScore(r1, r2, net);
  let pen1 = 0.5 + (we - 0.5) * 0.35;
  pen1 = Math.min(0.85, Math.max(0.15, pen1));

  let a1 = p1 + pd * (e1 + ed * pen1);
  let a2 = p2 + pd * (e2 + ed * (1 - pen1));
  const s = a1 + a2;
  return s > 0 ? [a1 / s, a2 / s] : [0.5, 0.5];
}

export function knockoutAdvance(t1, t2, model, ground){
  const r1 = model.get(t1), r2 = model.get(t2);
  const net = homeBonus(t1, ground || "") - homeBonus(t2, ground || "");
  const [l1, l2] = eloToLambdas(r1, r2, net);
  return knockoutAdvanceLambdas(l1, l2, r1, r2, net);
}

/**
 * Probabilidad EN VIVO dado el marcador actual (g1-g2) y el minuto.
 * Escala los goles esperados restantes por el tiempo que queda.
 * Esto se actualiza de verdad si la fuente entrega marcador y minuto reales.
 */
export function inPlayProbability(g1, g2, minute, l1, l2){
  const frac = Math.max(0, Math.min(1, (90 - minute) / 90));
  const rl1 = l1 * frac, rl2 = l2 * frac;
  const v1 = poissonVector(rl1, MAXG), v2 = poissonVector(rl2, MAXG);
  let p1 = 0, pd = 0, p2 = 0;
  for(let i = 0; i <= MAXG; i++) for(let j = 0; j <= MAXG; j++){
    const p = v1[i] * v2[j];
    const f1 = g1 + i, f2 = g2 + j;
    if(f1 > f2) p1 += p; else if(f1 < f2) p2 += p; else pd += p;
  }
  const s = p1 + pd + p2;
  return { pWin1: p1 / s, pDraw: pd / s, pWin2: p2 / s };
}
