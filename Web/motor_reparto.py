"""
Motor de reparto de votos entre provincias y de escaños (versión Python, que servirá de espejo del motor JavaScript).

Problema: dado un reparto de partida por provincia (base) y un porcentaje nacional objetivo por partido, hallar el reparto
provincial que cumpla dos condiciones a la vez:
  - en cada provincia, las cuotas de todos los partidos suman 1 (filas);
  - a nivel nacional, la cuota de cada partido (ponderada por los votos válidos de cada provincia) es la objetivo (columnas).

Métodos de reparto comparables:
  - proporcional: cada partido multiplica su cuota por un factor (swing multiplicativo + ajuste proporcional iterativo, «raking»);
  - logit: cada partido suma un desplazamiento δ a la escala logit de su cuota (multiplica sus odds);
  - lineal: cada partido suma los mismos puntos a todas sus provincias, con suelo en cero (el método del Excel de 2019);
  - persistencia y uniforme: referencias sin modelo.
Los ceros estructurales (un partido que no se presenta en una provincia) se indican con el conjunto «presentes».
"""

import math

ITERACIONES_MAXIMAS = 400
TOLERANCIA_DE_COLUMNA = 1e-9
PASOS_DE_BISECCION = 60
LIMITE_DE_DESPLAZAMIENTO = 15.0


class ProblemaDeReparto:
    """Datos de entrada del reparto.

    provincias: lista de nombres.
    partidos: lista de partidos que compiten (los de objetivo cero quedan fuera).
    base: diccionario {(provincia, partido): cuota de partida}, solo para los pares presentes.
    peso: diccionario {provincia: votos válidos a candidaturas} que pondera la agregación nacional.
    objetivo: diccionario {partido: cuota nacional que debe lograrse}; debe sumar 1.
    """

    def __init__(self, provincias, partidos, base, peso, objetivo):
        self.provincias = provincias
        self.partidos = partidos
        self.base = base
        self.peso = peso
        self.objetivo = objetivo
        self.peso_total = sum(peso[provincia] for provincia in provincias)
        self.presentes = set(base.keys())


def logit(cuota):
    return math.log(cuota / (1.0 - cuota))


def cuota_desde_logit(valor_logit):
    return 1.0 / (1.0 + math.exp(-valor_logit))


def cuota_nacional(problema, reparto, partido):
    """Cuota nacional de un partido: media de sus cuotas provinciales ponderada por los votos válidos."""
    votos = 0.0
    for provincia in problema.provincias:
        votos += reparto.get((provincia, partido), 0.0) * problema.peso[provincia]
    return votos / problema.peso_total


def normalizar_filas(problema, reparto):
    for provincia in problema.provincias:
        suma_de_la_fila = 0.0
        for partido in problema.partidos:
            suma_de_la_fila += reparto.get((provincia, partido), 0.0)
        for partido in problema.partidos:
            if (provincia, partido) in reparto:
                reparto[(provincia, partido)] = reparto[(provincia, partido)] / suma_de_la_fila


def error_maximo_de_columna(problema, reparto):
    error_maximo = 0.0
    for partido in problema.partidos:
        diferencia = abs(cuota_nacional(problema, reparto, partido) - problema.objetivo[partido])
        error_maximo = max(error_maximo, diferencia)
    return error_maximo


def buscar_desplazamiento(problema, reparto, partido, aplicar_desplazamiento):
    """Bisección: halla el desplazamiento que lleva la cuota nacional del partido a su objetivo.

    aplicar_desplazamiento(cuota, desplazamiento) devuelve la cuota provincial desplazada; debe ser creciente en el desplazamiento.
    """
    provincias_del_partido = [p for p in problema.provincias if (p, partido) in reparto]
    objetivo = problema.objetivo[partido]
    limite_bajo, limite_alto = -LIMITE_DE_DESPLAZAMIENTO, LIMITE_DE_DESPLAZAMIENTO
    for _ in range(PASOS_DE_BISECCION):
        punto_medio = (limite_bajo + limite_alto) / 2.0
        votos = 0.0
        for provincia in provincias_del_partido:
            cuota_desplazada = aplicar_desplazamiento(reparto[(provincia, partido)], punto_medio)
            votos += cuota_desplazada * problema.peso[provincia]
        if votos / problema.peso_total < objetivo:
            limite_bajo = punto_medio
        else:
            limite_alto = punto_medio
    desplazamiento = (limite_bajo + limite_alto) / 2.0
    for provincia in provincias_del_partido:
        reparto[(provincia, partido)] = aplicar_desplazamiento(reparto[(provincia, partido)], desplazamiento)


