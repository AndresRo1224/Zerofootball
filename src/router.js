/**
 * router.js — Navegación entre pestañas + rutas con hash (#/tabla, etc.).
 */
import { S, currentLeagueMeta } from "./state.js";
import { renderHoy } from "./ui/views/hoy.js";
import { renderPartidos } from "./ui/views/partidos.js";
import { renderTabla } from "./ui/views/tabla.js";
import { renderGrupos } from "./ui/views/grupos.js";
import { renderPrediccion } from "./ui/views/prediccion.js";
import { renderPronostico } from "./ui/views/pronostico.js";
import { renderBracket } from "./ui/views/bracket.js";

const isWC = () => currentLeagueMeta().type === "worldcup";

const VIEWS = {
  hoy: renderHoy,
  partidos: renderPartidos,
  tabla: () => isWC() ? renderGrupos() : renderTabla(),       // Mundial: Grupos
  prediccion: renderPrediccion,
  pronostico: () => isWC() ? renderBracket() : renderPronostico() // Mundial: Bracket
};
const TABS = Object.keys(VIEWS);

function mount(node){
  const v = document.getElementById("view");
  v.innerHTML = ""; v.appendChild(node);
  window.scrollTo(0, 0);
}
function setSubstrip(node){
  const c = document.getElementById("substrip");
  c.innerHTML = ""; if(node) c.appendChild(node);
}

export function go(tab, { fromHash = false } = {}){
  if(!VIEWS[tab]) tab = "hoy";
  S.currentTab = tab;
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  const { content, substrip } = VIEWS[tab]();
  setSubstrip(substrip);
  mount(content);
  if(!fromHash && location.hash !== "#/" + tab) history.replaceState(null, "", "#/" + tab);
}

/** Re-renderiza la pestaña actual (tras cambios de estado/datos). */
export function refreshView(){ go(S.currentTab); }

export function initRouter(){
  S.go = go;
  S.refresh = refreshView;

  document.getElementById("nav").addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]");
    if(b) go(b.dataset.tab);
  });
  window.addEventListener("hashchange", () => {
    const tab = (location.hash || "").replace(/^#\//, "");
    if(TABS.includes(tab) && tab !== S.currentTab) go(tab, { fromHash: true });
  });

  const initial = (location.hash || "").replace(/^#\//, "");
  go(TABS.includes(initial) ? initial : "hoy", { fromHash: true });
}
