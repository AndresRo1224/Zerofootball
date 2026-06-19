/**
 * main.js — Arranque. Soporta Mundial (openfootball) y ligas (API-Football).
 */
import { CONFIG } from "./config.js";
import { S, setCompetitionData, currentLeagueMeta, Engine } from "./state.js";
import { initRouter } from "./router.js";
import { loadCompetition } from "./data/providers/provider.js";
import { normalizeFixtures, normalizeStandings } from "./data/providers/apiSports.js";
import snapshot from "./data/snapshot.js";
import wcSnapshot from "./data/wcSnapshot.js";
import { openElo, openAbout } from "./ui/sheets.js";
import { flashToast, el } from "./ui/components.js";
import { statusOf } from "./ui/format.js";

/* ---------- etiquetas ---------- */
function setUpdated(text, live){
  const lab = document.getElementById("updatedLabel");
  lab.innerHTML = "";
  lab.appendChild(el("span", { class: "dotpulse", style: live ? "" : "background:var(--faint)" }));
  lab.appendChild(el("span", {}, text));
}
function setBrandSub(text){ const s = document.getElementById("brandSub"); if(s) s.textContent = text; }

/** Etiquetas de las pestañas según el modo (Mundial vs liga). */
function updateNavLabels(){
  const wc = currentLeagueMeta().type === "worldcup";
  const set = (tab, txt) => { const b = document.querySelector('#nav button[data-tab="' + tab + '"] .lb'); if(b) b.textContent = txt; };
  set("tabla", wc ? "Grupos" : "Tabla");
  set("pronostico", wc ? "Bracket" : "Pronóstico");
}

function refreshKeepScroll(){ const y = window.scrollY; S.refresh(); window.scrollTo(0, y); }
function sheetOpen(){ return document.getElementById("sheet").classList.contains("show"); }

/* ---------- construir S.T desde una respuesta del proveedor ---------- */
function applyLoad(res){
  if(res.type === "worldcup"){
    const T = Engine.parseTournament(res.raw);
    setCompetitionData(T, { type: "worldcup", isLive: res.isLive, label: res.label });
  } else {
    const { league, season, matches, standings, isLive, label } = res;
    const T = Engine.parseLeague(matches, standings,
      { name: league.name, type: league.type, leagueId: league.id, season });
    setCompetitionData(T, { type: league.type, isLive, label });
  }
}

/* ---------- carga ---------- */
let loadToken = 0;
function loadbar(on){ const b = document.getElementById("loadbar"); if(b) b.classList.toggle("on", on); }

async function reload(manual){
  const myToken = ++loadToken;
  if(manual) flashToast("Actualizando…");
  loadbar(true);
  setUpdated("Cargando " + currentLeagueMeta().name + "…", false);

  const res = await loadCompetition(currentLeagueMeta());
  if(myToken !== loadToken) return;
  loadbar(false);

  applyLoad(res);
  const played = S.T.matches.filter(m => m.played).length;
  if(res.isLive) setUpdated("En vivo · " + res.label, true);
  else setUpdated(res.label + " · " + played + " partidos", false);
  updateNavLabels();
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
    S.simProbs = null; S.likely = null; S.partidosRound = "";
    setBrandSub(currentLeagueMeta().name);
    reload(true);
  });
}

/* ---------- primer pintado (sin red) ---------- */
function firstPaint(meta){
  try{
    if(meta.type === "worldcup") return Engine.parseTournament(wcSnapshot);
    if(snapshot && snapshot.leagueId === meta.id && snapshot.fixtures?.response?.length){
      const matches = normalizeFixtures(snapshot.fixtures, meta.type);
      const standings = snapshot.standings ? normalizeStandings(snapshot.standings) : null;
      return Engine.parseLeague(matches, standings,
        { name: meta.name, type: meta.type, leagueId: meta.id, season: snapshot.season });
    }
  }catch{ /* instantánea inválida */ }
  return meta.type === "worldcup"
    ? Engine.parseTournament(wcSnapshot)
    : Engine.parseLeague([], null, { name: meta.name, type: meta.type, leagueId: meta.id, season: CONFIG.SEASON });
}

/* ---------- arranque ---------- */
function boot(){
  const meta = currentLeagueMeta();
  setCompetitionData(firstPaint(meta), { type: meta.type, isLive: false, label: meta.name + " · cargando" });

  setBrandSub(meta.name);
  buildLeagueSelect();
  initRouter();
  updateNavLabels();

  document.getElementById("btnElo").addEventListener("click", openElo);
  document.getElementById("btnInfo").addEventListener("click", openAbout);
  document.getElementById("btnRefresh").addEventListener("click", () => reload(true));
  document.getElementById("brand").addEventListener("click", () => S.go("hoy"));
  document.getElementById("sheetBg").addEventListener("click", () =>
    import("./ui/sheets.js").then(s => s.closeSheet()));

  reload(false);

  setInterval(() => { if(!sheetOpen()) reload(false); }, CONFIG.POLL_INTERVAL_MS);
  setInterval(() => {
    if(sheetOpen() || !S.T) return;
    if(S.T.matches.some(m => statusOf(m).kind === "live")) refreshKeepScroll();
  }, CONFIG.LIVE_TICK_MS);

  if("serviceWorker" in navigator){
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
