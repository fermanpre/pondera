"""
Detecta las cifras atípicas (ver filtro_atipicos.py) en las encuestas nacionales del ciclo actual y en las regionales y provinciales de Wikipedia, y escribe
casas_con_cifras_descartadas.csv, que usan el promedio nacional y el regional para recortar el peso de esas casas. (13/11/2026)

Entradas: sondeos_wikipedia_largo.csv (nacional) y sondeos_regionales_largo.csv (regional; se descargan con extraer_sondeos_wikipedia.py y extraer_sondeos_regionales.py).
En cada región el «último resultado electoral» de un partido es el máximo de sus resultados reales que figuran en la tabla de esa región (generales de 2023, europeas de 2024…).
Uso: python detectar_cifras_atipicas.py
"""

import csv
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import filtro_atipicos as filtro
import promedio

CARPETA = Path(__file__).resolve().parent
CONVOCATORIA_NACIONAL = "generales_proxima"


def a_fecha(iso):
    anio, mes, dia = (int(x) for x in iso.split("-"))
    return date(anio, mes, max(dia, 1))


# Frente Amplio y Front Valencià heredan lo que Sumar (con Compromís) sacó en 2023; en las tablas valencianas ese resultado figura como «Sumem per Guanyar»
EQUIVALENCIAS_REGIONALES = {"FA": "Sumar", "FV": "Sumar", "Compromís": "Sumar", "Sumem per Guanyar": "Sumar"}


def encuestas_regionales():
    """{región: (lista de encuestas con porcentajes, {partido canónico: último resultado real})}. Las encuestas conservan los nombres de la tabla."""
    encuestas = defaultdict(dict)
    resultados = defaultdict(lambda: defaultdict(float))
    with open(CARPETA / "sondeos_regionales_largo.csv", encoding="utf-8-sig", newline="") as fichero:
        for fila in csv.DictReader(fichero, delimiter=";"):
            if fila["porcentaje"] == "" or not fila["fin_campo"]:
                continue
            partido = fila["partido"]
            if fila["es_resultado_real"] == "1":
                nombre = EQUIVALENCIAS_REGIONALES.get(partido, partido)  # el último resultado se guarda con el nombre canónico
                resultados[fila["region"]][nombre] = max(resultados[fila["region"]][nombre], float(fila["porcentaje"]))
                continue
            clave = (fila["firma"], fila["cliente"], fila["fecha_texto"], fila["fin_campo"], fila["muestra"])
            encuesta = encuestas[fila["region"]].setdefault(clave, {"firma": promedio.normalizar_firma(fila["firma"]), "firma_original": fila["firma"], "cliente": fila["cliente"],
                                                                     "fin": a_fecha(fila["fin_campo"]), "valores": {}, "fecha_texto": fila["fecha_texto"], "muestra": fila["muestra"]})
            encuesta["valores"][partido] = float(fila["porcentaje"])
    return {region: (list(por_clave.values()), resultados[region]) for region, por_clave in encuestas.items()}


def main():
    filas = []
    nacionales = promedio.leer_encuestas(CONVOCATORIA_NACIONAL)
    _filtradas, descartes = filtro.filtrar(nacionales, promedio.ultimo_resultado_nacional())
    for posicion, partido, valor in descartes:
        filas.append(("nacional", nacionales[posicion], partido, valor))
    for region, (lista, ultimo) in sorted(encuestas_regionales().items()):
        _filtradas, descartes = filtro.filtrar(lista, ultimo, EQUIVALENCIAS_REGIONALES)
        for posicion, partido, valor in descartes:
            filas.append((region, lista[posicion], partido, valor))
    print("Cifras descartadas: %d" % len(filas))
    with open(filtro.RUTA_CASAS, "w", encoding="utf-8-sig", newline="") as fichero:
        escritor = csv.writer(fichero, delimiter=";")
        escritor.writerow(["firma", "cliente", "ambito", "fin_campo", "partido", "valor"])
        for ambito, encuesta, partido, valor in filas:
            escritor.writerow([encuesta["firma_original"], encuesta["cliente"], ambito, encuesta["fin"].isoformat(), partido, valor])
            print("  %-10s %-14s cliente %-16s %s  %s %.1f" % (ambito, encuesta["firma_original"], encuesta["cliente"], encuesta["fin"], partido, valor))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
