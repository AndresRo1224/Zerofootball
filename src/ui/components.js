/**
 * ui/components.js — Piezas visuales reutilizables.
 */
import { S, Engine, predictOptions } from "../state.js";
import { esName, code, logoUrl, teamColor, nationalFlag } from "../data/teams.js";
import { statusOf, localTime, matchTag } from "./format.js";
import { openMatch, openTeam } from "./sheets.js";

/* ---------- creación de elementos ---------- */
export function el(tag, attrs, children){
  const e = document.createElement(tag);
  if(attrs) for(const k in attrs){
    if(k === "class") e.className = attrs[k];
    else if(k === "html") e.innerHTML = attrs[k];
    else if(k.startsWith("on") && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
    else if(attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  if(children != null) (Array.isArray(children) ? children : [children]).forEach(c => {
    if(c == null) return;
    if(typeof c === "string" || typeof c === "number") e.appendChild(document.createTextNode(String(c)));
    else if(c.nodeType) e.appendChild(c);
  });
  return e;
}
export const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";
export const isReal = ref => !!(S.T && S.T.teamsSet.has(ref));

/* ---------- escudos de equipo (logo de API; fallback a monograma) ---------- */
export function flagEl(team, cls = "flag"){
  const url = logoUrl(team) || nationalFlag(team);
  if(url){
    const img = el("img", { class: cls, src: url, alt: esName(team), loading: "lazy" });
    img.onerror = () => { img.replaceWith(monogramEl(team, cls)); };
    return img;
  }
  return monogramEl(team, cls);
}
export function monogramEl(team, cls = "flag"){
  return el("div", { class: cls + " mono", style: `background:${teamColor(team)}` }, code(team));
}

/* ---------- etiquetas de placeholders de cruces ---------- */
export function refLabel(ref){
  let m = /^([12])([A-L])$/.exec(ref); if(m) return (m[1] === "1" ? "1º" : "2º") + " Grupo " + m[2];
  m = /^3([A-L])(?:\/[A-L])+$/.exec(ref); if(m) return "3º (" + ref.slice(1) + ")";
  m = /^W(\d+)$/.exec(ref); if(m) return "Ganador " + m[1];
  m = /^L(\d+)$/.exec(ref); if(m) return "Perdedor " + m[1];
  return esName(ref);
}
const refName = ref => isReal(ref) ? esName(ref) : refLabel(ref);

/* ---------- secciones / utilidades ---------- */
export function sect(title, tag){
  const s = el("div", { class: "secttitle" }, title);
  s.appendChild(el("div", { class: "sectline" }));
  if(tag) s.appendChild(el("div", { class: "tag" }, tag));
  return s;
}
export function emptyState(big, title, desc){
  return el("div", { class: "empty" }, [
    el("div", { class: "big" }, big),
    el("div", { style: "font-weight:600;color:var(--muted);margin-bottom:6px" }, title),
    el("div", {}, desc)
  ]);
}
export function stripEl(chips, current, onPick){
  const s = el("div", { class: "strip" });
  chips.forEach(([val, label]) => s.appendChild(
    el("button", { class: "chip" + (val === current ? " on" : ""), onclick: () => onPick(val) }, label)
  ));
  return s;
}
export function pillEl(v, k){
  return el("div", { class: "pill" }, [el("div", { class: "v" }, v), el("div", { class: "k" }, k)]);
}

/* ---------- barras de probabilidad ---------- */
export function segBar(p){
  const bar = el("div", { class: "probbar" });
  bar.appendChild(el("div", { class: "s1", style: `flex:${p.pWin1}` }, pct(p.pWin1, 0)));
  bar.appendChild(el("div", { class: "sx", style: `flex:${p.pDraw}` }, p.pDraw > 0.1 ? pct(p.pDraw, 0) : ""));
  bar.appendChild(el("div", { class: "s2", style: `flex:${p.pWin2}` }, pct(p.pWin2, 0)));
  return bar;
}
export function probLabels(t1, t2, p, live){
  const lab = el("div", { class: "problabels" });
  const tag = live ? "en vivo" : "";
  lab.appendChild(el("div", { html: `<b>${pct(p.pWin1, 0)}</b> ${code(t1)}` }));
  lab.appendChild(el("div", { html: `<b>${pct(p.pDraw, 0)}</b> X ${tag}` }));
  lab.appendChild(el("div", { html: `<b>${pct(p.pWin2, 0)}</b> ${code(t2)}` }));
  return lab;
}
export function miniProb(t1, t2, p, live){
  const wrap = el("div", { style: "margin-top:10px" });
  const bar = el("div", { class: "probbar", style: "height:22px;font-size:11px" });
  const s1 = Math.round(p.pWin1 * 100), sx = Math.round(p.pDraw * 100), s2 = 100 - s1 - sx;
  bar.appendChild(el("div", { class: "s1", style: `flex:${p.pWin1}` }, s1 > 10 ? s1 + "%" : ""));
  bar.appendChild(el("div", { class: "sx", style: `flex:${p.pDraw}` }, sx > 12 ? sx + "%" : ""));
  bar.appendChild(el("div", { class: "s2", style: `flex:${p.pWin2}` }, s2 > 10 ? s2 + "%" : ""));
  wrap.appendChild(bar);
  wrap.appendChild(probLabels(t1, t2, p, live));
  return wrap;
}

export function pitchSVG(){
  return `<svg viewBox="0 0 400 120" preserveAspectRatio="none" width="100%" height="100%">
    <g stroke="rgba(120,170,200,.18)" fill="none" stroke-width="1">
    <line x1="200" y1="0" x2="200" y2="120"/><circle cx="200" cy="60" r="26"/>
    <rect x="0" y="30" width="46" height="60"/><rect x="354" y="30" width="46" height="60"/>
    <rect x="0" y="46" width="20" height="28"/><rect x="380" y="46" width="20" height="28"/></g></svg>`;
}

/* ---------- tarjeta de partido ---------- */
export function matchCard(m){
  const st = statusOf(m);
  const t1 = m.team1Ref, t2 = m.team2Ref;
  const real = isReal(t1) && isReal(t2);
  const hasScore = m.score != null;                 // final o en vivo real
  const isLiveEst = st.kind === "live" && !st.real;  // en juego por horario, sin marcador
  const isLive = st.kind === "live";
  const fin = st.kind === "fin";

  const card = el("div", { class: "mcard" + (isLive ? " islive" : ""), onclick: () => openMatch(m) });

  // cabecera
  const top = el("div", { class: "top" });
  top.appendChild(el("div", { class: "mtag" }, matchTag(m)));
  let status;
  if(isLive){
    const kids = [el("span", { class: "dotpulse" }), "EN JUEGO " + st.minute + "'"];
    if(!st.real) kids.push(el("span", { class: "estim" }, "estimado"));
    status = el("div", { class: "status live" }, kids);
  } else if(fin){
    status = el("div", { class: "status fin" }, m.pens ? "FIN (pen)" : "FINAL");
  } else {
    status = el("div", { class: "status next" }, localTime(m));
  }
  top.appendChild(status);
  card.appendChild(top);

  // fila equipos + marcador/hora
  const row = el("div", { class: "row" });
  const teams = el("div", { class: "mteams" });
  const w1 = fin && hasScore && m.score[0] > m.score[1];
  const w2 = fin && hasScore && m.score[1] > m.score[0];
  teams.appendChild(teamRow(t1, hasScore ? m.score[0] : null, w1, fin && w2));
  teams.appendChild(teamRow(t2, hasScore ? m.score[1] : null, w2, fin && w1));
  row.appendChild(teams);

  if(!hasScore){
    const kb = el("div", { class: "kickbox" });
    if(isLiveEst){ kb.appendChild(el("div", { class: "kick" }, st.minute + "'")); kb.appendChild(el("div", { class: "kicksub" }, "en vivo")); }
    else { kb.appendChild(el("div", { class: "kick" }, "vs")); }
    row.appendChild(kb);
  } else if(m.pens){
    row.appendChild(el("div", { class: "pens" }, "pen " + m.pens[0] + "-" + m.pens[1]));
  }
  card.appendChild(row);

  // probabilidad
  if(real){
    const base = Engine.predictMatch(t1, t2, S.model, predictOptions(m));
    if(isLive && st.real && hasScore){
      const ip = Engine.inPlayProbability(m.score[0], m.score[1], st.minute, base.lambda1, base.lambda2);
      card.appendChild(miniProb(t1, t2, ip, true));
    } else if(!fin){
      card.appendChild(miniProb(t1, t2, base, false));
    }
  }
  if(isLiveEst) card.appendChild(el("div", { class: "kicksub", style: "margin-top:8px" }, "Marcador en vivo no disponible en la fuente gratuita"));
  if(isLive) card.appendChild(el("div", { class: "liveline" }));
  return card;
}

function teamRow(team, score, isWinner, lose){
  const t = el("div", { class: "team" + (lose ? " lose" : "") });
  t.appendChild(flagEl(team));
  t.appendChild(el("div", { class: "nm" }, refName(team)));
  if(score != null) t.appendChild(el("div", { class: "sc" + (isWinner ? " win" : "") }, String(score)));
  return t;
}

/* ---------- heatmap de marcadores ---------- */
export function scoreHeatmap(p){
  const m = p.matrix || Engine.scoreMatrix(p.lambda1, p.lambda2);
  const N = 6; let max = 0, best = [0, 0];
  for(let i = 0; i < N; i++) for(let j = 0; j < N; j++) if(m[i][j] > max){ max = m[i][j]; best = [i, j]; }
  const wrap = el("div", { class: "heat-wrap" });
  const tt = el("div", { class: "heat-title" });
  tt.appendChild(el("span", {}, "Probabilidad por marcador"));
  tt.appendChild(el("span", { style: "color:var(--gold)" }, "★ " + best[0] + "–" + best[1]));
  wrap.appendChild(tt);
  const grid = el("div", { class: "heat" });
  grid.appendChild(el("div", {}));
  for(let j = 0; j < N; j++) grid.appendChild(el("div", { class: "hx" }, String(j)));
  for(let i = 0; i < N; i++){
    grid.appendChild(el("div", { class: "hy" }, String(i)));
    for(let j = 0; j < N; j++){
      const v = m[i][j], a = Math.min(1, v / max);
      grid.appendChild(el("div", {
        class: "cell" + (i === best[0] && j === best[1] ? " best" : ""),
        style: `background:rgba(47,210,122,${0.06 + a * 0.85})`
      }, v > 0.03 ? Math.round(v * 100) : ""));
    }
  }
  wrap.appendChild(grid);
  wrap.appendChild(el("div", { style: "font-size:9.5px;color:var(--faint);margin-top:7px;text-align:center" },
    "Filas = goles " + code(p.team1) + " · Columnas = goles " + code(p.team2)));
  return wrap;
}

/* ---------- insignia de modelo ---------- */
export function modelChip(p){
  const dc = p.model === "dixon-coles";
  return el("div", { class: "mchip " + (dc ? "dc" : "elo") }, [
    el("span", { class: "ic" }, dc ? "✦" : "•"),
    el("span", {}, dc ? "Modelo Dixon-Coles · robusto" : "Modelo Elo · rápido"),
    el("span", { class: "tag" }, dc ? "MLE ataque/defensa + priors" : "respaldo local")
  ]);
}

/* ---------- fuerza ataque/defensa (índice 100 = media) ---------- */
function strengthBlock(p){
  const s = p.strength;
  const wrap = el("div", { class: "strengthb" });
  wrap.appendChild(strengthSide(p.team1, s.att1, s.def1));
  wrap.appendChild(strengthSide(p.team2, s.att2, s.def2));
  return wrap;
}
function strengthSide(team, att, def){
  const side = el("div", { class: "ss" });
  side.appendChild(el("div", { class: "nm" }, code(team)));
  side.appendChild(idxBar("ATA", att, "var(--grass)"));
  side.appendChild(idxBar("DEF", def, "var(--sky)"));
  return side;
}
function idxBar(label, val, color){
  const row = el("div", { class: "idxrow" });
  row.appendChild(el("span", { class: "k" }, label));
  const track = el("div", { class: "track" });
  track.appendChild(el("div", { class: "fillb", style: `width:${Math.max(6, Math.min(100, val / 2))}%;background:${color}` }));
  row.appendChild(track);
  row.appendChild(el("span", { class: "v", style: val >= 100 ? "color:var(--ink)" : "color:var(--faint)" }, String(val)));
  return row;
}

/* ---------- más mercados (solo modelo completo) ---------- */
function marketsBlock(p){
  const mk = p.markets;
  const grid = el("div", { class: "markets" });
  const add = (label, v) => grid.appendChild(el("div", { class: "mkt" }, [
    el("div", { class: "v" }, pct(v, 0)), el("div", { class: "k" }, label)
  ]));
  add("+1.5 goles", mk.over15);
  add("+3.5 goles", mk.over35);
  add("Doble 1X", mk.dc1x);
  add("Doble X2", mk.dcx2);
  add("Imbatido " + code(p.team1), mk.cs1);
  add("Imbatido " + code(p.team2), mk.cs2);
  return grid;
}

/* ---------- resultado completo del predictor ---------- */
export function predictionResult(p){
  const r = el("div", { class: "result" });
  if(p.model) r.appendChild(modelChip(p));
  const head = el("div", { class: "res-head" });
  const t1 = el("div", { class: "t" }, [flagEl(p.team1), el("div", { class: "nm" }, esName(p.team1))]);
  const eg = el("div", { class: "eg" });
  eg.innerHTML = `${p.expected1.toFixed(2)} <span style="color:var(--faint)">–</span> ${p.expected2.toFixed(2)}<small>goles esperados</small>`;
  const t2 = el("div", { class: "t" }, [flagEl(p.team2), el("div", { class: "nm" }, esName(p.team2))]);
  head.appendChild(t1); head.appendChild(eg); head.appendChild(t2);
  r.appendChild(head);

  r.appendChild(segBar(p));
  const lab = el("div", { class: "problabels" });
  lab.appendChild(el("div", { html: `gana ${code(p.team1)} · <b>${pct(p.pWin1)}</b>` }));
  lab.appendChild(el("div", { html: `X · <b>${pct(p.pDraw)}</b>` }));
  lab.appendChild(el("div", { html: `gana ${code(p.team2)} · <b>${pct(p.pWin2)}</b>` }));
  r.appendChild(lab);

  const pills = el("div", { class: "pills" });
  pills.appendChild(pillEl(pct(p.bothScore, 0), "Ambos marcan"));
  pills.appendChild(pillEl(pct(p.over25, 0), "+2.5 goles"));
  pills.appendChild(pillEl(code(p.pWin1 > p.pWin2 ? p.team1 : p.team2), "Favorito"));
  r.appendChild(pills);

  if(p.strength) r.appendChild(strengthBlock(p));

  r.appendChild(scoreHeatmap(p));
  if(p.markets) r.appendChild(marketsBlock(p));

  const sl = el("div", { class: "scorelist" });
  const max = p.topScores[0][1];
  p.topScores.slice(0, 5).forEach(([sc, prob]) => {
    const it = el("div", { class: "scoreitem" });
    it.appendChild(el("div", { class: "sc" }, sc[0] + "–" + sc[1]));
    const track = el("div", { class: "track" });
    track.appendChild(el("div", { class: "fillb", style: `width:${prob / max * 100}%` }));
    it.appendChild(track);
    it.appendChild(el("div", { class: "pc" }, pct(prob, 1)));
    sl.appendChild(it);
  });
  r.appendChild(sl);

  if(p.pAdvance1 != null){
    const adv = el("div", { class: "advance" });
    adv.appendChild(el("div", { class: "h" }, "Quién avanza (incluye prórroga y penales)"));
    [[p.team1, p.pAdvance1, "var(--grass)"], [p.team2, p.pAdvance2, "var(--live)"]].forEach(([tm, pr, col]) => {
      const rowx = el("div", { class: "advrow" });
      rowx.appendChild(el("div", { class: "nm" }, esName(tm)));
      const track = el("div", { class: "track" });
      track.appendChild(el("div", { class: "fillb", style: `width:${pr * 100}%;background:${col}` }));
      rowx.appendChild(track);
      rowx.appendChild(el("div", { class: "pc", style: `color:${col}` }, pct(pr, 0)));
      adv.appendChild(rowx);
    });
    r.appendChild(adv);
  }
  return r;
}

/* ---------- toasts ---------- */
let toastTimer = null;
export function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
}
export function hideToast(){ document.getElementById("toast").classList.remove("show"); }
export function flashToast(msg, ms = 1800){ toast(msg); clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, ms); }

export { openMatch, openTeam };
