/**
 * ui/views/grupos.js — Las 12 tablas de grupos del Mundial, calculadas en vivo
 * con los desempates FIFA. Opcionalmente muestra el % de clasificación (Monte Carlo).
 */
import { S, Engine } from "../../state.js";
import { esName } from "../../data/teams.js";
import { el, flagEl, pct } from "../components.js";
import { openTeam } from "../sheets.js";
import { runMonteCarlo } from "../sim.js";

export function renderGrupos(){
  const substrip = el("div", { class: "strip" }, [
    el("button", {
      class: "chip" + (S.simProbs ? " on" : ""),
      onclick: () => { if(!S.simProbs) runMonteCarlo(2500, () => S.refresh()); else S.refresh(); }
    }, S.simProbs ? "% clasificación ✓" : "Calcular % clasificación"),
    el("button", { class: "chip", onclick: () => S.go("pronostico") }, "Ver bracket")
  ]);

  const v = el("div");
  Object.keys(S.T.groups).forEach(g => v.appendChild(groupCard(g)));
  return { content: v, substrip };
}

function groupCard(g){
  const results = [];
  S.T.groupMatches[g].forEach(m => { if(m.played && m.score) results.push([m.team1Ref, m.team2Ref, m.score[0], m.score[1]]); });
  const table = Engine.computeStandings(S.T.groups[g], results, null);

  const card = el("div", { class: "gcard" });
  const head = el("div", { class: "ghead" }, [
    el("div", { class: "gl" }, "Grupo " + g),
    el("div", { class: "gn" }, results.length + "/6 jugados")
  ]);
  card.appendChild(head);

  const showQ = !!S.simProbs;
  const t = el("table", { class: "gt" });
  t.appendChild(el("thead", {}, el("tr", {}, [
    el("th", { class: "l" }, "Equipo"), el("th", {}, "PJ"), el("th", {}, "DG"), el("th", {}, "Pts"),
    showQ ? el("th", {}, "Clas%") : null
  ])));
  const tb = el("tbody");
  table.forEach((s, i) => {
    const cls = i === 0 ? "q1" : i === 1 ? "q2" : i === 2 ? "q3" : "qx";
    const tr = el("tr", { class: cls, onclick: () => openTeam(s.team) });
    const tn = el("td", { class: "l" });
    tn.appendChild(el("span", { class: "tname" }, [
      el("span", { class: "posdot" }), flagEl(s.team), el("span", {}, esName(s.team))
    ]));
    tr.appendChild(tn);
    tr.appendChild(el("td", {}, String(s.pj)));
    tr.appendChild(el("td", {}, (s.gd > 0 ? "+" : "") + s.gd));
    tr.appendChild(el("td", { class: "pts" }, String(s.pts)));
    if(showQ){
      const q = S.simProbs[s.team] ? S.simProbs[s.team].qual : 0;
      tr.appendChild(el("td", {}, el("span", { class: "qpct" }, pct(q, 0))));
    }
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  card.appendChild(t);
  return card;
}
