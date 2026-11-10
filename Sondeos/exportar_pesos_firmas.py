"""
Vuelca a pesos_firmas.csv la columna «Peso» de la hoja «Notas» del libro de fiabilidad, para que el cálculo del promedio
(y la actualización automática en GitHub) no dependa de leer ese Excel desde P:.

Ejecutar en local cada vez que se actualice el Excel de fiabilidad.
Uso: python exportar_pesos_firmas.py
"""

import csv
import sys
from pathlib import Path

import promedio

RUTA_PESOS = Path(__file__).resolve().parent / "pesos_firmas.csv"


def main():
    pesos_por_firma = promedio.leer_pesos_de_notas()
    with open(RUTA_PESOS, "w", newline="", encoding="utf-8") as fichero:
        escritor = csv.writer(fichero, delimiter=";")
        escritor.writerow(["firma", "peso"])
        for firma in sorted(pesos_por_firma):
            escritor.writerow([firma, pesos_por_firma[firma]])
    print("Pesos exportados: %d firmas -> %s" % (len(pesos_por_firma), RUTA_PESOS))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
