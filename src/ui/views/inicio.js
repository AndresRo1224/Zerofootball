/**
 * ui/views/inicio.js — Pantalla de inicio: bienvenida, accesos a las secciones
 * y un feed de noticias de fútbol (vía /api/news). Es la pestaña de entrada.
 */
import { S, currentLeagueMeta } from "../../state.js";
import { el, sect, emptyState } from "../components.js";
import { openNews } from "../sheets.js";
import { fetchNews } from "../../data/providers/news.js";

const ICON = {
  hoy: '<path d="M3 11l9-8 9 8M5 9.5V21h14V9.5"/>',
  partidos: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  tabla: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>',
  prediccion: '<path d="M12 3l2 5 5 .5-3.8 3.3L16.5 17 12 14l-4.5 3 1.3-5.2L5 8.5 10 8z"/>',
  pronostico: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3"/>'
};

export function renderInicio(){
  const v = el("div");
  const wc = currentLeagueMeta().type === "worldcup";

  // bienvenida
  const hero = el("div", { class: "hero", style: "cursor:default" });
  hero.appendChild(el("div", { class: "eyebrow" }, "Bienvenido a"));
  hero.appendChild(el("div", { style: "font-family:var(--disp);font-weight:700;font-size:28px;margin:6px 0 2px" }, "ZeroFootball"));
  hero.appendChild(el("div", { class: "meta", style: "text-align:left;margin:0" },
    "Estás viendo: " + currentLeagueMeta().name + " · cámbialo con el selector de arriba"));
  v.appendChild(hero);

  // accesos a las secciones
  v.appendChild(sect("Secciones", null));
  const grid = el("div", { class: "shortcuts" });
  const items = [
    ["hoy", "Hoy"],
    ["partidos", "Partidos"],
    ["tabla", wc ? "Grupos" : "Tabla"],
    ["prediccion", "Predicción"],
    ["pronostico", wc ? "Bracket" : "Pronóstico"]
  ];
  items.forEach(([tab, label]) => {
    const b = el("button", { class: "scut", onclick: () => S.go(tab) });
    b.appendChild(el("div", { class: "ic", html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICON[tab]}</svg>` }));
    b.appendChild(el("div", { class: "lb" }, label));
    grid.appendChild(b);
  });
  v.appendChild(grid);

  // noticias
  v.appendChild(sect("Noticias", S.news && S.news.length ? S.news.length + " titulares" : null));
  if(S.news === null){
    if(!S._newsLoading){
      S._newsLoading = true;
      fetchNews().then(n => { S.news = n; S._newsLoading = false; if(S.currentTab === "inicio") S.refresh(); });
    }
    for(let i = 0; i < 4; i++) v.appendChild(el("div", { class: "skel skel-news" }));
  } else if(!S.news.length){
    v.appendChild(emptyState("📰", "Sin noticias", "No se pudieron cargar las noticias ahora."));
  } else {
    S.news.forEach(n => v.appendChild(newsCard(n)));
  }

  return { content: v, substrip: null };
}

function newsCard(n){
  const card = el("div", { class: "newscard", role: "button", tabindex: "0", onclick: () => openNews(n) });
  card.appendChild(el("div", { class: "src" }, n.source + (n.date ? " · " + relTime(n.date) : "")));
  card.appendChild(el("div", { class: "ttl" }, n.title));
  if(n.summary) card.appendChild(el("div", { class: "sum" }, n.summary));
  card.appendChild(el("div", { class: "more" }, "Vista previa →"));
  return card;
}

function relTime(dstr){
  const t = Date.parse(dstr);
  if(!t) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if(mins < 60) return "hace " + mins + " min";
  const h = Math.round(mins / 60);
  if(h < 24) return "hace " + h + " h";
  return "hace " + Math.round(h / 24) + " d";
}
