"""
Monte Carlo de escaños sobre el motor de reparto (motor_reparto.py).

En cada sorteo:
  1. Se perturban los objetivos nacionales: un error común por bloque (derecha, izquierda, nacionalistas) en puntos de voto, repartido entre los
     partidos del bloque en proporción a su tamaño, más un error propio de cada partido (log-normal); después se renormaliza a 100 %.
     La correlación entre errores es, por tanto, por bloques; y entre bloques aparece sola por la renormalización.
  2. Opcional (palanca «voto útil al PSOE»): se desplazan puntos hacia el PSOE, restados de los demás con unos pesos dados.
  3. El motor reparte los objetivos por provincia (proporcional con ajuste iterativo).
  4. Se añade ruido log-normal a la cuota de cada partido en cada provincia y se vuelve a cuadrar con el ajuste iterativo.
  5. D'Hondt con barrera del 3 % de votos válidos en cada provincia.
Devuelve los escaños de cada sorteo por partido y por (provincia, partido).
"""

import math
import random
from collections import defaultdict

from motor_reparto import (
    ProblemaDeReparto,
    desplazar_en_proporcional,
    repartir_con_ajuste_iterativo,
    repartir_escanos_dhondt,
    repartir_escanos_con_coaliciones,
)

BARRERA_ELECTORAL = 0.03


def perturbar_objetivos(objetivos, bloques, sigma_bloque, sigma_partido, generador, palanca_psoe=0.0, pesos_palanca=None):
    """objetivos: {partido: cuota 0-1}. bloques: {partido: nombre de bloque o None}. sigma_bloque: {bloque: puntos de voto (0-100)}.
    sigma_partido: {partido: desviación relativa (log)}. palanca_psoe: puntos que pasan al PSOE (restados según pesos_palanca)."""
    cuota_de_bloque = defaultdict(float)
    for partido, cuota in objetivos.items():
        if bloques.get(partido):
            cuota_de_bloque[bloques[partido]] += cuota
    error_de_bloque = {bloque: generador.gauss(0.0, sigma) / 100.0 for bloque, sigma in sigma_bloque.items()}
    # Ruido propio de cada partido (lognormal relativo). Dentro de un bloque solo REPARTE: se reescala para conservar el total del bloque, y el total lo mueve el error de bloque
    con_ruido = {}
    for partido, cuota in objetivos.items():
        con_ruido[partido] = cuota * math.exp(generador.gauss(0.0, sigma_partido.get(partido, 0.0)))
    suma_con_ruido_por_bloque = defaultdict(float)
    for partido, valor in con_ruido.items():
        if bloques.get(partido):
            suma_con_ruido_por_bloque[bloques[partido]] += valor
    nuevos = {}
    for partido, cuota in objetivos.items():
        bloque = bloques.get(partido)
        if bloque and cuota_de_bloque[bloque] > 0 and suma_con_ruido_por_bloque[bloque] > 0:
            total_del_bloque = max(0.05 * cuota_de_bloque[bloque], cuota_de_bloque[bloque] + error_de_bloque.get(bloque, 0.0))
            nuevos[partido] = con_ruido[partido] * total_del_bloque / suma_con_ruido_por_bloque[bloque]
        else:
            nuevos[partido] = con_ruido[partido]
    if palanca_psoe:
        suma_pesos = sum(pesos_palanca.get(partido, 0.0) * nuevos[partido] for partido in nuevos if partido != "PSOE")
        for partido in list(nuevos):
            if partido != "PSOE" and suma_pesos > 0:
                nuevos[partido] -= palanca_psoe / 100.0 * pesos_palanca.get(partido, 0.0) * nuevos[partido] / suma_pesos
                nuevos[partido] = max(nuevos[partido], 0.0)
        nuevos["PSOE"] += palanca_psoe / 100.0
    total = sum(nuevos.values())
    return {partido: cuota / total for partido, cuota in nuevos.items()}


def sigma_por_tramos(tramos_de_la_clase, cuota):
    """tramos_de_la_clase: lista de (cuota mínima, sigma) de mayor a menor cuota mínima; devuelve la sigma del primer tramo cuya cuota mínima se alcanza."""
    for cuota_minima, sigma in tramos_de_la_clase:
        if cuota >= cuota_minima:
            return sigma
    return tramos_de_la_clase[-1][1]


