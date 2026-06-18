/**
 * ui/views/partidos.js — Calendario completo: por fecha, con filtro
 * (próximos / resultados / todos) y selector de jornada o ronda.
 */
import { S } from "../../state.js";
import { dateLabel, sortChrono, roundLabel } from "../format.js";
import { el, matchCard, stripEl, emptyState, sect } from "../components.js";

export function renderPartidos(){
  const hasUpcoming = S.T.matches.some(m => !m.played);
  let f = S.partidosFilter || "prox";
  if(f === "prox" && !hasUpcoming) f = "res";

  const chips = [["prox", "Próximos"], ["res", "Resultados"], ["todos", "Todos"]];
  const strip = stripEl(chips, f, val => { S.partidosFilter = val; S.refresh(); });

  // selector de jornada / ronda
  const rounds = S.T.rounds || [];
  if(rounds.length > 1){
    const sel = el("select", { class: "roundsel", onchange: e => { S.partidosRound = e.target.value; S.refresh(); } });
    sel.appendChild(optionEl("", "Todas las jornadas", S.partidosRound));
    rounds.forEach(r => sel.appendChild(optionEl(r, roundLabel(r), S.partidosRound)));
    strip.appendChild(sel);
  }

  let list = sortChrono(S.T.matches);
  if(S.partidosRound){
    list = list.filter(m => m.round === S.partidosRound);
  } else if(f === "prox"){
    list = list.filter(m => !m.played);
  } else if(f === "res"){
    list = list.filter(m => m.played).reverse();
  }

  const v = el("div");
  if(!list.length){
    v.appendChild(emptyState("⚽", "Sin partidos", "No hay partidos para este filtro."));
    return { content: v, substrip: strip };
  }

  let lastDate = null;
  list.forEach(m => {
    if(m.date !== lastDate){ lastDate = m.date; v.appendChild(sect(dateLabel(m.date), null)); }
    v.appendChild(matchCard(m));
  });
  return { content: v, substrip: strip };
}

function optionEl(value, label, current){
  return el("option", { value, selected: value === (current || "") ? "" : null }, label);
}
