"""
Previsión base: traduce el promedio de encuestas (Sondeos/promedio_actual.csv) a objetivos nacionales por candidatura de 2026,
reparte los votos por provincia con el motor (proporcional + ajuste iterativo) sobre base_2026.json y calcula los escaños (D'Hondt, barrera 3 %).

Supuestos (todos editables aquí arriba):
  - Las encuestas dan % de voto válido; la base usa votos a candidaturas: se divide entre (1 - proporción de blancos de 2023).
  - El Podemos de las encuestas es nacional: la parte que corresponde a Cataluña (va con ERC), Comunitat Valenciana y Canarias (van con Sumar)
    se reasigna con el peso que tenía Podemos en esas provincias en la base (Sumar 2023 repartido con las europeas de 2024).
  - PACMA no sale en las encuestas: se le da su cuota de 2023. OTROS recibe lo que queda hasta 100 %.
  - Participación y votos válidos de cada provincia: los de 2023 (el simulador los hará variar más adelante).

Uso: python calcular_prevision_base.py
"""

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

import proporcion_upc
from motor_reparto import ProblemaDeReparto, cuota_nacional, repartir_escanos_con_coaliciones, repartir_proporcional

CARPETA_WEB = Path(__file__).resolve().parent  # Web/ (en local y en GitHub; Sondeos/ está al lado)
RUTA_PROMEDIO = CARPETA_WEB.parent / "Sondeos" / "promedio_actual.csv"
BARRERA_ELECTORAL = 0.03
# Decisión del usuario (09/11/2026): el Podemos de las encuestas representa solo «resto de España» (donde se presenta como Podemos); en Cataluña ERC ya incluye a Podemos
# y en la Comunitat Valenciana y Canarias va todo como en 2023, dentro de Sumar. Por tanto no se reasigna nada del Podemos de las encuestas a ERC ni a Sumar.
REASIGNAR_PODEMOS_A_FUSIONES = False
CUOTA_PACMA_2023 = None  # None: se toma de la base
EQUIVALENCIAS_ENCUESTA_A_CANDIDATURA = {
    "PP": "PP", "PSOE": "PSOE", "Vox": "VOX", "Sumar": "SUMAR", "Podemos": "PODEMOS", "ERC": "ERC", "SALF": "SALF",
    "Junts": "JUNTS", "EH Bildu": "BILDU", "Adelante Andalucía": "ADELANTE", "PNV": "PNV", "BNG": "BNG", "CCa": "CC", "UPN": "UPN",
}


def leer_promedio():
    promedio = {}
    with open(RUTA_PROMEDIO, encoding="utf-8") as fichero:
        for fila in csv.DictReader(fichero, delimiter=";"):
            promedio[fila["partido"]] = float(fila["promedio_pct"]) / 100.0
    return promedio


def proporcion_upc_en_frente_amplio(provincias, dia=None):
    """Parte de UPC en (UPC + Frente Amplio). Si hay encuestas que publican las dos cifras (Sondeos/upc_en_encuestas.csv), sale de ellas (proporcion_upc.py), con la proporción de la base
    de partida (ponderada por los votos a candidaturas de cada provincia) como cifra de arranque con poco peso; si no hay, sale de candidaturas.json (parametros.upc_en_frente_amplio) o de la base."""
    votos_upc = sum(p["cuotas"].get("UPC", 0.0) * p["votos_candidaturas"] for p in provincias.values())
    votos_frente_amplio = sum(p["cuotas"].get("SUMAR", 0.0) * p["votos_candidaturas"] for p in provincias.values())
    de_la_base = votos_upc / (votos_upc + votos_frente_amplio) if votos_upc + votos_frente_amplio > 0 else 0.0
    if proporcion_upc.RUTA_ENCUESTAS.exists():
        return proporcion_upc.calcular(de_la_base, dia)[0]
    ruta_configuracion = CARPETA_WEB / "candidaturas.json"
    if ruta_configuracion.exists():
        calibrada = json.loads(ruta_configuracion.read_text(encoding="utf-8"))["parametros"].get("upc_en_frente_amplio")
        if calibrada:
            return calibrada["proporcion"]
    return de_la_base


