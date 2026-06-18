/**
 * data/teams.js — Registro DINÁMICO de equipos (clubes).
 *
 * Antes había un mapa fijo de 48 selecciones. Ahora los equipos llegan de la API
 * (nombre + escudo + id) y se registran al cargar cada liga. La UI pide el escudo
 * por nombre; si falta, cae a un monograma de color.
 *
 * Seguridad (XSS): los nombres vienen de la API y a veces se insertan en HTML;
 * esName()/code() saneados eliminan `<` `>` para que no puedan inyectar marcado.
 */

const REG = new Map(); // name -> { id, logo }

export function registerTeams(list) {
  if (!Array.isArray(list)) return;
  for (const t of list) {
    if (!t || !t.name) continue;
    const cur = REG.get(t.name) || {};
    REG.set(t.name, { id: t.id ?? cur.id, logo: t.logo ?? cur.logo });
  }
}
export function logoUrl(name) { const t = REG.get(name); return t ? t.logo : null; }
export function teamId(name) { const t = REG.get(name); return t ? t.id : null; }
export function knownTeams() { return [...REG.keys()]; }

/** Nombre para mostrar (saneado). */
export function esName(name) { return name == null ? "" : String(name).replace(/[<>]/g, "").trim(); }

/** Código corto (2-3 letras) derivado del nombre, solo [A-Z0-9]. */
const CODE_CACHE = new Map();
export function code(name) {
  if (!name) return "?";
  if (CODE_CACHE.has(name)) return CODE_CACHE.get(name);
  // NFD separa los acentos como marcas; el filtro a [A-Za-z0-9 ] las elimina.
  const clean = String(name).normalize("NFD").replace(/[^A-Za-z0-9 ]/g, "").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  let c = words.length >= 2
    ? (words[0][0] + words[1][0] + (words[1][1] || "")).toUpperCase()
    : clean.slice(0, 3).toUpperCase();
  c = c.replace(/[^A-Z0-9]/g, "") || "?";
  CODE_CACHE.set(name, c);
  return c;
}

/** Color estable por nombre (para el monograma cuando no hay escudo). */
export function teamColor(name) {
  let h = 0; const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 42% 40%)`;
}

/** Compatibilidad: ya no hay confederaciones; se conserva como no-op. */
export const conf = () => "";
