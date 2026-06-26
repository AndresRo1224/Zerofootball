/**
 * ui/sheets.js — Paneles deslizantes (modales) de la app.
 */
import { S, Engine, predictOptions, currentLeagueMeta } from "../state.js";
import { esName, conf } from "../data/teams.js";
import { statusOf, localTime, dateLabel, matchTag, sortChrono } from "./format.js";
import {
  el, flagEl, isReal, refLabel, sect, predictionResult, segBar, probLabels, matchCard, pct
} from "./components.js";
import { predictMatchApi } from "../data/providers/predict.js";

/** Mejora la predicción del partido con el modelo robusto (Python), si responde. */
async function upgradeMatchPrediction(panel, badge, m, t1, t2){
  try{
    const isWC = currentLeagueMeta().type === "worldcup";
    const results = S.T.matches.filter(x => x.played && x.score)
      .map(x => [x.team1Ref, x.team2Ref, x.score[0], x.score[1]]);
    const payload = { results, home: t1, away: t2, neutral: isWC ? true : !!m.neutral, knockout: m.stage === "ko" };
    if(isWC){
      const pr = {};
      for(const t of S.T.teams) pr[t] = (Engine.BASE_ELO[t] != null ? Engine.BASE_ELO[t] : 1500);
      payload.priors = pr; payload.priorWeight = 4.0;
    }
    const res = await predictMatchApi(payload);
    panel.innerHTML = "";
    panel.appendChild(predictionResult(res));
  }catch{
    if(badge) badge.textContent = "⚙ Modelo Elo · cálculo local (sin conexión al modelo robusto)";
  }
}

const refName = ref => isReal(ref) ? esName(ref) : refLabel(ref);
const closeIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export function openSheet(node){
  const inner = document.getElementById("sheetInner");
  inner.innerHTML = ""; inner.appendChild(node);
  document.getElementById("sheet").classList.add("show");
  document.getElementById("sheetBg").classList.add("show");
}
export function closeSheet(){
  document.getElementById("sheet").classList.remove("show");
  document.getElementById("sheetBg").classList.remove("show");
}
function closeBtn(){ return el("div", { class: "close", onclick: closeSheet, html: closeIcon }); }