def desplazar_en_logit(cuota, desplazamiento):
    cuota_acotada = min(max(cuota, 1e-12), 1.0 - 1e-12)
    return cuota_desde_logit(logit(cuota_acotada) + desplazamiento)


def desplazar_en_lineal(cuota, desplazamiento):
    return max(0.0, cuota + desplazamiento)


def desplazar_en_proporcional(cuota, desplazamiento):
    """Aquí el desplazamiento es el logaritmo del factor multiplicador: exp(d) * cuota."""
    return cuota * math.exp(desplazamiento)


def repartir_con_ajuste_iterativo(problema, aplicar_desplazamiento):
    """Alterna: ajusta cada columna (partido) a su objetivo y normaliza cada fila (provincia) a 1 hasta que ambas cuadran."""
    reparto = dict(problema.base)
    normalizar_filas(problema, reparto)
    for _ in range(ITERACIONES_MAXIMAS):
        for partido in problema.partidos:
            buscar_desplazamiento(problema, reparto, partido, aplicar_desplazamiento)
        normalizar_filas(problema, reparto)
        if error_maximo_de_columna(problema, reparto) < TOLERANCIA_DE_COLUMNA:
            break
    return reparto


def repartir_proporcional(problema):
    return repartir_con_ajuste_iterativo(problema, desplazar_en_proporcional)


def repartir_logit(problema):
    return repartir_con_ajuste_iterativo(problema, desplazar_en_logit)


def repartir_lineal(problema):
    return repartir_con_ajuste_iterativo(problema, desplazar_en_lineal)


def repartir_persistencia(problema):
    """Referencia sin modelo: cada provincia conserva su reparto de partida."""
    reparto = dict(problema.base)
    normalizar_filas(problema, reparto)
    return reparto


def repartir_uniforme(problema):
    """Referencia sin modelo: todas las provincias reciben la cuota nacional, donde el partido está presente."""
    reparto = {}
    for (provincia, partido) in problema.base:
        reparto[(provincia, partido)] = problema.objetivo[partido]
    normalizar_filas(problema, reparto)
    return reparto


def repartir_lineal_por_grupos(problema, grupos_lineales, cuota_nacional_base):
    """Reconstrucción del swing del Excel «Simulador 2019-N» (hoja 2019N), leída de sus fórmulas.

    1. Proyección multiplicativa de cada partido: cuota base de la provincia × (objetivo nacional / cuota nacional base).
    2. Para cada grupo lineal (izquierda, derecha...): swing del grupo = suma de (objetivo - cuota nacional base) de sus partidos;
       la nueva cuota del grupo en cada provincia es su cuota base más ese swing, con suelo en cero.
    3. Dentro del grupo, el reparto entre sus partidos conserva las proporciones de la proyección multiplicativa.
    4. Los partidos que no están en ningún grupo lineal conservan la proyección multiplicativa.
    5. Se normaliza cada provincia a 1 (en el Excel esto se hace a mano con Goal Seek); no se itera sobre las columnas.
    cuota_nacional_base: {partido: cuota nacional de la elección de partida}; debe incluir a los partidos de objetivo cero.
    Un partido nuevo (sin cuota de partida) queda en cero, igual que en el Excel (IFERROR(...;0)): este método no crea partidos.
    """
    multiplicativo = {}
    for (provincia, partido), cuota in problema.base.items():
        cuota_nacional = cuota_nacional_base.get(partido, 0.0)
        factor = problema.objetivo[partido] / cuota_nacional if cuota_nacional > 0 else 0.0
        multiplicativo[(provincia, partido)] = cuota * factor
    reparto = dict(multiplicativo)
    for miembros in grupos_lineales.values():
        cambio_del_grupo = 0.0
        for partido in miembros:
            cambio_del_grupo += problema.objetivo[partido] - cuota_nacional_base.get(partido, 0.0)
        for provincia in problema.provincias:
            miembros_presentes = [partido for partido in miembros if (provincia, partido) in problema.base]
            if not miembros_presentes:
                continue
            cuota_base_del_grupo = sum(problema.base[(provincia, partido)] for partido in miembros_presentes)
            cuota_nueva_del_grupo = max(0.0, cuota_base_del_grupo + cambio_del_grupo)
            suma_multiplicativa = sum(multiplicativo[(provincia, partido)] for partido in miembros_presentes)
            for partido in miembros_presentes:
                if suma_multiplicativa > 0:
                    reparto[(provincia, partido)] = multiplicativo[(provincia, partido)] * cuota_nueva_del_grupo / suma_multiplicativa
                else:
                    reparto[(provincia, partido)] = 0.0
    normalizar_filas(problema, reparto)
    return reparto


