"""
api/predict.py - Predictor ROBUSTO (modelo Dixon-Coles) como función serverless.

Ajusta por MÁXIMA VEROSIMILITUD las fuerzas de ataque y defensa de cada equipo
+ ventaja de local (regresión de Poisson ponderada por recencia), estima la
corrección de marcadores bajos (rho) y predice:
  - mode "match":  1X2, goles esperados, marcadores, ambos marcan, +2.5, y
                   probabilidad de avanzar (prórroga + penales) en eliminatoria.
  - mode "season": Monte Carlo (vectorizado en numpy) de los partidos restantes
                   -> probabilidad de título, Champions y descenso.

El cliente envía los resultados ya jugados (no gasta cuota de API). Si esta
función no está disponible (p. ej. en local sin Python), el cliente usa el motor
JS como respaldo, así que la app nunca se queda sin predicción.
"""
import json
import math
import sys
from http.server import BaseHTTPRequestHandler

import numpy as np

MAXG = 10
_FACT = np.array([math.factorial(i) for i in range(MAXG + 1)], dtype=float)


# ---------------------------------------------------------------- utilidades
def _teams_from(results, fixtures):
    s = set()
    for r in results:
        if len(r) >= 2:
            s.add(r[0]); s.add(r[1])
    for f in (fixtures or []):
        if len(f) >= 2:
            s.add(f[0]); s.add(f[1])
    return sorted(s)


def _pois_vec(lam):
    k = np.arange(MAXG + 1)
    lam = max(1e-6, float(lam))
    return np.exp(-lam) * lam ** k / _FACT


def _tau(i, j, l1, l2, rho):
    if i == 0 and j == 0:
        return 1.0 - l1 * l2 * rho
    if i == 0 and j == 1:
        return 1.0 + l1 * rho
    if i == 1 and j == 0:
        return 1.0 + l2 * rho
    if i == 1 and j == 1:
        return 1.0 - rho
    return 1.0


# ---------------------------------------------------------------- ajuste MLE
def fit(results, teams, priors=None, prior_weight=0.0):
    """
    Regresión de Poisson ponderada (Dixon-Coles) por IRLS.
    Si se dan `priors` (Elo por equipo) y prior_weight>0, se regulariza (ridge)
    el ataque/defensa de cada equipo hacia su fuerza previa. Esto hace ROBUSTO
    el caso del Mundial (pocos partidos por selección): el prior domina al inicio
    y los resultados lo van moviendo.
    """
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    clean = [r for r in results if len(r) >= 4 and r[0] in idx and r[1] in idx]
    N = len(clean)
    if n < 2:
        return None
    halflife = max(20.0, N / 2.0) if N else 20.0
    decay = math.log(2) / halflife

    use_prior = bool(priors) and prior_weight and prior_weight > 0
    if use_prior:
        p = 2 + 2 * n                 # intercepto, local, att_0..n-1, def_0..n-1 (sin equipo de ref.)
        att_off, def_off = 2, 2 + n
    else:
        p = 2 + 2 * (n - 1)           # equipo 0 = referencia (att=def=0)
        att_off, def_off = 2, 2 + (n - 1)

    rows = []
    for k, (h, a, hg, ag) in enumerate(((r[0], r[1], r[2], r[3]) for r in clean)):
        w = math.exp(-decay * (N - 1 - k))
        rows.append((float(hg), 1, idx[h], idx[a], w))
        rows.append((float(ag), 0, idx[a], idx[h], w))
    m = len(rows)

    X = np.zeros((m, p)); y = np.zeros(m); W = np.zeros(m)
    for r, (yi, ishome, sc, co, w) in enumerate(rows):
        X[r, 0] = 1.0; X[r, 1] = ishome
        if use_prior:
            X[r, att_off + sc] = 1.0; X[r, def_off + co] = 1.0
        else:
            if sc > 0: X[r, 1 + sc] = 1.0
            if co > 0: X[r, 1 + (n - 1) + co] = 1.0
        y[r] = yi; W[r] = w

    # objetivo del ridge: 0 salvo att/def, que apuntan a la fuerza Elo previa.
    mu0 = np.zeros(p); D = np.zeros(p)
    if use_prior:
        elos = np.array([float(priors.get(t, 1500)) for t in teams])
        z = (elos - elos.mean()) / 100.0
        mu0[att_off:att_off + n] = 0.18 * z      # más Elo -> ataca más
        mu0[def_off:def_off + n] = -0.18 * z     # más Elo -> concede menos
        D[att_off:] = 1.0
        lam = float(prior_weight)

    beta = mu0.copy() if use_prior else np.zeros(p)
    for _ in range(80):
        mu = np.exp(np.clip(X @ beta, -8, 8))
        H = X.T @ ((W * mu)[:, None] * X) + 1e-6 * np.eye(p)
        g = X.T @ (W * (y - mu))
        if use_prior:
            H += 2 * lam * np.diag(D)
            g -= 2 * lam * (D * (beta - mu0))
        try:
            delta = np.linalg.solve(H, g)
        except np.linalg.LinAlgError:
            delta = np.linalg.lstsq(H, g, rcond=None)[0]
        beta += delta
        if np.max(np.abs(delta)) < 1e-8:
            break

    att = np.zeros(n); dcoef = np.zeros(n)
    if use_prior:
        att = beta[att_off:att_off + n].copy()
        dcoef = beta[def_off:def_off + n].copy()
    else:
        att[1:] = beta[2:2 + (n - 1)]
        dcoef[1:] = beta[2 + (n - 1):]
    model = {"c": float(beta[0]), "home": float(beta[1]), "att": att, "dcoef": dcoef, "idx": idx}
    model["rho"] = _fit_rho(clean, model) if clean else -0.05
    return model


