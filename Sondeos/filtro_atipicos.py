"""
Filtro de cifras atípicas en las encuestas, común al promedio nacional y al regional. (13/11/2026)

Regla acordada con el usuario: una cifra de una encuesta se descarta cuando se cumplen las tres condiciones siguientes:
  1. supera UMBRAL_PUNTOS puntos;
  2. triplica (FACTOR_SOBRE_ULTIMO) el último resultado electoral de ese partido (un partido sin resultado de referencia no se filtra: no hay con qué comparar);
  3. ninguna encuesta independiente la respalda: ninguna otra encuesta de otra casa, que no sea «de parte», con fin de campo a menos de VENTANA_RESPALDO_DIAS días,
     da a ese partido al menos FRACCION_RESPALDO de esa cifra.
Es objetivo y se aplica igual a todos los partidos y todas las casas. Al descartar una cifra, el resto de partidos de esa encuesta se reescala para conservar la suma.
Las casas que han publicado alguna cifra descartada (casas_con_cifras_descartadas.csv, generado por detectar_cifras_atipicas.py) ven recortado su peso en un
RECORTE_DE_PESO_DE_CASA (decisión del usuario, 13/11/2026). Es un dato de la tabla de Wikipedia, no un juicio sobre ninguna casa.
"""

import csv
from pathlib import Path

from encuestas_de_parte import promotor_de

UMBRAL_PUNTOS = 3.0
FACTOR_SOBRE_ULTIMO = 3.0
VENTANA_RESPALDO_DIAS = 14
FRACCION_RESPALDO = 0.5
RECORTE_DE_PESO_DE_CASA = 0.5  # multiplicador del peso de las casas con alguna cifra descartada
_CACHE = {}  # el fichero se lee una vez por ejecución (la serie diaria llama al promedio cientos de veces)
RUTA_CASAS = Path(__file__).resolve().parent / "casas_con_cifras_descartadas.csv"


def es_de_parte(encuesta):
    return promotor_de(encuesta["firma_original"], encuesta["cliente"])[0] is not None


def valores_canonicos(valores, equivalencias):
    """Valores de una encuesta con los nombres equivalentes unidos (por ejemplo FA y Sumar) y sumados si coinciden."""
    canonicos = {}
    for partido, valor in valores.items():
        nombre = equivalencias.get(partido, partido)
        canonicos[nombre] = canonicos.get(nombre, 0.0) + valor
    return canonicos


def cifras_descartables(encuestas, ultimo_resultado, equivalencias=None):
    """Lista de (posición de la encuesta, partido canónico, valor) que cumplen la regla. «encuestas»: diccionarios con firma, firma_original, cliente, fin (date) y valores.
    «ultimo_resultado» usa los nombres canónicos; «equivalencias» pasa los nombres de las encuestas a los canónicos."""
    equivalencias = equivalencias or {}
    de_parte = [es_de_parte(e) for e in encuestas]
    canonicos = [valores_canonicos(e["valores"], equivalencias) for e in encuestas]
    descartes = []
    for posicion, encuesta in enumerate(encuestas):
        for partido, valor in canonicos[posicion].items():
            if partido not in ultimo_resultado:
                continue  # sin resultado de referencia (partido nuevo o dato que falta en la tabla) no se puede decir que triplique nada
            if valor <= UMBRAL_PUNTOS or valor <= FACTOR_SOBRE_ULTIMO * ultimo_resultado[partido]:
                continue
            respaldada = False
            for otra_posicion, otra in enumerate(encuestas):
                if otra_posicion == posicion or de_parte[otra_posicion] or otra["firma"] == encuesta["firma"]:
                    continue
                if abs((otra["fin"] - encuesta["fin"]).days) > VENTANA_RESPALDO_DIAS:
                    continue
                if canonicos[otra_posicion].get(partido, 0.0) >= FRACCION_RESPALDO * valor:
                    respaldada = True
                    break
            if not respaldada:
                descartes.append((posicion, partido, valor))
    return descartes


def filtrar(encuestas, ultimo_resultado, equivalencias=None):
    """(encuestas sin las cifras descartadas y con el resto reescalado, lista de descartes). No modifica las originales."""
    equivalencias = equivalencias or {}
    descartes = cifras_descartables(encuestas, ultimo_resultado, equivalencias)
    por_encuesta = {}
    for posicion, partido, _valor in descartes:
        por_encuesta.setdefault(posicion, set()).add(partido)
    resultado = []
    for posicion, encuesta in enumerate(encuestas):
        if posicion not in por_encuesta:
            resultado.append(encuesta)
            continue
        antes = sum(encuesta["valores"].values())
        valores = {p: v for p, v in encuesta["valores"].items() if equivalencias.get(p, p) not in por_encuesta[posicion]}
        despues = sum(valores.values())
        if despues > 0:
            valores = {p: v * antes / despues for p, v in valores.items()}
        nueva = dict(encuesta)
        nueva["valores"] = valores
        resultado.append(nueva)
    return resultado, descartes


def casas_penalizadas(normalizar):
    """Conjunto de firmas (normalizadas con la función dada) con alguna cifra descartada, según casas_con_cifras_descartadas.csv; vacío si el fichero no existe."""
    if "casas" not in _CACHE:
        _CACHE["casas"] = set()
        if RUTA_CASAS.exists():
            with open(RUTA_CASAS, encoding="utf-8-sig", newline="") as fichero:
                _CACHE["casas"] = {normalizar(fila["firma"]) for fila in csv.DictReader(fichero, delimiter=";")}
    return _CACHE["casas"]
