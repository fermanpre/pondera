"""Error de la forma provincial de los partidos regionales: log(real / previsto), con previsto = cuota provincial de la elección anterior x (total nuevo / total anterior). (19/11/2026)"""
import csv, math, statistics as st, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding="utf-8")
rows = list(csv.DictReader(open(r"C:\Trabajo_Claude\Elecciones\Sondeos\generales_historico_circunscripciones.csv", encoding="utf-8-sig"), delimiter=";"))
def norm(n):
    n = n.replace("\ufffd", "?")
    return {"La Coruña": "A Coruña", "Vizcaya": "Bizkaia", "Guipúzcoa": "Gipuzkoa", "Gerona": "Girona", "Biscay": "Bizkaia"}.get(n, n)
def serie(partidos, provincias):
    s = defaultdict(dict)
    for r in rows:
        if r["partido"] in partidos:
            n = norm(r["circunscripcion"])
            for p in provincias:
                if n == p or (p == "Álava" and n.endswith("lava")) or (p == "Gipuzkoa" and n.startswith("Guip")):
                    s[r["eleccion"]][p] = float(r["porcentaje"])
    return s
orden = ["1977", "1979", "1982", "1986", "1989", "1993", "1996", "2000", "2004", "2008", "2011", "2015", "2016", "2019_abril", "2019_noviembre", "2023"]
casos = {
    "BNG": (["BNG"], ["A Coruña", "Pontevedra", "Lugo", "Ourense"], {"A Coruña": 8, "Pontevedra": 7, "Lugo": 4, "Ourense": 4}),
    "PNV": (["PNV"], ["Álava", "Bizkaia", "Gipuzkoa"], {"Álava": 4, "Bizkaia": 8, "Gipuzkoa": 6}),
    "ERC": (["ERC", "esquerra", "ERC-Sob", "ERC - FN"], ["Barcelona", "Girona", "Lleida", "Tarragona"], {"Barcelona": 32, "Girona": 6, "Lleida": 4, "Tarragona": 6}),
}
extra = {"2015": [4.5, 4.6, 3.6, 3.3], "2016": [3.0, 3.1, 2.6, 2.2], "2019_abril": [6.7, 5.6, 4.8, 3.9]}  # BNG de los ficheros del Ministerio
def rms(v): return math.sqrt(sum(x * x for x in v) / len(v))
todos = []
for nombre, (par, provs, peso) in casos.items():
    s = serie(par, provs)
    if nombre == "BNG":
        for e, v in extra.items(): s[e] = dict(zip(["A Coruña", "Pontevedra", "Lugo", "Ourense"], v))
    completas = [e for e in orden if e in s and all(p in s[e] and s[e][p] > 0 for p in provs)]
    errores = []
    for a, b in zip(completas, completas[1:]):
        if orden.index(b) - orden.index(a) != 1: continue
        Ta = sum(s[a][p] * peso[p] for p in provs) / sum(peso.values()); Tb = sum(s[b][p] * peso[p] for p in provs) / sum(peso.values())
        for p in provs:
            errores.append((b, p, s[b][p], math.log(s[b][p] / (s[a][p] * Tb / Ta))))
    todos += [(nombre,) + e for e in errores]
    print(nombre, "elecciones completas:", completas)
    if errores:
        e = [x[3] for x in errores]
        print("  transiciones consecutivas: %d | σ = %.3f | media %.3f" % (len({x[0] for x in errores}), rms(e), st.mean(e)))
        for lo, hi, et in ((30, 999, "≥30 %"), (15, 30, "15–30 %"), (0, 15, "<15 %")):
            sel = [x[3] for x in errores if lo <= x[2] < hi]
            if sel: print("    cuota %s: n=%d σ=%.3f" % (et, len(sel), rms(sel)))
        por = defaultdict(list)
        for b, p, _, x in errores: por[p].append(x)
        print("    por provincia:", {p: round(rms(v), 3) for p, v in por.items()})
print("TODOS:", len(todos), "σ = %.3f" % rms([x[4] for x in todos]))
