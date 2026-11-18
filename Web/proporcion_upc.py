"""
Parte de la Unidad del Pueblo Canario (UPC) dentro de (UPC + Frente Amplio), calculada con las encuestas que publican las dos cifras por separado. (18/11/2026)

Datos: Sondeos/upc_en_encuestas.csv (una fila por encuesta: casa, fin de campo, UPC y Frente Amplio sin UPC y sin FV, en puntos de voto). Para añadir una encuesta nueva basta una fila más.
Cada encuesta aporta su proporción UPC / (UPC + Frente Amplio) con peso = peso de la casa en pesos_firmas.csv x 0,5 ^ (antigüedad en días / VIDA_MEDIA_DIAS).
La cifra de partida de candidaturas.json (parametros.upc_en_frente_amplio.proporcion) entra como una observación más, con peso PESO_DE_LA_CIFRA_DE_PARTIDA: las cifras de las encuestas vienen
redondeadas a 0,1 puntos y con una sola o dos encuestas no deben mover la proporción de golpe.
"""
import csv
import unicodedata
from datetime import date
from pathlib import Path

CARPETA_SONDEOS = Path(__file__).resolve().parent.parent / "Sondeos"
RUTA_ENCUESTAS = CARPETA_SONDEOS / "upc_en_encuestas.csv"
RUTA_PESOS = CARPETA_SONDEOS / "pesos_firmas.csv"
VIDA_MEDIA_DIAS = 21.0  # la misma que el promedio regional
PESO_DE_LA_CIFRA_DE_PARTIDA = 0.3
PESO_POR_DEFECTO_DE_LA_CASA = 0.2


def _clave(nombre):
    sin_tildes = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode("ascii")
    return sin_tildes.lower().strip()


def _pesos_de_casas():
    if not RUTA_PESOS.exists():
        return {}
    with open(RUTA_PESOS, encoding="utf-8") as fichero:
        return {_clave(fila["firma"]): float(fila["peso"]) for fila in csv.DictReader(fichero, delimiter=";")}


def cifras_de_la_encuesta(casa, fin_de_campo, total_publicado):
    """(UPC, Frente Amplio sin UPC) de la encuesta de esa casa y fin de campo (texto ISO) si está en el CSV y su total publicado (Frente Amplio + UPC, sin FV) lo confirma con 0,15 puntos de margen; si no, None."""
    if not RUTA_ENCUESTAS.exists() or total_publicado is None:
        return None
    with open(RUTA_ENCUESTAS, encoding="utf-8-sig") as fichero:
        for fila in csv.DictReader(fichero, delimiter=";"):
            if _clave(fila["casa"]) == _clave(casa) and fila["fin_campo"] == str(fin_de_campo):
                upc, frente_amplio = float(fila["upc"]), float(fila["frente_amplio_sin_upc"])
                if abs(upc + frente_amplio - total_publicado) <= 0.15:
                    return upc, frente_amplio
    return None


def calcular(cifra_de_partida, dia=None):
    """(proporción, detalle) donde detalle es la lista de (casa, fin de campo, proporción de la encuesta, peso); sin CSV devuelve la cifra de partida."""
    dia = dia or date.today()
    if not RUTA_ENCUESTAS.exists():
        return cifra_de_partida, []
    pesos = _pesos_de_casas()
    detalle = []
    with open(RUTA_ENCUESTAS, encoding="utf-8-sig") as fichero:
        for fila in csv.DictReader(fichero, delimiter=";"):
            upc, frente_amplio = float(fila["upc"]), float(fila["frente_amplio_sin_upc"])
            fin_de_campo = date.fromisoformat(fila["fin_campo"])
            if fin_de_campo > dia or upc + frente_amplio <= 0:
                continue
            antiguedad = (dia - fin_de_campo).days
            peso = pesos.get(_clave(fila["casa"]), PESO_POR_DEFECTO_DE_LA_CASA) * 0.5 ** (antiguedad / VIDA_MEDIA_DIAS)
            detalle.append((fila["casa"], fila["fin_campo"], upc / (upc + frente_amplio), peso))
    suma_pesos = PESO_DE_LA_CIFRA_DE_PARTIDA + sum(peso for _c, _f, _p, peso in detalle)
    suma_ponderada = PESO_DE_LA_CIFRA_DE_PARTIDA * cifra_de_partida + sum(proporcion * peso for _c, _f, proporcion, peso in detalle)
    return suma_ponderada / suma_pesos, detalle


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    proporcion, detalle = calcular(0.075)
    for casa, fin, p, peso in detalle:
        print("%-8s %s  proporción %5.1f %%  peso %.3f" % (casa, fin, 100 * p, peso))
    print("Proporción de UPC en (UPC + Frente Amplio): %.2f %%" % (100 * proporcion))
