/* service-worker.js — PWA: precarga el shell y sirve offline.
   Los datos de /api/ NO se cachean de forma agresiva (network-first). */
const CACHE = "zerofootball-v9";

const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./src/styles/app.css",
  "./src/config.js", "./src/state.js", "./src/router.js", "./src/main.js",
  "./src/engine/elo.js", "./src/engine/poisson.js", "./src/engine/prediction.js",
  "./src/engine/tournament.js", "./src/engine/league.js", "./src/engine/index.js",
  "./src/data/teams.js", "./src/data/snapshot.js", "./src/data/wcSnapshot.js",
  "./src/data/providers/provider.js", "./src/data/providers/apiSports.js", "./src/data/providers/openfootball.js", "./src/data/providers/news.js", "./src/data/providers/predict.js",
  "./src/ui/format.js", "./src/ui/components.js", "./src/ui/sheets.js", "./src/ui/sim.js",
  "./src/ui/views/inicio.js", "./src/ui/views/hoy.js", "./src/ui/views/partidos.js", "./src/ui/views/tabla.js", "./src/ui/views/grupos.js",
  "./src/ui/views/prediccion.js", "./src/ui/views/pronostico.js", "./src/ui/views/bracket.js",
  "./public/icons/icon.svg", "./public/icons/icon-maskable.svg"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(u => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);

  // datos de la API: network-first (frescos), con respaldo a caché breve.
  if(url.origin === location.origin && url.pathname.startsWith("/api/")){
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if(res && res.ok){ const c = await caches.open(CACHE); c.put(req, res.clone()); }
        return res;
      } catch { return (await caches.match(req)) || Response.error(); }
    })());
    return;
  }

  // shell mismo origen: cache-first con actualización en segundo plano.
  if(url.origin === location.origin){
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const network = fetch(req).then(res => {
        if(res && res.ok){ caches.open(CACHE).then(c => c.put(req, res.clone())); }
        return res;
      }).catch(() => cached);
      return cached || network;
    })());
    return;
  }

  // otros orígenes (escudos, fuentes): red con respaldo a caché.
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
