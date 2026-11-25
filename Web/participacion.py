"""
Participación prevista para las generales de 2026 y su incertidumbre, sobre el censo de residentes (CER). (25/11/2026, decisiones del usuario)

Nacional: PARTICIPACION_NACIONAL (mediana de las casas con media tendencia; Informes/Participacion_acierto.md) y desviación SIGMA_NACIONAL, en puntos.
Provincias: todas se mueven en la misma proporción desde su participación de 2023 (desplazamiento común en logit sobre base_2026.json), de modo que la suma ponderada por censo
dé la nacional. El CIS no mejora ese reparto de forma demostrable (Informes/Participacion_provincias_CIS.md) y las sensibilidades por provincia tampoco
(Informes/Participacion_sensibilidad_provincial.md).
Ruido para los rangos de votos: un choque nacional, uno común a cada comunidad y uno propio de cada provincia, en puntos de participación. Los dos últimos salen de cuánto se apartó
cada comunidad y cada provincia de «moverse como España» en las seis transiciones 2008-2023 (historico/participacion_cer.csv); se excluye el País Vasco en 2008-2011, cuya subida tiene
una causa conocida e irrepetible (legalización de la izquierda abertzale). La desviación de cada comunidad se encoge hacia la media de todas (PESO_DE_LA_PROPIA).
"""

import csv
import math
from collections import defaultdict
from pathlib import Path

CARPETA = Path(__file__).resolve().parent
RUTA_HISTORICO = CARPETA / "historico" / "participacion_cer.csv"
PARTICIPACION_NACIONAL = 75.0
SIGMA_NACIONAL = 2.5
PESO_DE_LA_PROPIA = 0.7   # varianza de la comunidad = 0,7 x la suya + 0,3 x la media de todas: pocas elecciones para fiarse del todo de la suya
ELECCIONES = ["2008", "2011", "2015", "2016", "2019A", "2019N", "2023"]
EXCLUIDOS = {("País Vasco", "2011")}   # (comunidad, elección de llegada)


def logit(p):
    return math.log(p / (1 - p))


def inversa(v):
    return 1 / (1 + math.exp(-v))


def desplazar_hasta(logits, pesos, objetivo):
    """Participación de cada provincia tras sumar en logit el desplazamiento común que deja la media ponderada en «objetivo» (proporción)."""
    bajo, alto = -3.0, 3.0
    for _ in range(80):
        medio = (bajo + alto) / 2
        media = sum(pesos[p] * inversa(logits[p] + medio) for p in logits) / sum(pesos[p] for p in logits)
        bajo, alto = (medio, alto) if media < objetivo else (bajo, medio)
    return {p: inversa(logits[p] + (bajo + alto) / 2) for p in logits}


def prevista(provincias_base):
    """{provincia: participación prevista (proporción)} con base_2026.json['provincias'] (electores de 2026 y participacion_base de 2023)."""
    logits = {nombre: logit(datos["participacion_base"]) for nombre, datos in provincias_base.items()}
    pesos = {nombre: datos["electores"] for nombre, datos in provincias_base.items()}
    return desplazar_hasta(logits, pesos, PARTICIPACION_NACIONAL / 100)


def sigmas(comunidad_de_cada_provincia):
    """{provincia: (sigma del choque de su comunidad, sigma propia)} en puntos, medidos en el histórico."""
    censo, votantes = defaultdict(dict), defaultdict(dict)
    with open(RUTA_HISTORICO, encoding="utf-8") as fichero:
        for fila in csv.DictReader(fichero):
            censo[fila["eleccion"]][fila["provincia"]] = int(fila["censo"])
            votantes[fila["eleccion"]][fila["provincia"]] = int(fila["votantes"])
    desvios_de_comunidad = defaultdict(list)
    cuadrados_propios = []
    for anterior, actual in zip(ELECCIONES, ELECCIONES[1:]):
        provincias = list(censo[actual])
        logits = {p: logit(votantes[anterior][p] / censo[anterior][p]) for p in provincias}
        nacional = sum(votantes[actual].values()) / sum(censo[actual].values())
        prediccion = desplazar_hasta(logits, censo[actual], nacional)
        desvio = {p: 100 * (votantes[actual][p] / censo[actual][p] - prediccion[p]) for p in provincias}
        por_comunidad = defaultdict(list)
        for p in provincias:
            por_comunidad[comunidad_de_cada_provincia[p]].append(p)
        for comunidad, suyas in por_comunidad.items():
            if (comunidad, actual) in EXCLUIDOS:
                continue
            medio = sum(censo[actual][p] * desvio[p] for p in suyas) / sum(censo[actual][p] for p in suyas)
            desvios_de_comunidad[comunidad].append(medio)
            if len(suyas) > 1:
                cuadrados_propios += [(desvio[p] - medio) ** 2 for p in suyas]
    varianzas = {comunidad: sum(d * d for d in lista) / len(lista) for comunidad, lista in desvios_de_comunidad.items()}
    media = sum(varianzas.values()) / len(varianzas)
    sigma_propia = math.sqrt(sum(cuadrados_propios) / len(cuadrados_propios))
    return {p: (math.sqrt(PESO_DE_LA_PROPIA * varianzas[c] + (1 - PESO_DE_LA_PROPIA) * media), sigma_propia) for p, c in comunidad_de_cada_provincia.items()}


def bloque_para_el_modelo(provincias_base, comunidad_de_cada_provincia):
    """Lo que se guarda en datos_modelo.json («participacion»): nacional, sigma nacional y por provincia la participación, los electores, la fracción de votantes con voto a candidaturas y las sigmas."""
    participaciones = prevista(provincias_base)
    ruido = sigmas(comunidad_de_cada_provincia)
    return {"nacional": PARTICIPACION_NACIONAL, "sigma_nacional": SIGMA_NACIONAL,
            "provincias": {nombre: {"participacion": round(100 * participaciones[nombre], 3), "base_2023": round(100 * datos["participacion_base"], 3), "electores": datos["electores"],
                                    "a_candidaturas": round(datos["votos_candidaturas"] / datos["votantes"], 6), "comunidad": comunidad_de_cada_provincia[nombre],
                                    "sigma_comunidad": round(ruido[nombre][0], 3), "sigma_provincia": round(ruido[nombre][1], 3)} for nombre, datos in provincias_base.items()}}
