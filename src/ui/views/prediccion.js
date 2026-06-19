/**
 * ui/views/prediccion.js — Predictor de cualquier cruce (sirve para selecciones
 * y para clubes) + panel según el modo:
 *   - Mundial: probabilidades del torneo (campeón/finalista) por Monte Carlo.
 *   - Liga: acceso al pronóstico de temporada.
 */
import { S, Engine, currentLeagueMeta } from "../../state.js";
import { esName } from "../../data/teams.js";
import { el, flagEl, predictionResult, pct } from "../components.js";
import { openTeam } from "../sheets.js";
import { runMonteCarlo } from "../sim.js";

const P = S.predictor;

export function renderPrediccion(){
  const v = el("div");

  /* ---- Predictor de cruce ---- */
  const panel = el("div", { class: "panel" });
  panel.appendChild(el("h3", { html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2FD27A" stroke-width="2"><path d="M12 3l2 5 5 .5-3.8 3.3L16.5 17 12 14l-4.5 3 1.3-5.2L5 8.5 10 8z"/></svg> Predice un cruce' }));

  const selrow = el("div", { class: "selrow" });
  selrow.appendChild(teamSelect(P.a, val => { P.a = val; P.result = null; S.refresh(); }));
  selrow.appendChild(el("button", {
    class: "swap", title: "Intercambiar",
    onclick: () => { const x = P.a; P.a = P.b; P.b = x; P.result = null; S.refresh(); },
    html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4v13M7 17l-3-3M7 17l3-3M17 20V7M17 7l-3 3M17 7l3 3"/></svg>'
  }));
  selrow.appendChild(teamSelect(P.b, val => { P.b = val; P.result = null; S.refresh(); }));
  panel.appendChild(selrow);

  const tg = el("div", { class: "toggles" });
  tg.appendChild(toggle("Cancha neutral", P.neutral, () => { P.neutral = !P.neutral; P.result = null; S.refresh(); }));
  tg.appendChild(toggle("Eliminatoria (ida única)", P.ko, () => { P.ko = !P.ko; P.result = null; S.refresh(); }));
  panel.appendChild(tg);

  panel.appendChild(el("button", {
    class: "btn",
    onclick: () => {
      if(!P.a || !P.b || P.a === P.b) return;
      P.result = Engine.predictMatch(P.a, P.b, S.model, { neutral: P.neutral, knockout: P.ko });
      S.refresh();
    }
  }, "Calcular predicción"));

  if(P.result) panel.appendChild(predictionResult(P.result));
  v.appendChild(panel);

  /* ---- Panel según el modo ---- */
  if(currentLeagueMeta().type === "worldcup") v.appendChild(tournamentPanel());
  else v.appendChild(seasonPanel());

  v.appendChild(howItWorks());
  return { content: v, substrip: null };
}

/* Mundial: probabilidades del torneo */
function tournamentPanel(){
  const tp = el("div", { class: "panel" });
  tp.appendChild(el("h3", { html: trophy + " Probabilidades del torneo" }));
  if(!S.simProbs || !("champion" in (Object.values(S.simProbs)[0] || {}))){
    tp.appendChild(el("div", { class: "explain", style: "margin-bottom:12px" },
      "Simula el resto del Mundial miles de veces (Monte Carlo) para estimar quién será campeón, finalista y hasta dónde llega cada selección."));
    tp.appendChild(el("button", { class: "btn ghost", onclick: () => runMonteCarlo(5000, () => S.refresh()) }, "Simular 5.000 torneos"));
  } else {
    tp.appendChild(championOdds());
    tp.appendChild(el("button", { class: "btn ghost", style: "margin-top:12px", onclick: () => runMonteCarlo(8000, () => S.refresh()) }, "Volver a simular (8.000)"));
  }
  return tp;
}

function championOdds(){
  const ranked = Object.entries(S.simProbs).filter(([t, p]) => p.qual > 0.001)
    .sort((a, b) => b[1].champion - a[1].champion).slice(0, 12);
  const max = (ranked[0] && ranked[0][1].champion) || 1;
  const box = el("div");
  ranked.forEach(([t, p], i) => {
    const row = el("div", { class: "oddrow", onclick: () => openTeam(t) });
    row.appendChild(el("div", { class: "rk" }, String(i + 1)));
    row.appendChild(flagEl(t));
    const nm = el("div", { class: "nm" }, esName(t));
    nm.appendChild(el("div", { class: "miniodds" }, el("span", { class: "m" }, "Final " + pct(p.final, 0) + " · Semis " + pct(p.sf, 0))));
    row.appendChild(nm);
    const track = el("div", { class: "track" });
    track.appendChild(el("div", { class: "fillb", style: `width:${p.champion / max * 100}%` }));
    row.appendChild(track);
    row.appendChild(el("div", { class: "pc" }, pct(p.champion, 1)));
    box.appendChild(row);
  });
  return box;
}

/* Liga: acceso al pronóstico de temporada */
function seasonPanel(){
  const tp = el("div", { class: "panel" });
  tp.appendChild(el("h3", { html: trophy + " Pronóstico de temporada" }));
  tp.appendChild(el("div", { class: "explain", style: "margin-bottom:12px" },
    "Estima campeón, plazas de Champions y descenso simulando lo que queda de liga miles de veces."));
  tp.appendChild(el("button", { class: "btn ghost", onclick: () => S.go("pronostico") }, "Abrir pronóstico"));
  return tp;
}

const trophy = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4C44C" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3"/></svg>';

function teamSelect(sel, onChange){
  const wrap = el("div", { class: "sel" });
  wrap.appendChild(flagEl(sel, "fl"));
  const s = el("select", { onchange: e => onChange(e.target.value) });
  S.T.teams.slice().sort((a, b) => esName(a).localeCompare(esName(b))).forEach(t => {
    const o = el("option", { value: t }, esName(t)); if(t === sel) o.selected = true; s.appendChild(o);
  });
  wrap.appendChild(s);
  return wrap;
}
function toggle(label, on, onClick){
  return el("div", { class: "tg" }, [
    el("span", {}, label),
    el("div", { class: "switch" + (on ? " on" : ""), onclick: onClick })
  ]);
}

function howItWorks(){
  const d = el("details", { class: "how" });
  d.appendChild(el("summary", { html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sky)" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg> ¿Cómo funciona el modelo?' }));
  const body = el("div", { class: "body explain" });
  body.innerHTML =
    "<p><b>Fuerza Elo.</b> Cada equipo tiene una calificación de nivel (en ligas parte de la tabla; en el Mundial, de una fuerza base) y se <b>refina con los resultados reales</b>.</p>" +
    "<p style='margin-top:10px'><b>Goles esperados.</b> La diferencia de Elo (+ ventaja de local) da los goles esperados de cada equipo (λ).</p>" +
    "<p style='margin-top:10px'><b>Marcadores (Poisson + Dixon-Coles).</b> Con esos λ se calcula la probabilidad de cada marcador, ajustando los resultados bajos típicos del fútbol.</p>" +
    "<p style='margin-top:10px'><b>Eliminatorias y Monte Carlo.</b> Si hay empate en KO, prórroga y penales. El Monte Carlo juega miles de veces el torneo/temporada para estimar avance, título, Champions o descenso.</p>" +
    "<p style='margin-top:10px;color:var(--faint)'>Modelo probabilístico, no una certeza: el fútbol tiene una varianza enorme.</p>";
  d.appendChild(body);
  return d;
}
