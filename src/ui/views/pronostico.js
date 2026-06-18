/**
 * ui/views/pronostico.js — Pronóstico de temporada (Monte Carlo).
 * Liga: probabilidad de título, plazas de Champions y descenso.
 * Copa: no aplica la liguilla; se muestran los favoritos por Elo.
 */
import { S, currentLeagueMeta } from "../../state.js";
import { esName } from "../../data/teams.js";
import { el, flagEl, pct, emptyState } from "../components.js";
import { openTeam } from "../sheets.js";
import { runSeasonSim } from "../sim.js";

const TROPHY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4C44C" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3"/></svg>';

export function renderPronostico(){
  const v = el("div");
  const meta = currentLeagueMeta();

  if(!S.T.teams.length){
    v.appendChild(emptyState("🔮", "Sin datos", "Carga una liga para ver su pronóstico."));
    return { content: v, substrip: null };
  }

  if(meta.type === "cup"){
    v.appendChild(el("div", { class: "explain", style: "margin:4px 4px 12px" },
      "El pronóstico de temporada (título · Champions · descenso) aplica a ligas. " +
      "Para una copa, usa la pestaña Predicción y simula cualquier cruce con prórroga y penales."));
    v.appendChild(eloTop());
    return { content: v, substrip: null };
  }

  const panel = el("div", { class: "panel" });
  panel.appendChild(el("h3", { html: TROPHY + " Pronóstico de temporada" }));
  if(!S.simProbs){
    panel.appendChild(el("div", { class: "explain", style: "margin-bottom:12px" },
      "Simula lo que queda de temporada miles de veces (Monte Carlo) para estimar quién gana la liga, quién entra a Champions y quién desciende."));
    panel.appendChild(el("button", { class: "btn", onclick: () => runSeasonSim(5000, () => S.refresh()) },
      "Simular 5.000 temporadas"));
  } else {
    panel.appendChild(oddsTable(meta));
    panel.appendChild(el("button", { class: "btn ghost", style: "margin-top:12px", onclick: () => runSeasonSim(10000, () => S.refresh()) },
      "Volver a simular (10.000)"));
  }
  v.appendChild(panel);
  return { content: v, substrip: null };
}

function oddsTable(meta){
  const arr = Object.entries(S.simProbs).sort((a, b) => a[1].avgRank - b[1].avgRank);
  const t = el("table", { class: "gt odds" });
  t.appendChild(el("thead", {}, el("tr", {}, [
    el("th", { class: "l" }, "#"), el("th", { class: "l" }, "Equipo"),
    el("th", {}, "Título"), el("th", {}, meta.cl ? "UCL" : "Top"), el("th", {}, "Desc.")
  ])));
  const tb = el("tbody");
  arr.forEach(([team, p], i) => {
    const tr = el("tr", { onclick: () => openTeam(team) });
    tr.appendChild(el("td", { class: "l" }, String(i + 1)));
    const tn = el("td", { class: "l" });
    tn.appendChild(el("span", { class: "tname" }, [flagEl(team), el("span", {}, esName(team))]));
    tr.appendChild(tn);
    tr.appendChild(el("td", { class: "pts" }, pct(p.title, 0)));
    tr.appendChild(el("td", { style: p.top > 0.5 ? "color:#2FD27A" : "" }, pct(p.top, 0)));
    tr.appendChild(el("td", { style: p.releg > 0.08 ? "color:#ff7a7a" : "color:var(--faint)" }, pct(p.releg, 0)));
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  return t;
}

function eloTop(){
  const lb = S.model.leaderboard(S.T.teamsSet).slice(0, 16);
  const box = el("div", { class: "panel" });
  box.appendChild(el("h3", { html: TROPHY + " Favoritos por Elo" }));
  lb.forEach(([t, r], i) => {
    const row = el("div", { class: "oddrow", onclick: () => openTeam(t) });
    row.appendChild(el("div", { class: "rk" }, String(i + 1)));
    row.appendChild(flagEl(t));
    row.appendChild(el("div", { class: "nm" }, esName(t)));
    row.appendChild(el("div", { class: "pc", style: "color:var(--sky);width:54px;font-size:16px" }, String(Math.round(r))));
    box.appendChild(row);
  });
  return box;
}
