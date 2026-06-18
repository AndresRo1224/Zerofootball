/**
 * engine/poisson.js — Conversión de Elo a goles esperados y matriz de marcadores
 * (Poisson independiente con corrección de Dixon-Coles para resultados bajos).
 */

export const RHO = -0.06;     // corrección Dixon-Coles
export const MAXG = 8;        // goles máximos por equipo en la matriz
const MINL = 0.18;            // lambda mínima
const SUP_PER_100 = 0.46;     // supremacía por cada 100 puntos de Elo
const MAX_SUP = 3.2;
const BASE_TOTAL = 2.6;       // goles totales base
const TEMPO = 0.018;

/** Diferencia de Elo -> [lambda1, lambda2] (goles esperados de cada equipo). */
export function eloToLambdas(r1, r2, homeAdv = 0){
  const dr = (r1 + homeAdv) - r2;
  let sup = (dr / 100) * SUP_PER_100;
  sup = Math.max(-MAX_SUP, Math.min(MAX_SUP, sup));
  const avg = (r1 + r2) / 2;
  let total = BASE_TOTAL + ((avg - 1800) / 100) * TEMPO;
  total = Math.max(1.8, Math.min(3.4, total));
  return [Math.max(MINL, (total + sup) / 2), Math.max(MINL, (total - sup) / 2)];
}

/** Vector de probabilidades de Poisson P(X=k) para k=0..kmax (una sola exp). */
export function poissonVector(lam, kmax = MAXG){
  const v = new Array(kmax + 1);
  v[0] = Math.exp(-lam);
  for(let k = 1; k <= kmax; k++) v[k] = v[k - 1] * lam / k;
  return v;
}

function dcTau(i, j, l1, l2, rho){
  if(i === 0 && j === 0) return 1 - l1 * l2 * rho;
  if(i === 0 && j === 1) return 1 + l1 * rho;
  if(i === 1 && j === 0) return 1 + l2 * rho;
  if(i === 1 && j === 1) return 1 - rho;
  return 1;
}

/** Matriz (MAXG+1)x(MAXG+1) de probabilidad de cada marcador, normalizada. */
export function scoreMatrix(l1, l2){
  const v1 = poissonVector(l1, MAXG), v2 = poissonVector(l2, MAXG);
  const m = [];
  let tot = 0;
  for(let i = 0; i <= MAXG; i++){
    m[i] = [];
    for(let j = 0; j <= MAXG; j++){
      let p = v1[i] * v2[j] * dcTau(i, j, l1, l2, RHO);
      if(p < 0) p = 0;
      m[i][j] = p; tot += p;
    }
  }
  if(tot > 0) for(let i = 0; i <= MAXG; i++) for(let j = 0; j <= MAXG; j++) m[i][j] /= tot;
  return m;
}

/** Marcador más probable. */
export function argmaxScore(l1, l2){
  const m = scoreMatrix(l1, l2);
  let best = [0, 0], bp = -1;
  for(let i = 0; i <= MAXG; i++) for(let j = 0; j <= MAXG; j++) if(m[i][j] > bp){ bp = m[i][j]; best = [i, j]; }
  return best;
}
