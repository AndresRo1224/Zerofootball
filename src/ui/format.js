/**
 * ui/format.js — Fechas, horas y estado de los partidos.
 * El estado distingue marcador EN VIVO real (del proveedor) de uno ESTIMADO
 * por el horario cuando la fuente gratuita aún no publica el resultado.
 */
const DAYS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const MON  = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

/** Orden cronológico real por fecha-hora de inicio (con desempate por nº). */
export function byKickoff(a, b){
  const ka = a.kickoff ? a.kickoff.getTime() : 0;
  const kb = b.kickoff ? b.kickoff.getTime() : 0;
  if(ka !== kb) return ka - kb;
  return a.num - b.num;
}
export function sortChrono(matches){ return matches.slice().sort(byKickoff); }

export function isoToday(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** Hora de inicio en la zona horaria local del usuario. */
export function localTime(m){
  if(!m.kickoff) return m.time || "";
  return m.kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Etiqueta de fecha relativa: "Hoy · Jue 18 jun", "Mañana · …", etc. */
export function dateLabel(dstr){
  if(!dstr) return "";
  const [Y, M, D] = dstr.split("-").map(Number);
  const d = new Date(Y, M - 1, D);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  let pre = "";
  if(diff === 0) pre = "Hoy · "; else if(diff === 1) pre = "Mañana · "; else if(diff === -1) pre = "Ayer · ";
  return pre + DAYS[d.getDay()] + " " + D + " " + MON[M - 1];
}

// Fases de copa (API en inglés) -> español.
const KO_MAP = {
  "Round of 16": "Octavos", "Round of 32": "16avos", "Quarter-finals": "Cuartos",
  "Semi-finals": "Semifinal", "Final": "Final", "3rd Place Final": "3.º puesto",
  "Knockout Round Play-offs": "Playoffs", "Preliminary Round": "Previa",
  "Play-offs": "Playoffs", "League Stage": "Liguilla"
};

/** Etiqueta legible de la ronda: "Jornada 5", "Grupo A · J2", "Octavos"… */
export function roundLabel(round){
  if(!round) return "";
  let m = /Regular Season - (\d+)/i.exec(round); if(m) return "Jornada " + m[1];
  m = /Group ([A-Z]) - (\d+)/i.exec(round); if(m) return "Grupo " + m[1] + " · J" + m[2];
  for(const k in KO_MAP) if(round.indexOf(k) === 0) return KO_MAP[k];
  return round;
}

export function matchTag(m){
  if(m.stage === "group" && m.group) return roundLabel(m.round) || ("Grupo " + m.group);
  return roundLabel(m.round) || m.round || "";
}

/**
 * Estado de un partido en el momento `now`.
 *  kind: "fin" | "live" | "next"
 *  live: { real:boolean, minute:number }  (real=false => estimado por horario)
 */
export function statusOf(m, now = new Date()){
  if(m.played) return { kind: "fin" };
  // marcador en vivo real entregado por el proveedor
  if(m.live){
    return { kind: "live", real: true, minute: (m.minute != null ? m.minute : estMinute(m, now)) };
  }
  if(!m.kickoff) return { kind: "next" };
  const diff = (now - m.kickoff) / 60000; // minutos desde el inicio
  if(diff >= 0 && diff < 125) return { kind: "live", real: false, minute: estMinute(m, now) };
  if(diff >= 125) return { kind: "fin" };  // pasó la ventana sin marcador publicado
  return { kind: "next" };
}
function estMinute(m, now){
  if(!m.kickoff) return 1;
  const diff = Math.floor((now - m.kickoff) / 60000);
  // descuento aproximado: tras ~45 hay pausa; tope visual 90'
  return Math.max(1, Math.min(90, diff));
}
