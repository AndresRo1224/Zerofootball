/**
 * data/teams.js — Identidad de equipos para AMBOS modos:
 *  - Ligas/copas (clubes): registro DINÁMICO con el escudo y nombre de la API.
 *  - Mundial (selecciones): mapas FIJOS con bandera (flagcdn), nombre ES, código
 *    FIFA y confederación (de la app original).
 *
 * Las funciones consultan primero los mapas de selección y, si no, el registro.
 * Seguridad (XSS): esName()/code() saneados eliminan `<` `>`.
 */

/* ============ SELECCIONES (Mundial) — mapas fijos ============ */
export const ISO = {
  "Mexico":"mx","South Africa":"za","Czech Republic":"cz","South Korea":"kr","Bosnia & Herzegovina":"ba",
  "Canada":"ca","Qatar":"qa","Switzerland":"ch","Brazil":"br","Haiti":"ht","Morocco":"ma","Scotland":"gb-sct",
  "Australia":"au","Paraguay":"py","Turkey":"tr","USA":"us","Curaçao":"cw","Ecuador":"ec","Germany":"de",
  "Ivory Coast":"ci","Japan":"jp","Netherlands":"nl","Sweden":"se","Tunisia":"tn","Belgium":"be","Egypt":"eg",
  "Iran":"ir","New Zealand":"nz","Cape Verde":"cv","Saudi Arabia":"sa","Spain":"es","Uruguay":"uy","France":"fr",
  "Iraq":"iq","Norway":"no","Senegal":"sn","Algeria":"dz","Argentina":"ar","Austria":"at","Jordan":"jo",
  "Colombia":"co","DR Congo":"cd","Portugal":"pt","Uzbekistan":"uz","Croatia":"hr","England":"gb-eng",
  "Ghana":"gh","Panama":"pa"
};

export const NAME_ES = {
  "Mexico":"México","South Africa":"Sudáfrica","Czech Republic":"Rep. Checa","South Korea":"Corea del Sur",
  "Bosnia & Herzegovina":"Bosnia y H.","Canada":"Canadá","Qatar":"Catar","Switzerland":"Suiza","Brazil":"Brasil",
  "Haiti":"Haití","Morocco":"Marruecos","Scotland":"Escocia","Australia":"Australia","Paraguay":"Paraguay",
  "Turkey":"Turquía","USA":"EE.UU.","Curaçao":"Curazao","Ecuador":"Ecuador","Germany":"Alemania",
  "Ivory Coast":"Costa de Marfil","Japan":"Japón","Netherlands":"P. Bajos","Sweden":"Suecia","Tunisia":"Túnez",
  "Belgium":"Bélgica","Egypt":"Egipto","Iran":"Irán","New Zealand":"N. Zelanda","Cape Verde":"Cabo Verde",
  "Saudi Arabia":"Arabia Saudí","Spain":"España","Uruguay":"Uruguay","France":"Francia","Iraq":"Irak",
  "Norway":"Noruega","Senegal":"Senegal","Algeria":"Argelia","Argentina":"Argentina","Austria":"Austria",
  "Jordan":"Jordania","Colombia":"Colombia","DR Congo":"RD Congo","Portugal":"Portugal","Uzbekistan":"Uzbekistán",
  "Croatia":"Croacia","England":"Inglaterra","Ghana":"Ghana","Panama":"Panamá"
};

export const CODE = {
  "Mexico":"MEX","South Africa":"RSA","Czech Republic":"CZE","South Korea":"KOR","Bosnia & Herzegovina":"BIH",
  "Canada":"CAN","Qatar":"QAT","Switzerland":"SUI","Brazil":"BRA","Haiti":"HAI","Morocco":"MAR","Scotland":"SCO",
  "Australia":"AUS","Paraguay":"PAR","Turkey":"TUR","USA":"USA","Curaçao":"CUW","Ecuador":"ECU","Germany":"GER",
  "Ivory Coast":"CIV","Japan":"JPN","Netherlands":"NED","Sweden":"SWE","Tunisia":"TUN","Belgium":"BEL","Egypt":"EGY",
  "Iran":"IRN","New Zealand":"NZL","Cape Verde":"CPV","Saudi Arabia":"KSA","Spain":"ESP","Uruguay":"URU","France":"FRA",
  "Iraq":"IRQ","Norway":"NOR","Senegal":"SEN","Algeria":"ALG","Argentina":"ARG","Austria":"AUT","Jordan":"JOR",
  "Colombia":"COL","DR Congo":"COD","Portugal":"POR","Uzbekistan":"UZB","Croatia":"CRO","England":"ENG",
  "Ghana":"GHA","Panama":"PAN"
};