/* ---------- detalle de partido ---------- */
export function openMatch(m){
  const t1 = m.team1Ref, t2 = m.team2Ref;
  const real = isReal(t1) && isReal(t2);
  const st = statusOf(m);
  const hasScore = m.score != null;
  const wrap = el("div");

  const head = el("div", { class: "sheet-head" });
  const tt = el("div", { style: "display:flex;align-items:center;gap:10px;flex:1;justify-content:center" });
  const c1 = el("div", { style: "text-align:center" }, [flagEl(t1, "flag"), el("div", { class: "nm", style: "font-size:13px;margin-top:5px" }, refName(t1))]);
  const mid = el("div", { style: "text-align:center;min-width:64px" });
  if(hasScore){
    let sub = st.kind === "live" ? `EN JUEGO ${st.minute}'` + (st.real ? "" : " (est.)") : (m.pens ? `pen ${m.pens[0]}-${m.pens[1]}` : "FINAL");
    mid.innerHTML = `<div style="font-family:var(--disp);font-weight:700;font-size:30px">${m.score[0]} – ${m.score[1]}</div><div style="font-size:10px;color:${st.kind === "live" ? "var(--live)" : "var(--faint)"}">${sub}</div>`;
  } else {
    mid.innerHTML = `<div style="font-family:var(--disp);font-weight:700;font-size:22px">${localTime(m)}</div><div style="font-size:10px;color:var(--faint)">${dateLabel(m.date)}</div>`;
  }
  const c2 = el("div", { style: "text-align:center" }, [flagEl(t2, "flag"), el("div", { class: "nm", style: "font-size:13px;margin-top:5px" }, refName(t2))]);
  tt.appendChild(c1); tt.appendChild(mid); tt.appendChild(c2);
  head.appendChild(tt); head.appendChild(closeBtn());
  wrap.appendChild(head);

  wrap.appendChild(el("div", { style: "font-size:12px;color:var(--muted);text-align:center;margin-bottom:14px" },
    matchTag(m) + " · " + m.ground));

  // probabilidad en vivo (si hay marcador real en juego)
  if(real && st.kind === "live" && st.real && hasScore){
    const base = Engine.predictMatch(t1, t2, S.model, predictOptions(m));
    const ip = Engine.inPlayProbability(m.score[0], m.score[1], st.minute, base.lambda1, base.lambda2);
    wrap.appendChild(el("div", { class: "secttitle", style: "margin-top:4px" }, "Probabilidad en vivo"));
    wrap.appendChild(segBar(ip));
    wrap.appendChild(probLabels(t1, t2, ip, true));
  }

  // goleadores
  if(hasScore && (m.goals1.length || m.goals2.length)){
    wrap.appendChild(el("div", { class: "secttitle", style: "margin-top:18px" }, "Goles"));
    const sc = el("div", { class: "scorers" });
    m.goals1.forEach(g => sc.appendChild(scorerRow(g, t1)));
    m.goals2.forEach(g => sc.appendChild(scorerRow(g, t2)));
    wrap.appendChild(sc);
  }

  // predicción del partido: Elo al instante, luego modelo robusto.
  // Se muestra también EN VIVO (junto a la probabilidad en juego de arriba),
  // solo se oculta cuando el partido ya terminó.
  if(real && !m.played){
    const live = st.kind === "live";
    wrap.appendChild(el("div", { class: "secttitle", style: "margin-top:18px" },
      live ? "Predicción (previa al partido)" : "Predicción"));
    const panel = el("div", { class: "panel", style: "margin-bottom:0" });
    const p = Engine.predictMatch(t1, t2, S.model, predictOptions(m, { knockout: m.stage === "ko" }));
    panel.appendChild(predictionResult(p));
    const badge = el("div", { class: "modelbadge" }, [el("span", { class: "spinner" }), "Calculando modelo robusto…"]);
    panel.appendChild(badge);
    wrap.appendChild(panel);
    upgradeMatchPrediction(panel, badge, m, t1, t2);
  }
  openSheet(wrap);
}
function scorerRow(g, team){
  return el("div", { class: "scorerrow" }, [
    el("div", { class: "min" }, (g.minute || "") + "'"),
    flagEl(team, "flag"),
    el("div", {}, g.name + (g.penalty ? " (pen)" : ""))
  ]);
}

/* ---------- ficha de equipo ---------- */
function standingRow(team){
  if(!S.T.standings) return null;
  for(const tbl of S.T.standings){ const r = tbl.find(x => x.team === team); if(r) return r; }
  return null;
}
export function openTeam(team){
  if(!isReal(team)) return;
  const lb = S.model.leaderboard(S.T.teamsSet);
  const rank = lb.findIndex(([t]) => t === team) + 1;
  const row = standingRow(team);                                   // liga
  const grp = !row ? Object.keys(S.T.groups || {}).find(g => (S.T.groups[g] || []).includes(team)) : null; // Mundial
  const sp = S.simProbs && S.simProbs[team];
  const champPct = sp ? (sp.title != null ? sp.title : sp.champion) : null;  // liga vs Mundial
  const wrap = el("div");

  const head = el("div", { class: "sheet-head" });
  head.appendChild(flagEl(team, "flag"));
  let metaTxt = S.T.name;
  if(row) metaTxt += " · " + row.pj + " jugados";
  else if(grp) metaTxt = (conf(team) ? conf(team) + " · " : "") + "Grupo " + grp;
  head.appendChild(el("div", { style: "flex:1" }, [
    el("div", { class: "nm" }, esName(team)),
    el("div", { class: "meta" }, metaTxt)
  ]));
  head.appendChild(closeBtn());
  wrap.appendChild(head);

  const ig = el("div", { class: "infogrid" });
  ig.appendChild(infoPill(String(Math.round(S.model.get(team))), "Elo actual"));
  ig.appendChild(infoPill("#" + rank, "Ranking Elo (" + S.T.teams.length + ")"));
  if(row) ig.appendChild(infoPill(row.pts + " pts", "Posición #" + row.rank));
  else if(champPct != null) ig.appendChild(infoPill(pct(champPct, 1), "Ser campeón"));
  else if(grp) ig.appendChild(infoPill(grp, "Grupo"));
  wrap.appendChild(ig);

  wrap.appendChild(el("div", { class: "secttitle", style: "margin-top:4px" }, "Sus partidos"));
  const mine = sortChrono(S.T.matches.filter(m => m.team1Ref === team || m.team2Ref === team));
  if(!mine.length) wrap.appendChild(el("div", { class: "explain" }, "Sin partidos registrados."));
  mine.forEach(m => wrap.appendChild(matchCard(m)));
  openSheet(wrap);
}
function infoPill(v, k){
  return el("div", { class: "ip" }, [el("div", { class: "v" }, v), el("div", { class: "k" }, k)]);
}

