"""
Extrae de las páginas «Results breakdown of the <año> Spanish general election (Congress)» de Wikipedia (inglés) la tabla «Constituencies»:
porcentaje de voto y escaños de los partidos principales en cada circunscripción, para las 16 elecciones generales desde 1977 hasta 2023.

Cada partido ocupa dos columnas (porcentaje y escaños); las celdas vacías o fusionadas (partido que no se presentó) se leen respetando el colspan.
Es una fuente secundaria: sirve para calibrar errores provinciales de los partidos relevantes, no como resultado oficial (que está en Interior y el BOE).

Salida en esta carpeta: generales_historico_circunscripciones.csv (eleccion, circunscripcion, partido, porcentaje, escanos) y
resumen_historico_circunscripciones.csv (por elección: circunscripciones, partidos, suma de escaños).

Uso: python extraer_historico_circunscripciones.py
"""

import csv
import re
import sys
from pathlib import Path

import extraer_sondeos_wikipedia as wiki

CARPETA = Path(r"C:\Trabajo_Claude\Elecciones\Sondeos")
ELECCIONES = [
    ("1977", "1977"), ("1979", "1979"), ("1982", "1982"), ("1986", "1986"), ("1989", "1989"), ("1993", "1993"), ("1996", "1996"), ("2000", "2000"),
    ("2004", "2004"), ("2008", "2008"), ("2011", "2011"), ("2015", "2015"), ("2016", "2016"), ("2019_abril", "April_2019"), ("2019_noviembre", "November_2019"),
    ("2023", "2023"),
]
PLANTILLA_TITULO = "Results_breakdown_of_the_%s_Spanish_general_election_(Congress)"
PATRON_NUMERO = re.compile(r"^\d+(?:\.\d+)?$")
FILAS_QUE_NO_SON_CIRCUNSCRIPCIONES = ("total", "region", "constituency", "nationwide")


def textos_de_la_rejilla(columnas):
    """Textos de una fila de la rejilla (wiki.construir_rejilla): expande colspan y rowspan, de modo que las celdas combinadas (partidos que no concurrieron en varias
    provincias seguidas) ocupan su columna en todas las filas. Sin esto las filas siguientes se desplazan y un partido regional (p. ej. Coalición Canaria) se lee
    en la columna de otro (CiU, PNV, ERC o Más País)."""
    textos = []
    for celda, _es_continuacion in columnas:
        if celda is None:
            textos.append("")
        else:
            textos.append(wiki.texto(celda).replace("−", "-").replace("–", "-").replace("\xa0", " ").strip())
    return textos


def tabla_de_circunscripciones(arbol):
    for tabla in arbol.xpath("//table[contains(@class,'wikitable')]"):
        encabezado = tabla.xpath("preceding::*[self::h2 or self::h3 or self::h4][1]")
        seccion = wiki.texto(encabezado[0]).replace("edit", "").strip() if encabezado else ""
        if seccion == "Constituencies":
            return tabla
    return None


def extraer(clave, sufijo):
    arbol = wiki.bajar(PLANTILLA_TITULO % sufijo)
    tabla = tabla_de_circunscripciones(arbol)
    if tabla is None:
        return []
    filas = tabla.xpath(".//tr")
    rejilla = wiki.construir_rejilla(filas)
    cabecera = textos_de_la_rejilla(rejilla[0])
    partidos = [cabecera[posicion] for posicion in range(1, len(cabecera), 2)]
    resultado = []
    for columnas in rejilla[1:]:
        celdas = textos_de_la_rejilla(columnas)
        if not celdas or celdas[0].lower().startswith(FILAS_QUE_NO_SON_CIRCUNSCRIPCIONES) or len(celdas) < 3:
            continue
        for indice, partido in enumerate(partidos):
            posicion = 1 + 2 * indice
            if posicion + 1 >= len(celdas) or not partido:
                continue
            porcentaje, escanos = celdas[posicion], celdas[posicion + 1]
            if not PATRON_NUMERO.match(porcentaje):
                continue
            resultado.append([clave, celdas[0], partido, float(porcentaje), int(escanos) if escanos.isdigit() else 0])
    return resultado


def main():
    filas, resumen = [], []
    for clave, sufijo in ELECCIONES:
        try:
            datos = extraer(clave, sufijo)
        except Exception as error:
            print(clave, "ERROR", type(error).__name__, error)
            continue
        filas += datos
        circunscripciones = {fila[1] for fila in datos}
        escanos = sum(fila[4] for fila in datos)
        resumen.append([clave, len(circunscripciones), len({fila[2] for fila in datos}), escanos])
        print("%-15s circunscripciones %2d | partidos %2d | escaños sumados %3d" % tuple(resumen[-1]), flush=True)
    with open(CARPETA / "generales_historico_circunscripciones.csv", "w", encoding="utf-8-sig", newline="") as fichero:
        escritor = csv.writer(fichero, delimiter=";")
        escritor.writerow(["eleccion", "circunscripcion", "partido", "porcentaje", "escanos"])
        escritor.writerows(filas)
    with open(CARPETA / "resumen_historico_circunscripciones.csv", "w", encoding="utf-8-sig", newline="") as fichero:
        escritor = csv.writer(fichero, delimiter=";")
        escritor.writerow(["eleccion", "circunscripciones", "partidos", "escanos_sumados"])
        escritor.writerows(resumen)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
