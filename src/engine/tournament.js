/**
 * engine/tournament.js — Lógica del torneo completo.
 *  - parseTournament: normaliza los datos crudos (formato openfootball)
 *  - computeStandings / rankBestThirds: tablas con desempates FIFA
 *  - simulateOnce / monteCarlo: simulación del resto del Mundial
 */
import { homeBonus } from "./elo.js";
import { eloToLambdas, scoreMatrix, argmaxScore } from "./poisson.js";
import { knockoutAdvance } from "./prediction.js";

// Números de partido por ronda (orden del calendario oficial de 104 partidos).
export const R32 = []; for(let n = 73; n <= 88; n++) R32.push(n);
export const R16 = []; for(let n = 89; n <= 96; n++) R16.push(n);
export const QF = [97, 98, 99, 100];
export const SF = [101, 102];
export const THIRD = 103;
export const FINAL = 104;

const THIRD_RE = /^3([A-L])(?:\/[A-L])+$/;   // ej. "3A/B/C/D/F"
const POS_RE = /^([12])([A-L])$/;            // ej. "1A", "2B"
const WL_RE = /^([WL])(\d+)$/;               // ej. "W73", "L101"

export const KO_ROUNDS = {
  "Round of 32":"16avos", "Round of 16":"Octavos", "Quarter-final":"Cuartos",
  "Semi-final":"Semifinal", "Match for third place":"Tercer puesto", "Final":"Final"
};

// ---- RNG con semilla (reproducible) ----
export function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function samplePoisson(lam, rnd){
  const L = Math.exp(-lam); let k = 0, p = 1;
  do { k++; p *= rnd(); } while(p > L);
  return k - 1;
}

// ---- Desempates ----
function negAlpha(s){ let v = 0; for(let i = 0; i < Math.min(s.length, 6); i++) v = v * 1000 - s.charCodeAt(i); return v; }

export function computeStandings(teams, results, rnd){
  const st = {};
  teams.forEach(t => st[t] = { team:t, pts:0, gf:0, ga:0, gd:0, w:0, d:0, l:0, pj:0 });
  for(const [a, b, ga, gb] of results){
    if(!(a in st) || !(b in st)) continue;
    const sa = st[a], sb = st[b];
    sa.gf += ga; sa.ga += gb; sa.pj++;
    sb.gf += gb; sb.ga += ga; sb.pj++;
    if(ga > gb){ sa.pts += 3; sa.w++; sb.l++; }
    else if(ga < gb){ sb.pts += 3; sb.w++; sa.l++; }
    else { sa.pts++; sb.pts++; sa.d++; sb.d++; }
  }
  teams.forEach(t => st[t].gd = st[t].gf - st[t].ga);

  const key = t => [st[t].pts, st[t].gd, st[t].gf];
  const cmp = (x, y) => { const kx = key(x), ky = key(y); for(let i = 0; i < 3; i++) if(kx[i] !== ky[i]) return ky[i] - kx[i]; return 0; };
  let ordered = teams.slice().sort(cmp);

  // desempatar bloques iguales en (pts, gd, gf) con head-to-head
  const final = []; let i = 0;
  while(i < ordered.length){
    let j = i;
    while(j + 1 < ordered.length && cmp(ordered[j + 1], ordered[i]) === 0) j++;
    let tie = ordered.slice(i, j + 1);
    if(tie.length > 1) tie = breakTiesH2H(tie, results, rnd);
    final.push(...tie); i = j + 1;
  }
  return final.map(t => st[t]);
}

function breakTiesH2H(tied, results, rnd){
  const tset = new Set(tied);
  const mini = {};
  tied.forEach(t => mini[t] = { pts:0, gf:0, ga:0 });
  for(const [a, b, ga, gb] of results){
    if(tset.has(a) && tset.has(b)){
      mini[a].gf += ga; mini[a].ga += gb; mini[b].gf += gb; mini[b].ga += ga;
      if(ga > gb) mini[a].pts += 3; else if(ga < gb) mini[b].pts += 3; else { mini[a].pts++; mini[b].pts++; }
    }
  }
  const mkey = t => [mini[t].pts, mini[t].gf - mini[t].ga, mini[t].gf];
  return tied.slice().sort((x, y) => {
    const kx = mkey(x), ky = mkey(y);
    for(let i = 0; i < 3; i++) if(kx[i] !== ky[i]) return ky[i] - kx[i];
    if(rnd) return rnd() - 0.5;
    return negAlpha(y) - negAlpha(x);
  });
}

export function rankBestThirds(thirds, rnd){
  return thirds.slice().sort((x, y) => {
    const kx = [x.pts, x.gd, x.gf], ky = [y.pts, y.gd, y.gf];
    for(let i = 0; i < 3; i++) if(kx[i] !== ky[i]) return ky[i] - kx[i];
    if(rnd) return rnd() - 0.5;
    return negAlpha(y.team) - negAlpha(x.team);
  });
}

