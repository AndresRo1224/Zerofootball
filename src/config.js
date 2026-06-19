/**
 * config.js — Configuración de la app (FÚTBOL · grandes ligas).
 *
 * IMPORTANTE (seguridad): aquí NO va ninguna clave de API. El navegador habla
 * con nuestro propio proxy (API_BASE) y es el servidor quien añade la clave
 * secreta. Ver api/football.js, .env.example y el README.
 *
 * TEMPORADA: API-Football usa el año de INICIO de temporada (2024 = 2024/25).
 * El plan GRATIS de esta cuenta solo da acceso hasta la temporada 2024; al
 * subir de plan, cambia SEASON al año en curso y listo.
 */
export const CONFIG = {
  // Endpoint del proxy (mismo origen en Vercel y en el dev-proxy local).
  API_BASE: "/api/football",

  // Temporada por defecto (año de inicio). Cambiable por liga abajo.
  SEASON: 2024,

  // Auto-refresco (ms) — mantiene marcador/minuto/probabilidades al día en vivo.
  POLL_INTERVAL_MS: 60_000,
  // Re-render del minuto/probabilidad en vivo aunque no lleguen datos nuevos.
  LIVE_TICK_MS: 20_000,

  // Liga mostrada al abrir.
  DEFAULT_LEAGUE: 39,

  /**
   * Competiciones disponibles. Añadir una liga = una línea más.
   *  id        -> id de API-Football
   *  type      -> "league" (todos contra todos) | "cup" (grupos + eliminatoria)
   *  cl        -> plazas de Champions (para el pronóstico de temporada)
   *  releg     -> plazas de descenso
   *  season    -> (opcional) sobreescribe SEASON para esa competición
   */
  LEAGUES: [
    // Mundial 2026 (app original): datos de openfootball, NO usa la API ni la
    // temporada. Grupos + bracket + simulación de campeón.
    { id: 1,   name: "Mundial 2026",    country: "FIFA",        type: "worldcup" },
    { id: 39,  name: "Premier League",  country: "Inglaterra",  type: "league", cl: 4, releg: 3 },
    { id: 140, name: "LaLiga",          country: "España",      type: "league", cl: 4, releg: 3 },
    { id: 135, name: "Serie A",         country: "Italia",      type: "league", cl: 4, releg: 3 },
    { id: 78,  name: "Bundesliga",      country: "Alemania",    type: "league", cl: 4, releg: 2 },
    { id: 61,  name: "Ligue 1",         country: "Francia",     type: "league", cl: 3, releg: 3 },
    { id: 88,  name: "Eredivisie",      country: "P. Bajos",    type: "league", cl: 2, releg: 2 },
    { id: 94,  name: "Primeira Liga",   country: "Portugal",    type: "league", cl: 2, releg: 2 },
    { id: 71,  name: "Brasileirão",     country: "Brasil",      type: "league", cl: 4, releg: 4 },
    { id: 2,   name: "Champions League", country: "Europa",     type: "cup" },
    { id: 3,   name: "Europa League",    country: "Europa",     type: "cup" },
    { id: 13,  name: "Libertadores",     country: "Sudamérica", type: "cup" }
  ]
};

export const leagueById = id => CONFIG.LEAGUES.find(l => l.id === id) || CONFIG.LEAGUES[0];
export const seasonOf = league => (league && league.season) || CONFIG.SEASON;