def _fit_rho(clean, model):
    c, home = model["c"], model["home"]
    att, dcoef, idx = model["att"], model["dcoef"], model["idx"]
    pts = []
    for h, a, hg, ag in ((r[0], r[1], int(r[2]), int(r[3])) for r in clean):
        if hg <= 1 and ag <= 1:
            lh = math.exp(c + home + att[idx[h]] + dcoef[idx[a]])
            la = math.exp(c + att[idx[a]] + dcoef[idx[h]])
            pts.append((hg, ag, lh, la))
    if not pts:
        return -0.04
    # rango SANO (DC típico ~ -0.04) + prior suave hacia -0.04 para que con pocos
    # datos no se vaya a un extremo que infle artificialmente 0-0 y 1-1.
    best, bestobj = -0.04, -1e18
    for rho in np.linspace(-0.09, 0.03, 25):
        ll = 0.0
        for (i, j, lh, la) in pts:
            ll += math.log(max(1e-6, _tau(i, j, lh, la, rho)))
        obj = ll - max(25.0, 0.7 * len(pts)) * (rho + 0.04) ** 2
        if obj > bestobj:
            bestobj, best = obj, float(rho)
    return best


def _lambdas(model, A, B, neutral):
    idx = model["idx"]
    g = 0.0 if neutral else model["home"]
    lamA = math.exp(model["c"] + g + model["att"][idx[A]] + model["dcoef"][idx[B]])
    lamB = math.exp(model["c"] + model["att"][idx[B]] + model["dcoef"][idx[A]])
    return max(0.05, lamA), max(0.05, lamB)


def _score_matrix(l1, l2, rho):
    v1, v2 = _pois_vec(l1), _pois_vec(l2)
    M = np.outer(v1, v2)
    for i in (0, 1):
        for j in (0, 1):
            M[i, j] *= _tau(i, j, l1, l2, rho)
    M = np.clip(M, 0, None)
    s = M.sum()
    return M / s if s > 0 else M


