/**
 * data/providers/openfootball.js — Proveedor del Mundial 2026 (dominio público / CC0).
 * Repo: github.com/openfootball/worldcup.json
 * Entrega la estructura del torneo + resultados finales; se actualiza ~a diario.
 */
export const OPENFOOTBALL_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

export async function fetchOpenFootball(timeoutMs = 8000){
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(OPENFOOTBALL_URL, { signal: ctrl.signal, cache: "no-store" });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const raw = await res.json();
    if(!raw || !Array.isArray(raw.matches)) throw new Error("formato inesperado");
    return raw;
  } finally {
    clearTimeout(to);
  }
}