/* ---------- ranking Elo ---------- */
export function openElo(){
  const wrap = el("div");
  const head = el("div", { class: "sheet-head" });
  head.appendChild(el("div", { style: "flex:1" }, [
    el("div", { class: "nm" }, "Ranking Elo"),
    el("div", { class: "meta" }, S.T.name + " · refinado con resultados" )
  ]));
  head.appendChild(closeBtn());
  wrap.appendChild(head);

  S.model.leaderboard(S.T.teamsSet).forEach(([t, r], i) => {
    const row = el("div", { class: "oddrow", onclick: () => { closeSheet(); setTimeout(() => openTeam(t), 250); } });
    row.appendChild(el("div", { class: "rk" }, String(i + 1)));
    row.appendChild(flagEl(t));
    row.appendChild(el("div", { class: "nm" }, esName(t)));
    row.appendChild(el("div", { class: "pc", style: "color:var(--sky);width:54px;font-size:16px" }, String(Math.round(r))));
    wrap.appendChild(row);
  });
  openSheet(wrap);
}

/* ---------- vista previa de noticia ---------- */
export function openNews(item){
  const wrap = el("div");
  const head = el("div", { class: "sheet-head" });
  head.appendChild(el("div", { style: "flex:1" }, [
    el("div", { class: "nm" }, item.source || "Noticia"),
    el("div", { class: "meta" }, item.date ? new Date(item.date).toLocaleString() : "")
  ]));
  head.appendChild(closeBtn());
  wrap.appendChild(head);

  wrap.appendChild(el("div", { style: "font-family:var(--disp);font-weight:700;font-size:21px;line-height:1.25;margin-bottom:12px" }, item.title));
  if(item.summary) wrap.appendChild(el("div", { class: "explain", style: "margin-bottom:18px" }, item.summary));
  wrap.appendChild(el("a", {
    class: "btn", href: item.link, target: "_blank", rel: "noopener noreferrer",
    style: "display:block;text-align:center;text-decoration:none"
  }, "Leer la noticia completa →"));
  openSheet(wrap);
}

/* ---------- acerca de ---------- */
export function openAbout(){
  const wrap = el("div");
  const head = el("div", { class: "sheet-head" });
  head.appendChild(el("div", { style: "flex:1" }, [
    el("div", { class: "nm" }, "Acerca de"),
    el("div", { class: "meta" }, "ZeroFootball · En vivo y predicciones")
  ]));
  head.appendChild(closeBtn());
  wrap.appendChild(head);

  const body = el("div", { class: "explain" });
  body.innerHTML =
    "<p><b>ZeroFootball</b>: el Mundial 2026 (grupos, bracket, simulación de campeón) y las grandes ligas (resultados, clasificación, predicciones y pronóstico de temporada) en una sola app.</p>" +
    "<p style='margin-top:12px'><b>Datos:</b> <i>API-Football</i> a través de un <b>proxy seguro</b> (la clave vive en el servidor, nunca en el navegador). Con un partido en juego, las probabilidades se recalculan en vivo según marcador y minuto.</p>" +
    "<p style='margin-top:12px'><b>Modelo:</b> Elo (sembrado con la tabla y autoajustado con resultados) → goles esperados → Poisson/Dixon-Coles → Monte Carlo. Mira «¿Cómo funciona?» en Predicción.</p>" +
    "<p style='margin-top:12px;color:var(--faint)'>Proyecto de aficionado. Las probabilidades son estimaciones, no certezas.</p>";
  wrap.appendChild(body);
  openSheet(wrap);
}
