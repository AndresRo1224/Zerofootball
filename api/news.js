/**
 * api/news.js — Proxy de noticias de fútbol (RSS -> JSON) para la pantalla de
 * Inicio. Evita CORS y mantiene la CSP estricta (el cliente solo llama a 'self').
 * Fuentes en una allowlist; por defecto Mundo Deportivo (español).
 */
const SOURCES = {
  md:   { url: "https://www.mundodeportivo.com/feed/rss/futbol/", name: "Mundo Deportivo" },
  espn: { url: "https://www.espn.com/espn/rss/soccer/news",       name: "ESPN" }
};

function decode(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function parseRss(xml, sourceName) {
  const items = [];
  const re = /<item[\s\S]*?<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 24) {
    const block = m[0];
    const pick = tag => {
      const r = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">").exec(block);
      return r ? decode(r[1]) : "";
    };
    const title = pick("title");
    const link = pick("link") || pick("guid");
    if (!title || !link) continue;
    items.push({ title, link, summary: pick("description").slice(0, 180), date: pick("pubDate"), source: sourceName });
  }
  return items;
}

export default async function handler(req, res) {
  try {
    const key = (req.query && req.query.source) || "md";
    const src = SOURCES[key] || SOURCES.md;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000);
    let xml;
    try {
      const r = await fetch(src.url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml, application/xml, text/xml" },
        signal: ctrl.signal
      });
      xml = await r.text();
    } finally { clearTimeout(to); }

    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=1800");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).json({ source: src.name, items: parseRss(xml, src.name) });
  } catch (e) {
    const aborted = e && e.name === "AbortError";
    res.status(aborted ? 504 : 502).json({ error: "news", items: [] });
  }
}
