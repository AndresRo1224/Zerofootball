/**
 * main.js — Arranque de la app de fútbol.
 *  1) Render inmediato con la instantánea local (si hay).
 *  2) Carga de la liga seleccionada vía proxy (API-Football).
 *  3) Selector de liga + auto-refresco + "tick" del minuto en vivo.
 */
import { CONFIG } from "./config.js";
import { S, setLeagueData, currentLeagueMeta, Engine } from "./state.js";
import { initRouter } from "./router.js";
import { loadLeague } from "./data/providers/provider.js";
import { normalizeFixtures, normalizeStandings } from "./data/providers/apiSports.js";
import snapshot from "./data/snapshot.js";
import { openElo, openAbout } from "./ui/sheets.js";
import { flashToast, el } from "./ui/components.js";
import { statusOf } from "./ui/format.js";

/* ---------- etiqueta de estado de datos ---------- */
function setUpdated(text, live){
  const lab = document.getElementById("updatedLabel");
  lab.innerHTML = "";
  lab.appendChild(el("span", { class: "dotpulse", style: live ? "" : "background:var(--faint)" }));
  lab.appendChild(el("span", {}, text));
}
function setBrandSub(text){
  const sub = document.getElementById("brandSub");
  if(sub) sub.textContent = text;
}

/* ---------- re-render conservando el scroll ---------- */
function refreshKeepScroll(){
  const y = window.scrollY;
  S.refresh();
  window.scrollTo(0, y);
}
function sheetOpen(){ return document.getElementById("sheet").classList.contains("show"); }

/* ---------- parseo de una respuesta de loadLeague a S.T ---------- */
function applyLoad({ league, season, matches, standings, isLive, label }){
  const T = Engine.parseLeague(matches, standings, {
    name: league.name, type: league.type, leagueId: league.id, season
  });
  setLeagueData(T, { isLive, label });
}

/* ---------- carga de datos ---------- */
let loadToken = 0;
async function reload(manual){
  const myToken = ++loadToken;
  if(manual) flashToast("Actualizando…");
  setUpdated("Cargando " + currentLeagueMeta().name + "…", false);

  const res = await loadLeague(S.currentLeague);
  if(myToken !== loadToken) return;          // llegó otra carga más nueva

  if(!res.matches.length && res.error){
    applyLoad(res);                          // T vacío, pero no rompe
    setUpdated(res.label, false);
    refreshKeepScroll();
    if(manual) flashToast("Sin datos: revisa conexión/plan de la API");
    return;
  }

  applyLoad(res);
  const played = S.T.matches.filter(m => m.played).length;
  if(res.isLive) setUpdated("En vivo · " + res.label, true);
  else setUpdated(res.label + " · " + played + " partidos", false);
  refreshKeepScroll();
  if(manual) flashToast(res.error ? "Sin conexión: datos locales" : "✓ Actualizado");
}

/* ---------- selector de liga ---------- */
function buildLeagueSelect(){
  const sel = document.getElementById("leagueSel");
  if(!sel) return;
  sel.innerHTML = "";
  S.leagues.forEach(l => {
    const o = el("option", { value: l.id }, l.name + " · " + l.country);
    if(l.id === S.currentLeague) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener("change", () => {
    S.currentLeague = Number(sel.value);
    S.simProbs = null;
    setBrandSub(currentLeagueMeta().name);
    reload(true);
  });
}

/* ---------- arranque ---------- */
function boot(){
  // 1) primer pintado: instantánea local o estructura vacía (S.T nunca es null)
  const meta = currentLeagueMeta();
  let firstT = null;
  try {
    if(snapshot && snapshot.leagueId === S.currentLeague && snapshot.fixtures?.response?.length){
      const matches = normalizeFixtures(snapshot.fixtures, meta.type);
      const standings = snapshot.standings ? normalizeStandings(snapshot.standings) : null;
      firstT = Engine.parseLeague(matches, standings,
        { name: meta.name, type: meta.type, leagueId: meta.id, season: snapshot.season });
    }
  } catch { /* instantánea inválida: seguimos con estructura vacía */ }
  if(!firstT) firstT = Engine.parseLeague([], null,
    { name: meta.name, type: meta.type, leagueId: meta.id, season: CONFIG.SEASON });
  setLeagueData(firstT, { isLive: false, label: meta.name + " · cargando" });

  setBrandSub(meta.name);
  buildLeagueSelect();
  initRouter();

  document.getElementById("btnElo").addEventListener("click", openElo);
  document.getElementById("btnInfo").addEventListener("click", openAbout);
  document.getElementById("btnRefresh").addEventListener("click", () => reload(true));
  document.getElementById("brand").addEventListener("click", () => S.go("hoy"));
  document.getElementById("sheetBg").addEventListener("click", () =>
    import("./ui/sheets.js").then(s => s.closeSheet()));

  // 2) datos reales
  reload(false);

  // 3) auto-refresco periódico
  setInterval(() => { if(!sheetOpen()) reload(false); }, CONFIG.POLL_INTERVAL_MS);

  // 3b) tick para refrescar el minuto/probabilidad de partidos en vivo
  setInterval(() => {
    if(sheetOpen() || !S.T) return;
    const hayVivo = S.T.matches.some(m => statusOf(m).kind === "live");
    if(hayVivo) refreshKeepScroll();
  }, CONFIG.LIVE_TICK_MS);

  // PWA
  if("serviceWorker" in navigator){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
