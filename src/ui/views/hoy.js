/**
 * ui/views/hoy.js — Pestaña "Hoy": partido destacado (en vivo > hoy > próximo >
 * último destacado), partidos de hoy, resultados recientes y próximos.
 */
import { S, Engine } from "../../state.js";
import { esName } from "../../data/teams.js";
import { statusOf, localTime, dateLabel, matchTag, isoToday, sortChrono } from "../format.js";
import { el, flagEl, isReal, refLabel, sect, matchCard, segBar, probLabels, pitchSVG, emptyState } from "../components.js";

export function renderHoy(){
  const v = el("div");
  const now = new Date();
  const todayStr = isoToday();
  const upcoming = sortChrono(S.T.matches.filter(m => !m.played && statusOf(m, now).kind !== "live"));
  const live = S.T.matches.filter(m => statusOf(m, now).kind === "live");
  const played = sortChrono(S.T.matches.filter(m => m.played));

  if(!S.T.matches.length){
    v.appendChild(emptyState("⚽", "Sin partidos",
      "No hay datos para esta competición. Prueba otra liga o pulsa actualizar."));
    return { content: v, substrip: null };
  }

  // destacado
  const feat = pickFeatured(live, upcoming, played, now);
  if(feat) v.appendChild(featuredHero(feat, now));

  // EN VIVO ahora
  if(live.length){
    v.appendChild(sect("En vivo", live.length + " en juego"));
    sortChrono(live).forEach(m => { if(m !== feat) v.appendChild(matchCard(m)); });
  }

  // partidos de hoy (por jugar)
  const todays = upcoming.filter(m => m.date === todayStr && m !== feat);
  if(todays.length){
    v.appendChild(sect("Hoy", todays.length + " en cartelera"));
    todays.forEach(m => v.appendChild(matchCard(m)));
  }

  // resultados recientes (más nuevos primero)
  if(played.length){
    v.appendChild(sect("Resultados recientes", null));
    played.slice(-6).reverse().forEach(m => { if(m !== feat) v.appendChild(matchCard(m)); });
  }

  // próximos
  const nexts = upcoming.filter(m => m.date !== todayStr && m !== feat).slice(0, 8);
  if(nexts.length){
    v.appendChild(sect("Próximos partidos", null));
    nexts.forEach(m => v.appendChild(matchCard(m)));
  }

  return { content: v, substrip: null };
}

function eloSum(m){ return S.model.get(m.team1Ref) + S.model.get(m.team2Ref); }

function pickFeatured(live, upcoming, played, now){
  if(live.length) return live.slice().sort((a, b) => eloSum(b) - eloSum(a))[0];
  const todayStr = isoToday();
  const todays = upcoming.filter(m => m.date === todayStr);
  if(todays.length) return todays.sort((a, b) => eloSum(b) - eloSum(a))[0];
  if(upcoming.length) return upcoming[0];
  if(played.length){
    const lastDate = played[played.length - 1].date;
    const lastDay = played.filter(m => m.date === lastDate);
    return lastDay.sort((a, b) => eloSum(b) - eloSum(a))[0];
  }
  return null;
}

function featuredHero(m, now){
  const real = isReal(m.team1Ref) && isReal(m.team2Ref);
  const st = statusOf(m, now);
  const hasScore = m.score != null;

  const h = el("div", { class: "hero", onclick: () => import("../sheets.js").then(s => s.openMatch(m)) });
  h.appendChild(el("div", { class: "pitch", html: pitchSVG() }));

  let eyebrow;
  if(st.kind === "live") eyebrow = "● En vivo ahora";
  else if(st.kind === "fin") eyebrow = "Resultado destacado";
  else if(m.date === isoToday()) eyebrow = "Hoy en cartelera";
  else eyebrow = "Próximo partido";
  h.appendChild(el("div", { class: "eyebrow", style: st.kind === "live" ? "color:var(--live)" : "" }, eyebrow));

  const grid = el("div", { class: "grid" });
  grid.appendChild(heroSide(m.team1Ref, hasScore ? m.score[0] : null));
  const mid = el("div", { class: "vs" });
  if(hasScore){
    mid.appendChild(el("span", { class: "kk" }, m.score[0] + " – " + m.score[1]));
    mid.appendChild(el("span", { class: "kksub" }, st.kind === "live" ? ("EN JUEGO " + st.minute + "'" + (st.real ? "" : " est.")) : (m.pens ? `pen ${m.pens[0]}-${m.pens[1]}` : "Final")));
  } else if(real){
    mid.appendChild(el("span", { class: "kk" }, localTime(m)));
    mid.appendChild(el("span", { class: "kksub" }, "tu hora"));
  } else {
    mid.appendChild(document.createTextNode("VS"));
  }
  grid.appendChild(mid);
  grid.appendChild(heroSide(m.team2Ref, hasScore ? m.score[1] : null));
  h.appendChild(grid);

  h.appendChild(el("div", { class: "meta" }, dateLabel(m.date) + " · " + matchTag(m) + (m.ground ? " · " + m.ground : "")));

  if(real){
    const base = Engine.predictMatch(m.team1Ref, m.team2Ref, S.model, { neutral: !!m.neutral });
    if(st.kind === "live" && st.real && hasScore){
      const ip = Engine.inPlayProbability(m.score[0], m.score[1], st.minute, base.lambda1, base.lambda2);
      h.appendChild(segBar(ip));
      h.appendChild(probLabels(m.team1Ref, m.team2Ref, ip, true));
    } else if(!m.played){
      h.appendChild(segBar(base));
      h.appendChild(probLabels(m.team1Ref, m.team2Ref, base, false));
    }
  }
  return h;
}

function heroSide(team, score){
  const s = el("div", { class: "side" });
  s.appendChild(flagEl(team));
  s.appendChild(el("div", { class: "nm" }, isReal(team) ? esName(team) : refLabel(team)));
  if(isReal(team) && score == null) s.appendChild(el("div", { class: "elo" }, "Elo " + Math.round(S.model.get(team))));
  return s;
}
