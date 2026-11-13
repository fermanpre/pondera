"""
Extrae de Wikipedia la página «Sub-national opinion polling for the 2026 Spanish general election»: encuestas por comunidad y por provincia con porcentajes de voto,
escaños (o rango de escaños) y enlaces a la fuente. (13/11/2026)

Formato de las celdas de la página: «33.7 11/12» (porcentaje y rango de escaños), «? 11» (solo escaños), «30.2» (solo porcentaje), «35.8 (15)» (resultado real), «–» (no se presentó).
Salida: sondeos_regionales_largo.csv (una fila por encuesta, región y partido), separador «;», UTF-8 con BOM.
Uso: python extraer_sondeos_regionales.py
"""

import csv
import json
import re
import sys
from pathlib import Path

import extraer_sondeos_wikipedia as wiki

PAGINA = "Sub-national_opinion_polling_for_the_2026_Spanish_general_election"
SALIDA = Path(__file__).resolve().parent / "sondeos_regionales_largo.csv"
MESES = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
PATRON_FECHA_FINAL = re.compile(r"(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})\s*$")
PATRON_MES_FINAL = re.compile(r"([A-Z][a-z]{2})\s+(\d{4})\s*$")
PATRON_CELDA = re.compile(r"^(?P<pct>\?|\d+(?:\.\d+)?)?\s*(?P<escanos>\d+(?:/\d+)?|\(\d+\))?$")
ENCABEZADOS_QUE_NO_SON_PARTIDOS = {"polling firm/commissioner", "fieldwork date", "sample size", "turnout", "lead"}


def fecha_fin_iso(texto):
    coincidencia = PATRON_FECHA_FINAL.search(texto)
    if coincidencia:
        dia, mes, anio = coincidencia.groups()
        return "%s-%02d-%02d" % (anio, MESES[mes], int(dia))
    coincidencia = PATRON_MES_FINAL.search(texto)
    if coincidencia:
        mes, anio = coincidencia.groups()
        return "%s-%02d-00" % (anio, MESES[mes])
    return ""


def interpretar_celda(texto):
    """(porcentaje o None, escaños mínimo o None, escaños máximo o None) de una celda de partido; None si la celda no es un dato."""
    texto = texto.replace(",", "").strip()
    if texto in ("", "–", "-", "—"):
        return None
    coincidencia = PATRON_CELDA.match(texto)
    if not coincidencia:
        return None
    porcentaje = coincidencia.group("pct")
    escanos = (coincidencia.group("escanos") or "").strip("()")
    if porcentaje in (None, "?") and not escanos:
        return None
    minimo = maximo = None
    if escanos:
        partes = escanos.split("/")
        minimo, maximo = int(partes[0]), int(partes[-1])
    return (None if porcentaje in (None, "?") else float(porcentaje)), minimo, maximo


def numero_o_vacio(texto):
    limpio = re.sub(r"[^\d]", "", texto)
    return int(limpio) if limpio else ""


def extraer_filas():
    """Lista de filas (diccionarios) de todas las tablas de la página, con la clave «enlaces» como cadena JSON."""
    arbol = wiki.bajar(PAGINA)
    filas_salida = []
    for tabla in arbol.xpath("//table[contains(@class,'wikitable')]"):
        encabezado = tabla.xpath("preceding::*[self::h2 or self::h3 or self::h4][1]")
        region = wiki.texto(encabezado[0]).replace("edit", "").strip() if encabezado else ""
        rejilla = wiki.construir_rejilla(tabla.xpath(".//tr"))
        partidos = [("" if continuacion else wiki.nombre_de_cabecera(celda)) for celda, continuacion in rejilla[0] if celda is not None]
        for columnas in rejilla[1:]:
            celdas = [celda for celda, _continuacion in columnas]
            if len(celdas) < 6 or celdas[0] is None:
                continue
            enlaces = wiki.enlaces_de_celda(celdas[0], arbol)  # antes de texto(), que retira las notas
            firma_cliente = wiki.texto(celdas[0])
            fecha_texto = wiki.texto(celdas[1])
            if not firma_cliente or not fecha_texto or firma_cliente == "Polling firm/Commissioner":
                continue
            es_resultado = bool(re.match(r"^\d{4} (general|EP|European|regional|local)", firma_cliente))
            firma = firma_cliente.split("/")[0].strip()
            cliente = "/".join(firma_cliente.split("/")[1:]).strip()
            for posicion in range(4, min(len(celdas), len(partidos))):
                partido = partidos[posicion]
                celda, continuacion = columnas[posicion]
                if not partido or continuacion or celda is None or partido.lower() in ENCABEZADOS_QUE_NO_SON_PARTIDOS:
                    continue
                dato = interpretar_celda(wiki.texto(celda))
                if dato is None:
                    continue
                porcentaje, minimo, maximo = dato
                filas_salida.append({
                    "region": region, "firma": firma, "cliente": cliente, "fecha_texto": fecha_texto, "fin_campo": fecha_fin_iso(fecha_texto),
                    "muestra": numero_o_vacio(wiki.texto(celdas[2])), "participacion": wiki.texto(celdas[3]), "es_resultado_real": int(es_resultado),
                    "partido": partido, "porcentaje": "" if porcentaje is None else porcentaje,
                    "escanos_min": "" if minimo is None else minimo, "escanos_max": "" if maximo is None else maximo,
                    "enlaces": json.dumps([e["url"] for e in enlaces], ensure_ascii=False)})
    return filas_salida


def main():
    filas_salida = extraer_filas()
    with open(SALIDA, "w", encoding="utf-8-sig", newline="") as fichero:
        escritor = csv.DictWriter(fichero, fieldnames=list(filas_salida[0].keys()), delimiter=";")
        escritor.writeheader()
        escritor.writerows(filas_salida)
    print("Filas:", len(filas_salida), "->", SALIDA)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
