"""
Contraste de Electogrāfica con Wikipedia: para las encuestas que están en las dos fuentes (misma casa y mismo primer día de campo), compara los porcentajes partido a partido
y las muestras. Sirve para decidir si se puede fiar de los datos de Electogrāfica antes de que alimenten el cálculo. (20/11/2026)

Uso: python contrastar_electografica_wikipedia.py [tolerancia en puntos, por defecto 0,1]
No escribe nada.
"""

import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import extraer_electografica as electografica


def porcentajes_de_wikipedia_regional(filas):
    """{(región, casa normalizada, primer día): ({partido: %}, muestra)}."""
    encuestas = defaultdict(dict)
    muestras = {}
    for fila in filas:
        if fila["es_resultado_real"] == "1" or fila["porcentaje"] == "":
            continue
        clave = (fila["region"], electografica.firma_normalizada(fila["firma"]), electografica.inicio_de_campo_iso(fila))
        encuestas[clave][fila["partido"]] = float(fila["porcentaje"])
        muestras[clave] = fila["muestra"]
    return {clave: (valores, muestras[clave]) for clave, valores in encuestas.items()}


def porcentajes_de_wikipedia_nacional(filas):
    encuestas = defaultdict(dict)
    muestras = {}
    for fila in filas:
        if fila["convocatoria"] != electografica.CONVOCATORIA_NACIONAL or fila["valor"] == "":
            continue
        clave = (electografica.firma_normalizada(fila["firma"]), electografica.inicio_de_campo_iso(fila))
        encuestas[clave][fila["partido"]] = float(fila["valor"])
        muestras[clave] = fila["muestra"]
    return {clave: (valores, muestras[clave]) for clave, valores in encuestas.items()}


def comparar(etiqueta, valores_electografica, valores_wikipedia, tolerancia):
    """Lista de diferencias (partido, Electogrāfica, Wikipedia) mayores que la tolerancia, en los partidos que están en las dos."""
    diferencias = []
    for partido, valor in valores_electografica.items():
        if partido in valores_wikipedia and abs(valor - valores_wikipedia[partido]) > tolerancia + 1e-9:
            diferencias.append((partido, valor, valores_wikipedia[partido]))
    return diferencias


def main():
    tolerancia = float(sys.argv[1].replace(",", ".")) if len(sys.argv) > 1 else 0.1
    hoy = datetime.now(timezone.utc).date()
    _, filas_regionales = electografica.cargar_filas(electografica.RUTA_REGIONAL)
    _, filas_nacionales = electografica.cargar_filas(electografica.RUTA_NACIONAL)
    wikipedia_regional = porcentajes_de_wikipedia_regional(filas_regionales)
    wikipedia_nacional = porcentajes_de_wikipedia_nacional(filas_nacionales)
    coincidencias = 0
    con_diferencias = 0
    for etiqueta, es_regional in (("Generales_CCAA", True), ("Generales", False)):
        for entrada in electografica.descargar_entradas(etiqueta):
            encuesta = electografica.interpretar_entrada(entrada)
            if encuesta is None or encuesta["ultimo_dia"] < hoy - timedelta(days=45):
                continue
            region = None
            if es_regional:
                region = electografica.REGION_DE_TITULAR.get(electografica.sin_tildes_y_mayusculas(encuesta["ambito"]))
                clave = (region, electografica.firma_normalizada(encuesta["casa"]), encuesta["primer_dia"].isoformat())
                datos_wikipedia = wikipedia_regional.get(clave)
            else:
                clave = (electografica.firma_normalizada(encuesta["casa"]), encuesta["primer_dia"].isoformat())
                datos_wikipedia = wikipedia_nacional.get(clave)
            if datos_wikipedia is None:
                continue
            valores_wikipedia, muestra_wikipedia = datos_wikipedia
            valores_electografica = {}
            for nombre, porcentaje in encuesta["valores"]:
                partido = electografica.nombre_de_partido(nombre, region)
                if partido is not None and porcentaje != 0:
                    valores_electografica[partido] = porcentaje
            diferencias = comparar(etiqueta, valores_electografica, valores_wikipedia, tolerancia)
            comunes = [partido for partido in valores_electografica if partido in valores_wikipedia]
            coincidencias += 1
            marca = "OK " if not diferencias and str(encuesta["muestra"]) == str(muestra_wikipedia) else "DIF"
            if marca == "DIF":
                con_diferencias += 1
            print("%s %-9s %-20s %-13s %s-%s | partidos comunes %2d | muestra %s / %s %s" % (
                marca, "regional" if es_regional else "nacional", region or "España", encuesta["casa"], encuesta["primer_dia"].strftime("%d/%m"), encuesta["ultimo_dia"].strftime("%d/%m"),
                len(comunes), encuesta["muestra"], muestra_wikipedia, ("| diferencias: " + ", ".join("%s %.1f/%.1f" % d for d in diferencias)) if diferencias else ""))
    print("\nEncuestas en las dos fuentes: %d; con diferencias o muestras distintas: %d (tolerancia %.1f puntos)" % (coincidencias, con_diferencias, tolerancia))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