def _ko_advance(l1, l2, rho):
    M = _score_matrix(l1, l2, rho)
    p1 = np.tril(M, -1).sum(); pd = np.trace(M); p2 = np.triu(M, 1).sum()
    # prórroga (ritmo reducido)
    e1, ed, e2 = _outcome(_score_matrix(l1 / 3.0, l2 / 3.0, rho))
    # penales: leve sesgo al más fuerte
    strong = l1 / (l1 + l2) if (l1 + l2) > 0 else 0.5
    pen1 = min(0.85, max(0.15, 0.5 + (strong - 0.5) * 0.6))
    a1 = p1 + pd * (e1 + ed * pen1)
    a2 = p2 + pd * (e2 + ed * (1 - pen1))
    s = a1 + a2
    return (a1 / s, a2 / s) if s > 0 else (0.5, 0.5)


def _outcome(M):
    return float(np.tril(M, -1).sum()), float(np.trace(M)), float(np.triu(M, 1).sum())


# ---------------------------------------------------------------- modos
def predict_match(body):
    teams = body.get("teams") or _teams_from(body.get("results", []), [])
    if body.get("priors"):
        teams = sorted(set(teams) | set(body["priors"].keys()))
    model = fit(body.get("results", []), teams, body.get("priors"), float(body.get("priorWeight", 0) or 0))
    A, B = body["home"], body["away"]
    neutral = bool(body.get("neutral"))
    if model is None or A not in model["idx"] or B not in model["idx"]:
        return {"error": "datos insuficientes"}
    rho = model["rho"]
    l1, l2 = _lambdas(model, A, B, neutral)
    M = _score_matrix(l1, l2, rho)

    p1 = float(np.tril(M, -1).sum()); pd = float(np.trace(M)); p2 = float(np.triu(M, 1).sum())
    both = float(M[1:, 1:].sum())
    over = float(M.sum() - sum(M[i, j] for i in range(MAXG + 1) for j in range(MAXG + 1) if i + j <= 2))
    e1 = float((np.arange(MAXG + 1) @ M).sum()); e2 = float((M @ np.arange(MAXG + 1)).sum())

    flat = sorted(((M[i, j], i, j) for i in range(6) for j in range(6)), reverse=True)
    top = [[[i, j], float(p)] for (p, i, j) in flat[:7]]

    # mercados extra + índices de fuerza (modelo completo)
    ii = np.arange(MAXG + 1)[:, None]; jj = np.arange(MAXG + 1)[None, :]; tot = ii + jj
    iA, iB = model["idx"][A], model["idx"][B]
    att_m = float(model["att"].mean()); def_m = float(model["dcoef"].mean())
    mi, mj = np.unravel_index(int(np.argmax(M)), M.shape)
    markets = {
        "over15": float(M[tot > 1].sum()), "over25": over, "over35": float(M[tot > 3].sum()),
        "btts": both, "dc1x": p1 + pd, "dc12": p1 + p2, "dcx2": pd + p2,
        "cs1": float(M[:, 0].sum()), "cs2": float(M[0, :].sum()),
        "wtn1": float(M[1:, 0].sum()), "wtn2": float(M[0, 1:].sum()),
    }
    strength = {
        "att1": int(round(100 * math.exp(model["att"][iA] - att_m))),
        "def1": int(round(100 * math.exp(-(model["dcoef"][iA] - def_m)))),
        "att2": int(round(100 * math.exp(model["att"][iB] - att_m))),
        "def2": int(round(100 * math.exp(-(model["dcoef"][iB] - def_m)))),
    }

    res = {
        "model": "dixon-coles", "team1": A, "team2": B,
        "lambda1": l1, "lambda2": l2,
        "pWin1": p1, "pDraw": pd, "pWin2": p2,
        "expected1": e1, "expected2": e2,
        "bothScore": both, "over25": over, "topScores": top, "neutral": neutral,
        "matrix": M[:6, :6].tolist(), "markets": markets, "strength": strength,
        "mostLikely": [int(mi), int(mj)], "rho": model["rho"]
    }
    if body.get("knockout"):
        a1, a2 = _ko_advance(l1, l2, rho)
        res["pAdvance1"], res["pAdvance2"] = a1, a2
    return res