def ruido_provincial(reparto, sigma_partido_provincial, generador, tramos_provinciales=None, clase_de_partido=None, factor_sigma_provincial=None):
    """Ruido lognormal por provincia y partido. Con tramos_provinciales (calibrados con 15 transiciones históricas) la sigma depende de la clase del partido y de su cuota."""
    ruidoso = {}
    for (provincia, partido), cuota in reparto.items():
        if tramos_provinciales and clase_de_partido and partido in clase_de_partido:
            sigma = sigma_por_tramos(tramos_provinciales[clase_de_partido[partido]], cuota)
        else:
            sigma = sigma_partido_provincial.get(partido, 0.0)
        if factor_sigma_provincial:
            sigma *= factor_sigma_provincial.get(provincia, 1.0)   # más incertidumbre donde no hay encuestas locales (24/11/2026)
        ruidoso[(provincia, partido)] = cuota * math.exp(generador.gauss(0.0, sigma))
    return ruidoso


def simular(problema, bloques, sigma_bloque, sigma_partido, sigma_partido_provincial, votos_validos_por_provincia, escanos_por_provincia,
            sorteos, semilla, partidos_sin_escano=("OTROS",), palanca_media=0.0, palanca_sigma=0.0, pesos_palanca=None, tramos_provinciales=None, clase_de_partido=None, recolector_senado=None, factor_sigma_provincial=None):
    """Devuelve (escanos_nacionales: lista de dicts por sorteo, escanos_provinciales: lista de dicts {(provincia, partido): n})."""
    generador = random.Random(semilla)
    nacionales = []
    provinciales = []
    for _ in range(sorteos):
        palanca = generador.gauss(palanca_media, palanca_sigma) if (palanca_media or palanca_sigma) else 0.0
        objetivos = perturbar_objetivos(problema.objetivo, bloques, sigma_bloque, sigma_partido, generador, palanca, pesos_palanca)
        primer_problema = ProblemaDeReparto(problema.provincias, problema.partidos, problema.base, problema.peso, objetivos)
        reparto = repartir_con_ajuste_iterativo(primer_problema, desplazar_en_proporcional)
        ruidoso = ruido_provincial(reparto, sigma_partido_provincial, generador, tramos_provinciales, clase_de_partido, factor_sigma_provincial)
        segundo_problema = ProblemaDeReparto(problema.provincias, problema.partidos, ruidoso, problema.peso, objetivos)
        reparto_final = repartir_con_ajuste_iterativo(segundo_problema, desplazar_en_proporcional)
        if recolector_senado is not None:
            recolector_senado.registrar(reparto_final)
        total_nacional = defaultdict(int)
        total_provincial = {}
        for provincia in problema.provincias:
            votos = {}
            for partido in problema.partidos:
                if partido in partidos_sin_escano or (provincia, partido) not in reparto_final:
                    continue
                votos[partido] = reparto_final[(provincia, partido)] * problema.peso[provincia]
            minimo = BARRERA_ELECTORAL * votos_validos_por_provincia[provincia]
            escanos = repartir_escanos_con_coaliciones(votos, escanos_por_provincia[provincia], minimo, provincia)
            for partido, cantidad in escanos.items():
                if cantidad:
                    total_nacional[partido] += cantidad
                    total_provincial[(provincia, partido)] = cantidad
        nacionales.append(dict(total_nacional))
        provinciales.append(total_provincial)
    return nacionales, provinciales


def percentil(valores_ordenados, fraccion):
    posicion = fraccion * (len(valores_ordenados) - 1)
    inferior = int(math.floor(posicion))
    superior = min(inferior + 1, len(valores_ordenados) - 1)
    return valores_ordenados[inferior] + (valores_ordenados[superior] - valores_ordenados[inferior]) * (posicion - inferior)


def resumir_nacional(nacionales, partidos):
    """Por partido: media, mediana y límites del 80 % y del 95 %."""
    resumen = {}
    for partido in partidos:
        valores = sorted(sorteo.get(partido, 0) for sorteo in nacionales)
        resumen[partido] = {
            "media": sum(valores) / len(valores), "mediana": percentil(valores, 0.5),
            "p10": percentil(valores, 0.10), "p90": percentil(valores, 0.90), "p025": percentil(valores, 0.025), "p975": percentil(valores, 0.975),
            "minimo": valores[0], "maximo": valores[-1],
        }
    return resumen
