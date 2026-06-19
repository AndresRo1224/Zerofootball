/**
 * ui/views/bracket.js — Cuadro de eliminatorias proyectado (camino más probable).
 * Resuelve los placeholders (1A, W73, 3A/B/…) con la simulación "likely".
 */
import { S, Engine } from "../../state.js";
import { esName } from "../../data/teams.js";
import { el, flagEl, isReal, refLabel, pct } from "../components.js";
import { openMatch } from "../sheets.js";

export function renderBracket(){
  if(!S.likely) S.likely = Engine.simulateOnce(S.T, S.model, Engine.mulberry32(7), "likely");
  const L = S.likely;
  const v = el("div");

  const champ = L.champion;
  if(champ){
    const cb = el("div", { class: "champbox" });
    cb.appendChild(el("div", { class: "lbl" }, "Campeón proyectado 🏆"));
    cb.appendChild(flagEl(champ));
    cb.appendChild(el("div", { class: "nm" }, esName(champ)));
    cb.appendChild(el("div", { class: "od" },
      (S.simProbs && S.simProbs[champ]) ? ("Probabilidad de título: " + pct(S.simProbs[champ].champion)) : "Camino más probable según el modelo"));
    v.appendChild(cb);
  }

  v.appendChild(el("div", { class: "explain", style: "margin:0 4px 12px;font-size:11.5px;color:var(--faint)" },
    "Proyección determinista. Para probabilidades reales usa el simulador en Predicción. Desliza para ver todo el cuadro →"));

  const scroll = el("div", { class: "bracket-scroll" });
  const br = el("div", { class: "bracket" });
  br.appendChild(bcol("16avos", Engine.R32, L));
  br.appendChild(bcol("Octavos", Engine.R16, L));
  br.appendChild(bcol("Cuartos", Engine.QF, L));
  br.appendChild(bcol("Semis", Engine.SF, L));
  br.appendChild(bcol("Final", [Engine.FINAL], L));
  scroll.appendChild(br);
  v.appendChild(scroll);

  return { content: v, substrip: null };
}

function bcol(title, nums, L){
  const col = el("div", { class: "bcol" });
  col.appendChild(el("div", { class: "ch" }, title));
  nums.forEach(n => {
    const m = S.T.byNum[n];
    const t1 = resolveSide(m, 1, L), t2 = resolveSide(m, 2, L);
    const w = L.matchWinner[n];
    const node = el("div", { class: "bnode", onclick: () => openMatch(m) });
    node.appendChild(bteam(t1, w));
    node.appendChild(el("div", { class: "bvs" }));
    node.appendChild(bteam(t2, w));
    col.appendChild(node);
  });
  return col;
}
function bteam(team, winner){
  const isW = team && team === winner;
  const row = el("div", { class: "bteam" + (isW ? " w" : "") });
  if(team && isReal(team)){
    row.appendChild(flagEl(team));
    row.appendChild(el("div", { class: "nm" }, esName(team)));
    row.appendChild(el("div", { class: "pc" }, isW ? "✓" : ""));
  } else {
    row.appendChild(el("div", { class: "mono flag", style: "background:#2a3a48" }, "?"));
    row.appendChild(el("div", { class: "nm", style: "color:var(--faint)" }, team ? refLabel(team) : "—"));
  }
  return row;
}

function resolveSide(m, side, L){
  const ref = side === 1 ? m.team1Ref : m.team2Ref;
  if(isReal(ref)) return ref;
  let x = /^([WL])(\d+)$/.exec(ref);
  if(x){ const n = +x[2]; return x[1] === "W" ? L.matchWinner[n] : L.matchLoser[n]; }
  x = /^([12])([A-L])$/.exec(ref);
  if(x) return x[1] === "1" ? L.winners[x[2]] : L.runners[x[2]];
  if(/^3([A-L])(?:\/[A-L])+$/.test(ref)){
    const g = L.slotGroup[m.num + "-" + side];
    return g ? L.gs.thirdsByGroup[g] : ref;
  }
  return ref;
}