def calcular_objetivos(base, configuracion, promedio, dia=None):
    provincias = base["provincias"]
    total_candidaturas = sum(p["votos_candidaturas"] for p in provincias.values())
    total_validos = sum(p["votos_validos"] for p in provincias.values())
    factor_blancos = total_candidaturas / total_validos
    objetivos = {}
    for nombre_encuesta, identificador in EQUIVALENCIAS_ENCUESTA_A_CANDIDATURA.items():
        objetivos[identificador] = promedio.get(nombre_encuesta, 0.0) / factor_blancos

    # Front Valencià: el promedio «Sumar» es el total (Frente Amplio + FV); FV es su parte según las encuestas que la publican por separado
    proporcion_fv = promedio.get("FV", 0.0) / promedio["Sumar_con_FV"] if promedio.get("Sumar_con_FV") else 0.0
    objetivos["FV"] = objetivos["SUMAR"] * proporcion_fv
    objetivos["SUMAR"] -= objetivos["FV"]

    # Unidad del Pueblo Canario (UPC, Podemos + Nueva Canarias + IU en Canarias; 17/11/2026): ninguna encuesta publica su porcentaje y el total «Frente Amplio» de las casas la incluye.
    # Su objetivo es su parte del Frente Amplio en la base de partida (UPC / (UPC + Frente Amplio)), así que evoluciona como el Frente Amplio frente a 2023.
    if "UPC" in provincias[next(iter(provincias))]["cuotas"]:
        objetivos["UPC"] = objetivos["SUMAR"] * proporcion_upc_en_frente_amplio(provincias, dia)
        objetivos["SUMAR"] -= objetivos["UPC"]

    # Coalición UPN-PP en Navarra: las encuestas ya no dan UPN, así que la coalición sigue la evolución nacional del PP.
    # Objetivo de la coalición = su peso en la base (voto de UPN y del PP en Navarra) x (objetivo del PP / cuota nacional del PP en la base, contando su parte en la coalición).
    # El PP del resto de España pierde la parte del PP en la coalición, porque el PP de las encuestas ya la incluye.
    coalicion = configuracion["parametros"].get("coalicion_upn_pp")
    if coalicion:
        votos_coalicion_base = sum(p["cuotas"][coalicion["columna"]] * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas
        votos_pp_dentro = sum((p["parte_pp_de_la_coalicion"] or 0.0) * p["cuotas"][coalicion["columna"]] * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas
        votos_pp_fuera = sum(p["cuotas"][coalicion["socio"]] * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas
        crecimiento_pp = objetivos[coalicion["socio"]] / (votos_pp_fuera + votos_pp_dentro)
        objetivo_coalicion = votos_coalicion_base * crecimiento_pp
        objetivos[coalicion["columna"]] = objetivo_coalicion
        objetivos[coalicion["socio"]] -= objetivo_coalicion * (votos_pp_dentro / votos_coalicion_base)

    votos_podemos_total = sum(p["podemos_antes_de_fusion"] * p["votos_candidaturas"] for p in provincias.values())
    reasignacion = defaultdict(float)
    for fusion in configuracion["fusiones"]:
        for movimiento in fusion["mover"]:
            if movimiento["de"] == "PODEMOS":
                votos_region = sum(provincias[n]["podemos_antes_de_fusion"] * provincias[n]["votos_candidaturas"] for n in fusion["provincias"])
                reasignacion[movimiento["a"]] += objetivos["PODEMOS"] * votos_region / votos_podemos_total
    if not REASIGNAR_PODEMOS_A_FUSIONES:
        reasignacion = defaultdict(float)
    parte_reasignada = sum(reasignacion.values())
    objetivos["PODEMOS"] -= parte_reasignada
    for destino, cantidad in reasignacion.items():
        objetivos[destino] += cantidad

    # PACMA y «Otros» no salen en las encuestas: se les da su cuota de la base (2023) y las demás candidaturas se reescalan para que todo sume 100 %.
    # (Antes «Otros» era el resto sin más, y al sumar medias de subconjuntos de encuestas quedaba en un 0,0 % irreal.)
    cuota_pacma = sum(p["cuotas"]["PACMA"] * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas
    cuota_otros = sum(p["cuotas"]["OTROS"] * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas
    cuota_existe = sum(p["cuotas"]["EXISTE"] * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas
    cuota_gbai = sum(p["cuotas"].get("GBAI", 0.0) * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas   # Geroa Bai (Navarra), como Existe: cuota fija de la base; el blend la acerca a sus encuestas
    suma_de_encuestas = sum(objetivos.values())
    escala = (1.0 - cuota_pacma - cuota_otros - cuota_existe - cuota_gbai) / suma_de_encuestas
    objetivos = {identificador: valor * escala for identificador, valor in objetivos.items()}
    reasignacion = {destino: valor * escala for destino, valor in reasignacion.items()}
    objetivos["PACMA"] = cuota_pacma
    objetivos["EXISTE"] = cuota_existe
    objetivos["GBAI"] = cuota_gbai
    objetivos["NC"] = 0.0
    objetivos["OTROS"] = cuota_otros
    return objetivos, factor_blancos, dict(reasignacion)


def medias_a_promedio(medias):
    """Convierte las medias de promedio.calcular_promedio (en %) al formato de leer_promedio (en tanto por uno), redondeadas a 2 decimales como el CSV promedio_actual.csv."""
    return {partido: round(valor, 2) / 100.0 for partido, valor in medias.items()}


def preparar_problema(medias=None, dia=None):
    """(problema de reparto, votos válidos por provincia, escaños por provincia) con los objetivos del promedio actual y la base de base_2026.json.
    Con medias (resultado de promedio.calcular_promedio de un día) y dia no lee promedio_actual.csv: sirve para reconstruir la previsión de días pasados."""
    configuracion = json.loads((CARPETA_WEB / "candidaturas.json").read_text(encoding="utf-8"))
    base = json.loads((CARPETA_WEB / "base_2026.json").read_text(encoding="utf-8"))
    provincias = base["provincias"]
    objetivos, _factor, _reasignacion = calcular_objetivos(base, configuracion, medias_a_promedio(medias) if medias is not None else leer_promedio(), dia)
    nombres = sorted(provincias)
    peso = {n: float(provincias[n]["votos_candidaturas"]) for n in nombres}
    cuotas = {(n, i): c for n in nombres for i, c in provincias[n]["cuotas"].items() if c > 0}
    partidos = [i for i in objetivos if objetivos[i] > 0 and any(par[1] == i for par in cuotas)]
    suma = sum(objetivos[i] for i in partidos)
    problema = ProblemaDeReparto(nombres, partidos, cuotas, peso, {i: objetivos[i] / suma for i in partidos})
    validos = {n: float(provincias[n]["votos_validos"]) for n in nombres}
    escanos = {n: provincias[n]["escanos"] for n in nombres}
    return problema, validos, escanos


def main():
    configuracion = json.loads((CARPETA_WEB / "candidaturas.json").read_text(encoding="utf-8"))
    base = json.loads((CARPETA_WEB / "base_2026.json").read_text(encoding="utf-8"))
    provincias = base["provincias"]
    objetivos, factor_blancos, reasignacion = calcular_objetivos(base, configuracion, leer_promedio())
    print("Objetivos nacionales (%% de votos a candidaturas; blancos %.2f %%):" % (100 * (1 - factor_blancos)))
    for identificador in [c["id"] for c in configuracion["candidaturas"]]:
        print("  %-9s %6.2f %%" % (identificador, 100 * objetivos[identificador]))
    print("Podemos reasignado: %s" % {k: round(100 * v, 2) for k, v in reasignacion.items()})
    assert objetivos["OTROS"] > 0, "los objetivos suman más de 100 %"

    nombres = sorted(provincias.keys())
    peso = {n: float(provincias[n]["votos_candidaturas"]) for n in nombres}
    base_cuotas = {}
    for n in nombres:
        for identificador, cuota in provincias[n]["cuotas"].items():
            if cuota > 0:
                base_cuotas[(n, identificador)] = cuota
    partidos = [i for i in objetivos if objetivos[i] > 0 and any(par[1] == i for par in base_cuotas)]
    objetivo_activo = {i: objetivos[i] for i in partidos}
    suma_activa = sum(objetivo_activo.values())
    objetivo_activo = {i: v / suma_activa for i, v in objetivo_activo.items()}
    problema = ProblemaDeReparto(nombres, partidos, base_cuotas, peso, objetivo_activo)
    reparto = repartir_proporcional(problema)
    error = max(abs(cuota_nacional(problema, reparto, i) - objetivo_activo[i]) for i in partidos)
    print("\nError máximo de columna tras el ajuste: %.2e" % error)

    escanos_por_candidatura = defaultdict(int)
    resultado = {}
    for n in nombres:
        votos = {i: reparto.get((n, i), 0.0) * peso[n] for i in partidos if (n, i) in reparto}
        minimo = BARRERA_ELECTORAL * provincias[n]["votos_validos"]
        escanos = repartir_escanos_con_coaliciones({i: v for i, v in votos.items() if i != "OTROS"}, provincias[n]["escanos"], minimo, n)
        for i, c in escanos.items():
            escanos_por_candidatura[i] += c
        resultado[n] = {"votos": {i: round(v) for i, v in votos.items()}, "cuotas": {i: round(reparto[(n, i)], 5) for i in partidos if (n, i) in reparto}, "escanos": {i: c for i, c in escanos.items() if c}}
    (CARPETA_WEB / "prevision_base.json").write_text(json.dumps({"objetivos": objetivos, "provincias": resultado}, ensure_ascii=False, indent=1), encoding="utf-8")

    print("\nEscaños previstos (suma %d):" % sum(escanos_por_candidatura.values()))
    for i, c in sorted(escanos_por_candidatura.items(), key=lambda par: -par[1]):
        print("  %-9s %3d" % (i, c))
    print("\nProvincias con mayor margen de duda (diferencia entre los dos últimos escaños de cada lista) no calculadas aún; ver prevision_base.json")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