def mezclar_repartos(reparto_a, reparto_b, peso_de_b):
    """Media ponderada de dos repartos que cumplen filas y columnas: la mezcla también las cumple."""
    mezcla = {}
    for clave in reparto_a:
        mezcla[clave] = (1.0 - peso_de_b) * reparto_a[clave] + peso_de_b * reparto_b.get(clave, 0.0)
    return mezcla


def repartir_escanos_dhondt(votos_por_lista, escanos, votos_minimos):
    """D'Hondt con barrera: solo participan las listas con al menos votos_minimos votos. Devuelve {lista: escaños}."""
    candidatas = {lista: votos for lista, votos in votos_por_lista.items() if votos >= votos_minimos and votos > 0}
    reparto = {lista: 0 for lista in votos_por_lista}
    for _ in range(escanos):
        mejor_lista = None
        mejor_cociente = -1.0
        for lista, votos in candidatas.items():
            cociente = votos / (reparto[lista] + 1)
            if cociente > mejor_cociente:
                mejor_cociente = cociente
                mejor_lista = lista
        reparto[mejor_lista] += 1
    return reparto


# Coaliciones con reparto interno de escaños por orden de lista (se leen de candidaturas.json, parámetro «coalicion_upn_pp»)
_RUTA_CANDIDATURAS = __import__("pathlib").Path(__file__).resolve().parent / "candidaturas.json"


def leer_coaliciones():
    """{provincia: {"columna", "socio", "orden"}}: la columna lleva los escaños de la coalición y se reparten con el socio según el orden de lista."""
    import json
    configuracion = json.loads(_RUTA_CANDIDATURAS.read_text(encoding="utf-8"))
    coalicion = configuracion["parametros"].get("coalicion_upn_pp")
    if not coalicion:
        return {}
    return {coalicion["provincia"]: {"columna": coalicion["columna"], "socio": coalicion["socio"], "orden": coalicion["orden_de_lista"]}}


COALICIONES = leer_coaliciones()


def repartir_escanos_con_coaliciones(votos_por_lista, escanos, votos_minimos, provincia):
    """D'Hondt con barrera y, si la provincia tiene una coalición, reparto de sus escaños entre la columna y su socio por orden de lista:
    con n escaños, los n primeros puestos de la lista (UPN, PP, PP, UPN, PP en Navarra) se reparten entre los dos partidos."""
    reparto = repartir_escanos_dhondt(votos_por_lista, escanos, votos_minimos)
    coalicion = COALICIONES.get(provincia)
    if coalicion is None or reparto.get(coalicion["columna"], 0) == 0:
        return reparto
    escanos_de_la_coalicion = reparto[coalicion["columna"]]
    puestos = coalicion["orden"][:escanos_de_la_coalicion]
    reparto[coalicion["columna"]] = sum(1 for puesto in puestos if puesto == coalicion["columna"])
    reparto[coalicion["socio"]] = reparto.get(coalicion["socio"], 0) + sum(1 for puesto in puestos if puesto == coalicion["socio"])
    return reparto