export const CONFEDERATION = {
  "Spain":"UEFA","France":"UEFA","England":"UEFA","Portugal":"UEFA","Netherlands":"UEFA","Germany":"UEFA",
  "Belgium":"UEFA","Croatia":"UEFA","Switzerland":"UEFA","Turkey":"UEFA","Norway":"UEFA","Austria":"UEFA",
  "Czech Republic":"UEFA","Sweden":"UEFA","Scotland":"UEFA","Bosnia & Herzegovina":"UEFA",
  "Argentina":"CONMEBOL","Colombia":"CONMEBOL","Brazil":"CONMEBOL","Uruguay":"CONMEBOL","Ecuador":"CONMEBOL","Paraguay":"CONMEBOL",
  "Mexico":"CONCACAF","USA":"CONCACAF","Canada":"CONCACAF","Panama":"CONCACAF","Curaçao":"CONCACAF","Haiti":"CONCACAF",
  "Japan":"AFC","Iran":"AFC","South Korea":"AFC","Australia":"AFC","Qatar":"AFC","Saudi Arabia":"AFC","Uzbekistan":"AFC","Iraq":"AFC","Jordan":"AFC",
  "Morocco":"CAF","Senegal":"CAF","Ivory Coast":"CAF","Egypt":"CAF","Algeria":"CAF","DR Congo":"CAF","South Africa":"CAF","Ghana":"CAF","Tunisia":"CAF","Cape Verde":"CAF",
  "New Zealand":"OFC"
};

export const CONF_COLOR = {
  AFC:"#54A8FF", CAF:"#2FD27A", CONCACAF:"#F4C44C", CONMEBOL:"#FF8A3D", OFC:"#9b8cff", UEFA:"#ff6f91"
};

/** Bandera nacional (flagcdn) o null si no es selección conocida. */
export function nationalFlag(name){
  const iso = ISO[name];
  return iso ? `https://flagcdn.com/w80/${iso}.png` : null;
}

/* ============ CLUBES (ligas/copas) — registro dinámico ============ */
const REG = new Map(); // name -> { id, logo }
export function registerTeams(list){
  if(!Array.isArray(list)) return;
  for(const t of list){
    if(!t || !t.name) continue;
    const cur = REG.get(t.name) || {};
    REG.set(t.name, { id: t.id ?? cur.id, logo: t.logo ?? cur.logo });
  }
}
export function logoUrl(name){ const t = REG.get(name); return t ? t.logo : null; }
export function teamId(name){ const t = REG.get(name); return t ? t.id : null; }
export function knownTeams(){ return [...REG.keys()]; }

/* ============ helpers comunes ============ */
/** Nombre para mostrar: ES si es selección, si no el nombre del club (saneado). */
export function esName(name){
  if(name == null) return "";
  return NAME_ES[name] || String(name).replace(/[<>]/g, "").trim();
}

/** Código corto: FIFA si es selección, si no derivado del nombre. */
const CODE_CACHE = new Map();
export function code(name){
  if(!name) return "?";
  if(CODE[name]) return CODE[name];
  if(CODE_CACHE.has(name)) return CODE_CACHE.get(name);
  const clean = String(name).normalize("NFD").replace(/[^A-Za-z0-9 ]/g, "").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  let c = words.length >= 2
    ? (words[0][0] + words[1][0] + (words[1][1] || "")).toUpperCase()
    : clean.slice(0, 3).toUpperCase();
  c = c.replace(/[^A-Z0-9]/g, "") || "?";
  CODE_CACHE.set(name, c);
  return c;
}

export function conf(name){ return CONFEDERATION[name] || ""; }

/** Color del monograma: por confederación si es selección, si no por hash. */
export function teamColor(name){
  const c = CONF_COLOR[conf(name)];
  if(c) return c;
  let h = 0; const s = String(name || "");
  for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 42% 40%)`;
}