def simulate_season(body):
    results = body.get("results", [])
    fixtures = body.get("fixtures", [])
    teams = body.get("teams") or _teams_from(results, fixtures)
    model = fit(results, teams)
    if model is None:
        return {"error": "datos insuficientes"}
    idx = model["idx"]; n = len(teams)
    cl = int(body.get("clSpots", 4)); rel = int(body.get("relegSpots", 3))
    sims = int(body.get("sims", 6000))

    base_pts = np.zeros(n); base_gd = np.zeros(n); base_gf = np.zeros(n)
    for r in results:
        if len(r) < 4 or r[0] not in idx or r[1] not in idx:
            continue
        h, a, hg, ag = idx[r[0]], idx[r[1]], int(r[2]), int(r[3])
        base_gf[h] += hg; base_gf[a] += ag; base_gd[h] += hg - ag; base_gd[a] += ag - hg
        if hg > ag: base_pts[h] += 3
        elif hg < ag: base_pts[a] += 3
        else: base_pts[h] += 1; base_pts[a] += 1

    rem = [(idx[f[0]], idx[f[1]]) for f in fixtures if len(f) >= 2 and f[0] in idx and f[1] in idx]
    F = len(rem)
    S = 1 if F == 0 else sims

    pts = np.tile(base_pts, (S, 1)); gd = np.tile(base_gd, (S, 1)); gf = np.tile(base_gf, (S, 1))
    if F > 0:
        rng = np.random.default_rng()
        lamH = np.empty(F); lamA = np.empty(F)
        inv = {v: k for k, v in idx.items()}
        for f, (hi, ai) in enumerate(rem):
            lh, la = _lambdas(model, inv[hi], inv[ai], neutral=False)
            lamH[f] = lh; lamA[f] = la
        hg = rng.poisson(np.tile(lamH, (S, 1))); ag = rng.poisson(np.tile(lamA, (S, 1)))
        for f, (hi, ai) in enumerate(rem):
            h = hg[:, f]; a = ag[:, f]
            pts[:, hi] += np.where(h > a, 3, np.where(h == a, 1, 0))
            pts[:, ai] += np.where(a > h, 3, np.where(h == a, 1, 0))
            gd[:, hi] += h - a; gd[:, ai] += a - h; gf[:, hi] += h; gf[:, ai] += a

    key = pts * 1e6 + gd * 1e3 + gf
    order = np.argsort(-key, axis=1)
    ranks = np.empty_like(order)
    rows = np.arange(S)[:, None]
    ranks[rows, order] = np.arange(n)[None, :]

    probs = {}
    for t, i in idx.items():
        rk = ranks[:, i]
        probs[t] = {
            "title": float((rk == 0).mean()),
            "top": float((rk < cl).mean()),
            "releg": float((rk >= n - rel).mean()),
            "avgRank": float(rk.mean() + 1),
            "avgPts": float(pts[:, i].mean()),
        }
    return {"model": "dixon-coles", "sims": S, "probs": probs}


def compute(body):
    mode = body.get("mode", "match")
    if mode == "season":
        return simulate_season(body)
    return predict_match(body)


# ---------------------------------------------------------------- Vercel handler
class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"ok": True, "model": "dixon-coles"})

    def do_POST(self):
        try:
            length = int(self.headers.get("content-length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            self._send(200, compute(body))
        except Exception as e:  # noqa
            self._send(400, {"error": str(e)})


# ---------------------------------------------------------------- CLI (local / dev-proxy)
if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        print(json.dumps(compute(payload)))
    except Exception as e:  # noqa
        print(json.dumps({"error": str(e)}))