// ---- Asignación de terceros a las llaves permitidas ----
export function findThirdSlots(byNum){
  const slots = [];
  for(const n of R32){
    const m = byNum[n];
    [[1, m.team1Ref], [2, m.team2Ref]].forEach(([side, ref]) => {
      if(THIRD_RE.test(ref)) slots.push([n, side, new Set(ref.slice(1).split("/"))]);
    });
  }
  return slots;
}
export function assignThirds(qualGroups, slots){
  const ids = slots.map(s => [s[0], s[1]]);
  const allowed = {}; slots.forEach(s => allowed[s[0] + "-" + s[1]] = s[2]);
  const qg = Array.from(qualGroups);
  const assign = {}; const used = new Set();
  (function bt(i){
    if(i === ids.length) return true;
    const sid = ids[i], key = sid[0] + "-" + sid[1];
    for(const g of qg){
      if(!used.has(g) && allowed[key].has(g)){
        assign[key] = g; used.add(g);
        if(bt(i + 1)) return true;
        used.delete(g); delete assign[key];
      }
    }
    return false;
  })(0);
  return Object.keys(assign).length === ids.length ? assign : null;
}

export function buildGroupState(groups, resultsByGroup, rnd){
  const standings = {}, winners = {}, runners = {}, thirdsByGroup = {}, thirdStats = [];
  for(const g of Object.keys(groups)){
    const table = computeStandings(groups[g], resultsByGroup[g] || [], rnd);
    standings[g] = table; winners[g] = table[0].team; runners[g] = table[1].team;
    thirdsByGroup[g] = table[2].team;
    const s3 = Object.assign({}, table[2]); s3.group = g; thirdStats.push(s3);
  }
  const ranked = rankBestThirds(thirdStats, rnd);
  const qualThirdGroups = new Set(ranked.slice(0, 8).map(s => s.group));
  return { standings, winners, runners, thirdsByGroup, rankedThirds: ranked, qualThirdGroups };
}

function isPlaceholder(ref){ return POS_RE.test(ref) || WL_RE.test(ref) || THIRD_RE.test(ref); }

/** Simula el torneo una vez. mode 'mc' (aleatorio) o 'likely' (camino más probable). */
export function simulateOnce(T, model, rnd, mode = "mc"){
  const resultsByGroup = {}; Object.keys(T.groups).forEach(g => resultsByGroup[g] = []);
  for(const g of Object.keys(T.groups)){
    for(const m of T.groupMatches[g]){
      let g1, g2;
      if(m.played && m.score){ g1 = m.score[0]; g2 = m.score[1]; }
      else {
        const [l1, l2] = eloToLambdas(model.get(m.team1Ref), model.get(m.team2Ref),
          homeBonus(m.team1Ref, m.ground) - homeBonus(m.team2Ref, m.ground));
        if(mode === "likely"){ const s = argmaxScore(l1, l2); g1 = s[0]; g2 = s[1]; }
        else { g1 = samplePoisson(l1, rnd); g2 = samplePoisson(l2, rnd); }
      }
      resultsByGroup[g].push([m.team1Ref, m.team2Ref, g1, g2]);
    }
  }
  const gs = buildGroupState(T.groups, resultsByGroup, mode === "mc" ? rnd : null);
  const slots = findThirdSlots(T.byNum);
  const slotGroup = assignThirds(gs.qualThirdGroups, slots) || {};
  const thirdForSlot = (n, side) => { const g = slotGroup[n + "-" + side]; return g ? gs.thirdsByGroup[g] : null; };

  const mw = {}, ml = {};
  const resolve = (ref) => {
    let m = POS_RE.exec(ref);
    if(m) return m[1] === "1" ? gs.winners[m[2]] : gs.runners[m[2]];
    m = WL_RE.exec(ref);
    if(m){ const n = +m[2]; return m[1] === "W" ? mw[n] : ml[n]; }
    if(THIRD_RE.test(ref)) return null;
    return ref;
  };

  const order = R32.concat(R16, QF, SF, [THIRD, FINAL]);
  for(const num of order){
    const m = T.byNum[num];
    let t1 = resolve(m.team1Ref); if(t1 == null && THIRD_RE.test(m.team1Ref)) t1 = thirdForSlot(num, 1);
    let t2 = resolve(m.team2Ref); if(t2 == null && THIRD_RE.test(m.team2Ref)) t2 = thirdForSlot(num, 2);

    if(m.played && m.score && m.team1Ref && !isPlaceholder(m.team1Ref)){
      const rt1 = m.team1Ref, rt2 = m.team2Ref;
      let winner;
      if(m.pens) winner = m.pens[0] > m.pens[1] ? rt1 : rt2;
      else winner = m.score[0] > m.score[1] ? rt1 : rt2;
      mw[num] = winner; ml[num] = winner === rt1 ? rt2 : rt1; continue;
    }
    if(t1 == null || t2 == null) continue;
    const [a1] = knockoutAdvance(t1, t2, model, m.ground);
    let winner = mode === "likely" ? (a1 >= 0.5 ? t1 : t2) : (rnd() < a1 ? t1 : t2);
    mw[num] = winner; ml[num] = winner === t1 ? t2 : t1;
  }

  const qualifiers = new Set();
  Object.keys(T.groups).forEach(g => { qualifiers.add(gs.winners[g]); qualifiers.add(gs.runners[g]); });
  gs.qualThirdGroups.forEach(g => qualifiers.add(gs.thirdsByGroup[g]));
  const reached = {
    R32: qualifiers,
    R16: new Set(R32.filter(n => mw[n]).map(n => mw[n])),
    QF:  new Set(R16.filter(n => mw[n]).map(n => mw[n])),
    SF:  new Set(QF.filter(n => mw[n]).map(n => mw[n])),
    Final: new Set(SF.filter(n => mw[n]).map(n => mw[n]))
  };
  return {
    champion: mw[FINAL], finalists: reached.Final, reached, gs,
    winners: gs.winners, runners: gs.runners,
    qualThirdGroups: gs.qualThirdGroups, slotGroup, matchWinner: mw, matchLoser: ml
  };
}

