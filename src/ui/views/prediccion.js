/**
 * ui/views/prediccion.js — Predictor de cualquier cruce + explicación del modelo.
 * Las probabilidades de toda la temporada están en la pestaña Pronóstico.
 */
import { S, Engine } from "../../state.js";
import { esName } from "../../data/teams.js";
import { el, flagEl, predictionResult } from "../components.js";

const P = S.predictor;

export function renderPrediccion(){
  const v = el("div");

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

  // acceso al pronóstico de temporada
  const tp = el("div", { class: "panel" });
  tp.appendChild(el("h3", { html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4C44C" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3"/></svg> Pronóstico de temporada' }));
  tp.appendChild(el("div", { class: "explain", style: "margin-bottom:12px" },
    "Estima campeón, plazas de Champions y descenso simulando lo que queda de liga miles de veces."));
  tp.appendChild(el("button", { class: "btn ghost", onclick: () => S.go("pronostico") }, "Abrir pronóstico"));
  v.appendChild(tp);

  v.appendChild(howItWorks());
  return { content: v, substrip: null };
}

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
    "<p><b>Fuerza Elo.</b> Cada equipo tiene una calificación de nivel. Parte de la tabla actual y se <b>refina con los resultados reales</b> (golear y ganar a rivales fuertes sube más).</p>" +
    "<p style='margin-top:10px'><b>Goles esperados.</b> La diferencia de Elo se convierte en los goles esperados de cada equipo (λ), sumando la <b>ventaja de local</b>.</p>" +
    "<p style='margin-top:10px'><b>Marcadores (Poisson + Dixon-Coles).</b> Con esos λ se calcula la probabilidad de cada marcador, ajustando los resultados bajos típicos del fútbol.</p>" +
    "<p style='margin-top:10px'><b>Eliminatorias y temporada.</b> Si hay empate en copa, se añade prórroga y penales. El <b>Monte Carlo</b> juega lo que queda de liga miles de veces para estimar título, Champions y descenso.</p>" +
    "<p style='margin-top:10px;color:var(--faint)'>Modelo probabilístico, no una certeza: el fútbol tiene una varianza enorme.</p>";
  d.appendChild(body);
  return d;
}
