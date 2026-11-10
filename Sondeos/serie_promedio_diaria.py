"""
Serie diaria del promedio de encuestas: para cada día desde las generales del 23/07/2023, el promedio que «tocaba» ese día, con el mismo método de
promedio.py (pesos por firma, saturación, caída temporal, ventana de 30 días) y solo con las encuestas cuyo fin de campo es anterior o igual a ese día.
Se recalcula entera en cada ejecución con las encuestas conocidas hoy (el pasado puede moverse si Wikipedia añade encuestas tardías).

Salidas (en la carpeta del sitio web): serie_promedio.json y serie_promedio.js («const SERIE_PROMEDIO = …;», para abrir la página desde el disco).
Los días sin encuestas en la ventana quedan como null (la gráfica corta la línea; no se interpola).

Uso: python serie_promedio_diaria.py
"""

import csv
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import promedio

PRIMER_DIA = date(2023, 7, 24)  # día siguiente a las generales de 2023
ULTIMO_DIA_PUBLICABLE = date(2026, 11, 23)  # veda de sondeos: desde el 24/11 (a verificar el texto legal) no se publica
CARPETA_SONDEOS = Path(__file__).resolve().parent
CARPETA_SITIO = CARPETA_SONDEOS.parent / "Web" / "sitio"
RUTA_PESOS = CARPETA_SONDEOS / "pesos_firmas.csv"
PARTIDOS_AUXILIARES = ("Sumar_con_FV",)  # claves internas que no son partidos


def leer_pesos_de_firmas():
    """Pesos exportados por exportar_pesos_firmas.py; si no existe el CSV, se intenta leer el Excel de fiabilidad."""
    if RUTA_PESOS.exists():
        with open(RUTA_PESOS, encoding="utf-8") as fichero:
            return {fila["firma"]: float(fila["peso"]) for fila in csv.DictReader(fichero, delimiter=";")}
    return promedio.leer_pesos_de_notas()


def calcular_serie(dias, encuestas_leidas, pesos_de_firmas):
    """[(día, promedio por partido o None, encuestas usadas)] para cada día."""
    serie = []
    for dia in dias:
        # Si en los 30 días anteriores no hay ninguna encuesta, calcular_promedio devuelve un promedio vacío
        promedio_del_dia, _cuenta, usadas, _vida, _recientes = promedio.calcular_promedio(
            pesos_de_firmas, hoy=dia, escribir=False, encuestas_leidas=encuestas_leidas)
        serie.append((dia, promedio_del_dia if promedio_del_dia else None, usadas))
    return serie


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ultimo_dia = min(promedio.HOY, ULTIMO_DIA_PUBLICABLE)
    dias = [PRIMER_DIA + timedelta(days=n) for n in range((ultimo_dia - PRIMER_DIA).days + 1)]
    encuestas_leidas = promedio.leer_encuestas("generales_proxima", fusionar_frente_amplio_en_sumar=False)
    pesos_de_firmas = leer_pesos_de_firmas()
    serie = calcular_serie(dias, encuestas_leidas, pesos_de_firmas)

    partidos = sorted({partido for _dia, valores, _n in serie if valores for partido in valores if partido not in PARTIDOS_AUXILIARES})
    series_por_partido = {}
    for partido in partidos:
        series_por_partido[partido] = [
            round(valores[partido], 2) if valores and partido in valores else None for _dia, valores, _n in serie
        ]
    datos = {
        "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "primer_dia": dias[0].isoformat(), "ultimo_dia": dias[-1].isoformat(),
        "dias": len(dias), "fecha_eleccion": promedio.FECHA_ELECCION.isoformat(),
        "ultimo_dia_publicable": ULTIMO_DIA_PUBLICABLE.isoformat(),
        "encuestas_usadas": [n for _dia, _valores, n in serie],
        "partidos": series_por_partido,
        "fuente": "Elaboración propia a partir de las tablas de Wikipedia (CC BY-SA) «Opinion polling for the next Spanish general election».",
    }
    CARPETA_SITIO.mkdir(exist_ok=True)
    texto_json = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    (CARPETA_SITIO / "serie_promedio.json").write_text(texto_json, encoding="utf-8")
    (CARPETA_SITIO / "serie_promedio.js").write_text("const SERIE_PROMEDIO = " + texto_json + ";\n", encoding="utf-8")
    dias_con_datos = sum(1 for _d, valores, _n in serie if valores)
    print("Días: %d (%s a %s) | con promedio: %d | partidos: %d | JSON: %.0f kB" % (
        len(dias), dias[0], dias[-1], dias_con_datos, len(partidos), len(texto_json.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
