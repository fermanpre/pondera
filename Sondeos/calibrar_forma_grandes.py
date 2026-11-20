"""Error de la forma provincial de PP y PSOE dentro de su comunidad: log(real / previsto), previsto = cuota provincial de la elección anterior x (total de la comunidad nuevo / anterior). (20/11/2026)"""
import csv, json, math, sys
from collections import defaultdict
sys.stdout.reconfigure(encoding="utf-8")
datos = json.load(open(r"C:\Trabajo_Claude\Elecciones_repo_pondera\Web\sitio\datos_modelo.json", encoding="utf-8"))
comunidad_de = {p["nombre"]: p["comunidad"] for p in datos["provincias"]}
peso_de = {p["nombre"]: p["escanos"] for p in datos["provincias"]}
ALIAS = {"A Coruña": "Coruña (A)", "Alicante": "Alicante/Alacant", "Álava": "Araba/Álava", "Balearic Islands": "Balears (Illes)", "Biscay": "Bizkaia", "Castellón": "Castellón/Castelló",
         "La Rioja": "Rioja (La)", "Las Palmas": "Palmas (Las)", "Navarre": "Navarra", "Seville": "Sevilla", "Valencia": "Valencia/València"}
filas = list(csv.DictReader(open(r"C:\Trabajo_Claude\Elecciones\Sondeos\generales_historico_circunscripciones.csv", encoding="utf-8-sig"), delimiter=";"))
ORDEN = ["1996", "2000", "2004", "2008", "2011", "2015", "2016", "2019_abril", "2019_noviembre", "2023"]
def rms(v): return math.sqrt(sum(x * x for x in v) / len(v))
for partido in ("PP", "PSOE", "Vox"):
    cuotas = defaultdict(dict)  # elección -> provincia -> cuota
    for f in filas:
        if f["partido"] == partido and f["eleccion"] in (ORDEN if partido != "Vox" else ORDEN[5:]):
            nombre = ALIAS.get(f["circunscripcion"].replace("\ufffd", "?"), f["circunscripcion"])
            if nombre in comunidad_de: cuotas[f["eleccion"]][nombre] = float(f["porcentaje"])
    errores = []  # (comunidad, cuota %, error)
    for anterior, nueva in zip(*(lambda o: (o, o[1:]))(ORDEN if partido != "Vox" else ORDEN[5:])):
        for comunidad in set(comunidad_de.values()):
            provincias = [p for p in comunidad_de if comunidad_de[p] == comunidad]
            if len(provincias) < 2 or not all(p in cuotas[anterior] and p in cuotas[nueva] for p in provincias): continue
            peso = sum(peso_de[p] for p in provincias)
            total_anterior = sum(cuotas[anterior][p] * peso_de[p] for p in provincias) / peso
            total_nuevo = sum(cuotas[nueva][p] * peso_de[p] for p in provincias) / peso
            for p in provincias:
                errores.append((comunidad, p, cuotas[nueva][p], math.log(cuotas[nueva][p] / (cuotas[anterior][p] * total_nuevo / total_anterior))))
    print(partido, "observaciones:", len(errores), "| σ global %.3f" % rms([e[3] for e in errores]))
    for minimo, maximo, etiqueta in ((30, 999, "≥30 %"), (15, 30, "15–30 %"), (0, 15, "<15 %")):
        seleccion = [e[3] for e in errores if minimo <= e[2] < maximo]
        if seleccion: print("   cuota %-8s n=%3d σ=%.3f" % (etiqueta, len(seleccion), rms(seleccion)))
    galicia = [e[3] for e in errores if e[0] == "Galicia"]
    if galicia: print("   solo Galicia: n=%d σ=%.3f" % (len(galicia), rms(galicia)))
