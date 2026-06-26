/**
 * data/providers/predict.js — Cliente del predictor robusto (Python/Dixon-Coles)
 * vía /api/predict. El cliente envía los resultados ya jugados (no gasta cuota).
 * Si la función no responde (p. ej. sin backend), el llamador usa el motor JS.
 */
async function post(payload, timeoutMs){
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const r = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    const j = await r.json().catch(() => ({}));
    if(!r.ok || j.error) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  } finally { clearTimeout(to); }
}

/** Predicción de un cruce. priors/priorWeight (opcional) = robustez del Mundial. */
export function predictMatchApi({ results, home, away, neutral, knockout, priors, priorWeight }){
  return post({ mode: "match", results, home, away, neutral: !!neutral, knockout: !!knockout, priors, priorWeight }, 12000);
}

/** Pronóstico de temporada. Devuelve el objeto probs {team:{title,top,releg,...}}. */
export async function simulateSeasonApi({ results, fixtures, teams, clSpots, relegSpots, sims }){
  const j = await post({ mode: "season", results, fixtures, teams, clSpots, relegSpots, sims }, 22000);
  return j.probs;
}
