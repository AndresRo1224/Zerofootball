/**
 * data/providers/news.js — Noticias de fútbol vía nuestro proxy (/api/news).
 * Mismo origen: no rompe la CSP ni expone nada.
 */
export async function fetchNews(timeoutMs = 9000){
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const r = await fetch("/api/news", { signal: ctrl.signal, headers: { Accept: "application/json" } });
    const j = await r.json().catch(() => ({}));
    return Array.isArray(j.items) ? j.items : [];
  }catch{
    return [];
  }finally{
    clearTimeout(to);
  }
}
