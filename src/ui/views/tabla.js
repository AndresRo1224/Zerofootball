/**
 * ui/views/tabla.js — Clasificación de la liga (o tablas de grupo en copas).
 * Usa la tabla oficial de la API; si falta, la calcula con computeStandings.
 */
import { S, Engine, currentLeagueMeta } from "../../state.js";
import { esName } from "../../data/teams.js";
import { el, flagEl, emptyState, sect } from "../components.js";
import { openTeam } from "../sheets.js";

export function renderTabla(){
  const substrip = el("div", { class: "strip" }, [
    el("button", { class: "chip", onclick: () => S.go("pronostico") }, "Ver pronóstico de temporada")
  ]);

  const v = el("div");
  let groups = (S.T.standings && S.T.standings.length) ? S.T.standings : null;
  if(!groups){
    const computed = computeFromResults();
    if(computed) groups = [computed];
  }
  if(!groups){
    v.appendChild(emptyState("📊", "Sin clasificación",
      "Aún no hay tabla para esta competición (o no llegó de la API)."));
    return { content: v, substrip };
  }

  const meta = currentLeagueMeta();
  groups.forEach((rows, i) => {
    const title = groups.length > 1
      ? (rows[0]?.group || "Grupo " + String.fromCharCode(65 + i))
      : S.T.name;
    v.appendChild(tableCard(rows, title, groups.length === 1 ? meta : null));
  });
  v.appendChild(legend(groups.length === 1 ? meta : null));
  return { content: v, substrip };
}

function computeFromResults(){
  const results = Engine.playedResults(S.T);
  if(!results.length) return null;
  return Engine.computeStandings(S.T.teams, results, null).map((s, i) => ({
    rank: i + 1, team: s.team, pj: s.pj, w: s.w, d: s.d, l: s.l,
    gf: s.gf, ga: s.ga, gd: s.gd, pts: s.pts, form: ""
  }));
}

function zoneColor(pos, n, meta){
  if(!meta) return "transparent";
  if(pos < (meta.cl || 0)) return "#2FD27A";              // Champions
  if(pos >= n - (meta.releg || 0)) return "#ff5a5a";      // descenso
  return "transparent";
}

function tableCard(rows, title, meta){
  const card = el("div", { class: "gcard" });
  card.appendChild(el("div", { class: "ghead" }, [
    el("div", { class: "gl" }, title),
    el("div", { class: "gn" }, (rows[0]?.pj || 0) + " jugados")
  ]));

  const t = el("table", { class: "gt" });
  t.appendChild(el("thead", {}, el("tr", {}, [
    el("th", { class: "l" }, "#"), el("th", { class: "l" }, "Equipo"),
    el("th", {}, "PJ"), el("th", {}, "DG"), el("th", {}, "Pts")
  ])));
  const tb = el("tbody");
  const n = rows.length;
  rows.forEach((s, i) => {
    const tr = el("tr", { onclick: () => openTeam(s.team) });
    const pos = el("td", { class: "l" }, String(s.rank || i + 1));
    tr.appendChild(pos);
    const tn = el("td", { class: "l" });
    tn.appendChild(el("span", { class: "tname" }, [
      el("span", { class: "posdot", style: `background:${zoneColor(i, n, meta)}` }),
      flagEl(s.team), el("span", {}, esName(s.team))
    ]));
    tr.appendChild(tn);
    tr.appendChild(el("td", {}, String(s.pj)));
    tr.appendChild(el("td", {}, (s.gd > 0 ? "+" : "") + s.gd));
    tr.appendChild(el("td", { class: "pts" }, String(s.pts)));
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  card.appendChild(t);
  return card;
}

function legend(meta){
  if(!meta) return el("div");
  const wrap = el("div", { class: "legend" });
  if(meta.cl) wrap.appendChild(chip("#2FD27A", "Champions"));
  if(meta.releg) wrap.appendChild(chip("#ff5a5a", "Descenso"));
  return wrap;
}
function chip(color, label){
  return el("span", { class: "lgd" }, [
    el("span", { class: "dot", style: `background:${color}` }), label
  ]);
}