/** Corre N simulaciones y agrega probabilidades por selección. */
export function monteCarlo(T, model, n, seed, onProgress){
  const rnd = mulberry32((seed == null ? Date.now() : seed) >>> 0);
  const teams = T.teams;
  const c = {}; teams.forEach(t => c[t] = { champion:0, final:0, sf:0, qf:0, r16:0, qual:0, first:0, second:0 });
  for(let i = 0; i < n; i++){
    const r = simulateOnce(T, model, rnd, "mc");
    if(r.champion in c) c[r.champion].champion++;
    r.finalists.forEach(t => { if(t in c) c[t].final++; });
    r.reached.SF.forEach(t => { if(t in c) c[t].sf++; });
    r.reached.QF.forEach(t => { if(t in c) c[t].qf++; });
    r.reached.R16.forEach(t => { if(t in c) c[t].r16++; });
    r.reached.R32.forEach(t => { if(t in c) c[t].qual++; });
    Object.values(r.winners).forEach(w => { if(w in c) c[w].first++; });
    Object.values(r.runners).forEach(w => { if(w in c) c[w].second++; });
    if(onProgress && (i + 1) % Math.max(1, Math.floor(n / 20)) === 0) onProgress(i + 1, n);
  }
  const probs = {}; teams.forEach(t => { const o = {}; for(const k in c[t]) o[k] = c[t][k] / n; probs[t] = o; });
  return probs;
}

/** Construye una fecha-hora absoluta del inicio a partir de date + time ("13:00 UTC-6"). */
export function kickoffOf(date, time){
  if(!date) return null;
  let hh = 12, mm = 0, off = 0;
  const tm = /^(\d{1,2}):(\d{2})(?:\s*UTC([+-]\d{1,2}))?/.exec(time || "");
  if(tm){ hh = +tm[1]; mm = +tm[2]; if(tm[3] != null) off = +tm[3]; }
  const [Y, Mo, D] = date.split("-").map(Number);
  return new Date(Date.UTC(Y, Mo - 1, D, hh - off, mm));
}

/**
 * Normaliza los datos crudos (formato openfootball) a la estructura interna.
 * Soporta campos opcionales de proveedores en vivo: m.minute, m.status/m.live.
 */
export function parseTournament(raw){
  const matches = raw.matches.map((m, idx) => {
    const round = m.round || "";
    const isKo = Object.keys(KO_ROUNDS).some(k => round.indexOf(k) === 0);
    let group = null;
    if(!isKo){
      if(m.group && m.group.indexOf("Group ") === 0) group = m.group.replace("Group ", "").trim();
      else if(round.indexOf("Group ") >= 0) group = round.split("Group ").pop().trim()[0];
    }
    const sc = m.score || {};
    const played = !!(sc.ft);
    const live = m.live === true || m.status === "live" || m.status === "in_play";
    return {
      num: idx + 1, round, stage: isKo ? "ko" : "group", group,
      date: m.date || "", time: m.time || "", ground: m.ground || "",
      kickoff: kickoffOf(m.date, m.time),
      team1Ref: m.team1 || "", team2Ref: m.team2 || "",
      score: played ? sc.ft.slice() : (live && m.live_score ? m.live_score.slice() : null),
      pens: sc.p ? sc.p.slice() : null,
      ht: sc.ht ? sc.ht.slice() : null,
      goals1: m.goals1 || [], goals2: m.goals2 || [],
      played, live, minute: (m.minute != null ? m.minute : null)
    };
  });

  const byNum = {}; matches.forEach(m => byNum[m.num] = m);
  const groupsSet = {}, groupMatches = {};
  matches.forEach(m => {
    if(m.stage === "group" && m.group){
      (groupsSet[m.group] = groupsSet[m.group] || new Set()).add(m.team1Ref);
      groupsSet[m.group].add(m.team2Ref);
      (groupMatches[m.group] = groupMatches[m.group] || []).push(m);
    }
  });
  const groups = {}; Object.keys(groupsSet).sort().forEach(g => groups[g] = Array.from(groupsSet[g]).sort());
  const teams = Array.from(new Set(Object.values(groups).flat())).sort();

  return { name: raw.name, matches, byNum, groups, groupMatches, teams, teamsSet: new Set(teams) };
}
