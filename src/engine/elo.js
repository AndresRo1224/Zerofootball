/**
 * engine/elo.js — Modelo Elo genérico (clubes o selecciones).
 *
 * El Elo de cada equipo se SIEMBRA desde la tabla (si la hay) y se REFINA con
 * los resultados reales. En liga el local se conoce, así que la ventaja de local
 * se aplica al equipo de casa (team1Ref) salvo que el partido sea en cancha
 * neutral. `homeBonus`/`BASE_ELO`/`HOST_NATIONS` se conservan para compatibilidad
 * con el motor de torneo retirado (engine/tournament.js).
 */

// Fuerza base (Elo) pre-torneo aproximada (solo la usa el torneo retirado).
export const BASE_ELO = {
  "Spain":2120,"France":2060,"England":2010,"Portugal":1980,"Netherlands":1955,
  "Germany":1940,"Belgium":1925,"Croatia":1875,"Switzerland":1845,"Turkey":1825,
  "Norway":1820,"Austria":1785,"Czech Republic":1755,"Sweden":1755,"Scotland":1735,
  "Bosnia & Herzegovina":1715,"Argentina":2110,"Colombia":1975,"Brazil":1975,
  "Uruguay":1895,"Ecuador":1845,"Paraguay":1720,"Mexico":1795,"USA":1785,"Canada":1775,
  "Panama":1655,"Curaçao":1565,"Haiti":1545,"Japan":1865,"Iran":1800,"South Korea":1790,
  "Australia":1755,"Qatar":1680,"Saudi Arabia":1675,"Uzbekistan":1655,"Iraq":1615,
  "Jordan":1610,"Morocco":1885,"Senegal":1860,"Ivory Coast":1800,"Egypt":1790,
  "Algeria":1785,"DR Congo":1715,"South Africa":1700,"Ghana":1700,"Tunisia":1685,
  "Cape Verde":1615,"New Zealand":1500
};

export const HOST_NATIONS = new Set(["Mexico","USA","Canada"]);

// Sede (subcadena del campo "ground") -> país anfitrión.
const VENUE_COUNTRY = [
  ["Mexico City","Mexico"],["Guadalajara","Mexico"],["Monterrey","Mexico"],
  ["Toronto","Canada"],["Vancouver","Canada"],
  ["Atlanta","USA"],["Boston","USA"],["Foxborough","USA"],["Dallas","USA"],
  ["Arlington","USA"],["Houston","USA"],["Kansas City","USA"],["Los Angeles","USA"],
  ["Inglewood","USA"],["Miami","USA"],["New York","USA"],["New Jersey","USA"],
  ["East Rutherford","USA"],["Philadelphia","USA"],["San Francisco","USA"],
  ["Santa Clara","USA"],["Seattle","USA"]
];

export const HOME_ADVANTAGE = 70;      // bonus Elo de local (~+0.3 goles de ventaja)
export const K_WC = 60;                // factor K para el torneo retirado
export const K_CLUB = 28;              // factor K para ligas de clubes (muchos partidos)

export function venueCountry(ground){
  if(!ground) return null;
  for(const [k,c] of VENUE_COUNTRY) if(ground.indexOf(k) >= 0) return c;
  return null;
}

export function homeBonus(team, ground){
  if(HOST_NATIONS.has(team) && venueCountry(ground) === team) return HOME_ADVANTAGE;
  return 0;
}

export function expectedScore(ra, rb, homeAdv = 0){
  const dr = (ra + homeAdv) - rb;
  return 1 / (1 + Math.pow(10, -dr / 400));
}

function marginMultiplier(gd){
  const g = Math.abs(gd);
  if(g <= 1) return 1;
  if(g === 2) return 1.5;
  return (11 + g) / 8;
}

export class EloModel {
  constructor(base = {}, K = K_CLUB){
    this.ratings = Object.assign({}, base);
    this.K = K;
  }
  get(team){ return (team in this.ratings) ? this.ratings[team] : 1500; }

  /** Aplica un resultado. homeAdv = ventaja Elo del LOCAL (team1); 0 si neutral. */
  applyResult(t1, t2, g1, g2, homeAdv = 0){
    const r1 = this.get(t1), r2 = this.get(t2);
    const we1 = expectedScore(r1, r2, homeAdv);
    const w1 = g1 > g2 ? 1 : (g1 < g2 ? 0 : 0.5);
    const G = marginMultiplier(g1 - g2);
    const delta = this.K * G * (w1 - we1);
    this.ratings[t1] = r1 + delta;
    this.ratings[t2] = r2 - delta;
  }

  /**
   * Refina el Elo con los partidos jugados (orden cronológico).
   * opts.homeAdv: ventaja de local a aplicar al equipo de casa (team1Ref).
   */
  applyTournament(matches, teams, opts = {}){
    const homeAdv = opts.homeAdv || 0;
    let applied = 0;
    const played = matches.filter(m => m.played && m.score)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.num - b.num));
    for(const m of played){
      if(teams.has(m.team1Ref) && teams.has(m.team2Ref)){
        this.applyResult(m.team1Ref, m.team2Ref, m.score[0], m.score[1], m.neutral ? 0 : homeAdv);
        applied++;
      }
    }
    return applied;
  }

  leaderboard(teams){
    let items = Object.entries(this.ratings);
    if(teams) items = items.filter(([t]) => teams.has(t));
    return items.sort((a, b) => b[1] - a[1]);
  }
}

/**
 * Siembra un Elo base a partir de las tablas de la API (puntos/partido y
 * diferencia de goles), para que las predicciones sean razonables incluso al
 * inicio de temporada. Luego applyTournament lo refina con los resultados.
 * `standings` = array de tablas (cada tabla es un array de filas con pts/pj/gd).
 */
export function seedFromStandings(standings){
  if(!Array.isArray(standings)) return {};
  const rows = standings.flat().filter(r => r && r.team);
  if(!rows.length) return {};
  const ppg = r => r.pts / Math.max(1, r.pj);
  const mean = rows.reduce((s, r) => s + ppg(r), 0) / rows.length;
  const base = {};
  for(const r of rows){
    const gdpg = (r.gd || 0) / Math.max(1, r.pj);
    let elo = 1500 + (ppg(r) - mean) * 110 + gdpg * 22;   // prior suave
    base[r.team] = Math.max(1300, Math.min(1750, elo));
  }
  return base;
}
