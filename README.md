# Fútbol — En vivo y predicciones ⚽

App de **fútbol** para las grandes ligas (estilo OneFootball): resultados,
calendario, clasificación, un **predictor** de cualquier cruce y un **pronóstico
de temporada** (título · Champions · descenso) por Monte Carlo. Funciona como
**web**, como **PWA instalable** y como **app nativa** (Android/iOS con Capacitor).

Incluye **dos modos** (elegibles en el selector de competición):
- **Mundial 2026** — la app original: 12 grupos, cuadro de eliminatorias y simulación
  de campeón. Usa datos de **openfootball** (gratis, público); **no** consume tu API.
- **Grandes ligas** — Premier, LaLiga, Serie A, Bundesliga, Ligue 1, Champions, Europa
  League, Eredivisie, Primeira, Brasileirão, Libertadores. Usan **API-Football** vía un
  **proxy seguro**: la clave vive en el servidor (variable de entorno), **nunca** en el
  navegador ni en el repositorio.

Ampliar/quitar competiciones = editar `src/config.js` (cada una con su `type`:
`worldcup`, `league` o `cup`).

---

## 🔐 Seguridad de la clave (importante)

- La clave **no** está en el código cliente. El navegador llama a `/api/football`
  (nuestro proxy) y es el **servidor** quien añade la cabecera secreta y reenvía a
  API-Football. Ver [`api/football.js`](api/football.js).
- La clave se guarda en `.env` (local) y en las **Variables de Entorno de Vercel**
  (producción). El archivo `.env` está en `.gitignore`: **no se sube a Git**.
- El proxy tiene **allowlist** de endpoints y parámetros, y **caché** para no agotar
  la cuota (plan gratis = 100 peticiones/día).
- Cabeceras de seguridad (CSP, etc.) en [`vercel.json`](vercel.json) y como `<meta>`
  de respaldo en `index.html`.

### Configurar la clave
1. Copia `.env.example` a `.env` y pon tu clave:
   ```
   API_FOOTBALL_KEY=tu_clave_de_api-football
   ```
2. (Ya está hecho en este proyecto con tu clave en el `.env` local.)

---

## ▶️ Ejecutar en local

Necesitas Node. El servidor de desarrollo sirve los estáticos **y** reproduce el
proxy con tu `.env` (igual que en producción):

```bash
npm run dev        # -> http://localhost:5173
```

> No abras `index.html` con doble clic: los módulos ES y el proxy necesitan el servidor.

Regenerar la instantánea de respaldo (offline / primer pintado):
```bash
npm run snapshot   # descarga la liga por defecto y reescribe src/data/snapshot.js
```

---

## ☁️ Desplegar en Vercel

1. Sube el repo a GitHub (ver más abajo).
2. En [vercel.com](https://vercel.com) → **New Project** → importa el repo.
   Framework preset: **Other** (no hay build; son estáticos + función `api/`).
3. **Settings → Environment Variables**: añade
   `API_FOOTBALL_KEY = tu_clave`  (Production y Preview).
4. **Deploy**. La función `api/football.js` queda en `https://tu-app.vercel.app/api/football`.

> Cambiar de temporada: edita `SEASON` en `src/config.js`. El plan **gratis** de
> API-Football solo da acceso hasta la **temporada 2024** (2024/25); al subir de
> plan, pon el año en curso y se activan los datos y el modo **en vivo**.

---

## 📱 App móvil nativa (Capacitor)

La app nativa carga el sitio desplegado (para usar el proxy seguro). Tras desplegar
en Vercel:

1. Instala dependencias y la plataforma:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap add android
   ```
2. En `capacitor.config.json`, cambia `server.url` por **tu** dominio de Vercel
   (`https://tu-app.vercel.app`).
3. Sincroniza y abre Android Studio para generar el APK:
   ```bash
   npx cap sync
   npx cap open android      # Build → Build APK(s)
   ```
- **Android** se compila en Windows (requiere Android Studio).
- **iOS** requiere macOS + Xcode: `npm install @capacitor/ios && npx cap add ios`.

La app **también es PWA**: en el móvil, desde el navegador, usa “Añadir a pantalla
de inicio”.

---

## 🗂️ Estructura

```
├── api/football.js            # PROXY serverless (la clave vive aquí, server-side)
├── api/news.js                # PROXY de noticias (RSS -> JSON) para la pantalla Inicio
├── vercel.json                # cabeceras de seguridad + caché del proxy
├── capacitor.config.json      # config de la app nativa
├── .env.example               # plantilla (la real es .env, ignorada por git)
├── scripts/
│   ├── dev-proxy.mjs          # servidor local: estáticos + proxy (lee .env)
│   └── snapshot.mjs           # regenera la instantánea offline
├── www/index.html             # fallback offline para la app nativa
├── index.html                 # shell de la web (PWA)
├── manifest.webmanifest · service-worker.js
└── src/
    ├── config.js              # ligas, temporada, endpoint del proxy
    ├── state.js · router.js · main.js
    ├── engine/                # MOTOR (sin DOM, testeable)
    │   ├── elo.js             #   Elo (sembrado con la tabla + ventaja de local)
    │   ├── poisson.js         #   goles esperados + Dixon-Coles
    │   ├── prediction.js      #   1X2, avance KO, probabilidad EN VIVO
    │   ├── league.js          #   parseLeague + Monte Carlo de temporada
    │   └── tournament.js      #   utilidades (computeStandings, RNG)
    ├── data/
    │   ├── teams.js           #   selecciones (banderas/ES) + registro de clubes
    │   ├── snapshot.js        #   respaldo offline de liga (generado)
    │   ├── wcSnapshot.js      #   respaldo offline del Mundial (openfootball)
    │   └── providers/
    │       ├── apiSports.js   #   cliente + normalización de la API (ligas)
    │       ├── openfootball.js#   fuente del Mundial 2026
    │       └── provider.js    #   carga por tipo de competición (con fallback)
    └── ui/  (format · components · sheets · sim ·
             views/: inicio · hoy · partidos · tabla · grupos · prediccion · pronostico · bracket)
```

---

## 🧠 El modelo

1. **Elo** — cada equipo parte de una fuerza **sembrada con la tabla actual** y se
   **refina con los resultados** (golear y ganar a rivales fuertes sube más).
2. **Goles esperados** — la diferencia de Elo (+ ventaja de local) da λ₁, λ₂.
3. **Marcadores** — Poisson + corrección **Dixon-Coles** → matriz de cada marcador.
4. **En vivo** — `inPlayProbability` recalcula el 1X2 según marcador y minuto.
5. **Temporada** — Monte Carlo de los partidos que faltan → % de título, Champions
   y descenso.

Modelo **probabilístico**, no una certeza: el fútbol tiene mucha varianza.

Proyecto de aficionado. Datos: API-Football. Licencia del código: MIT.
