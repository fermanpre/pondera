"""
Blend con las encuestas subnacionales (comunidad y provincia). (17/11/2026)

Parte del problema de reparto que ya incluye el promedio nacional (objetivos) y el ancla del CIS (base_2026.json) y lo acerca a las encuestas de cada territorio con al menos una encuesta (desde el 22/11/2026; antes, dos en las comunidades)
en el promedio regional. Decisión del usuario (17/11/2026): lambda 1 y k0 3.

  - Promedio regional de cada territorio con las MISMAS reglas que el nacional: se construyen encuestas con la estructura de promedio.py y se llama a promedio.calcular_promedio (nota de la
    casa, factor de muestra, saturación por casa, día medio del campo con su vida media, exclusión de solapadas de una misma casa, tope de 15 días de campo y corrección de las encuestas de
    parte). Diferencias: ventana de VENTANA_DIAS días (90) en lugar de 30, vida media mínima de VIDA_MEDIA_DIAS días (21) en lugar de la que baja a 3 días cerca de la elección (con tan pocas encuestas por territorio las anulaba; Informes/tolerancia_retro.md) y filtro de cifras atípicas regional (la cifra de IE de Iustitia Europa se descarta y las casas con cifras
    descartadas pesan la mitad). Cuentan las encuestas de ERC y de Justice Europe. Las filas de resultados de elecciones que Wikipedia intercala no son encuestas.
  - Peso del territorio: w = LAMBDA x k / (k + K0), con k el número de encuestas que entran en su promedio. Objetivo T = (1 - w) x modelo + w x encuesta, con la encuesta repartida entre los
    bloques que cubre (conservando la masa que esos bloques tenían en el modelo): la encuesta aporta la forma, no los blancos ni el total.
  - Los partidos de un solo territorio (PNV, Bildu, BNG, ERC, Junts y FV) siguen a sus encuestas también en el total nacional; el cambio se compensa dentro de su bloque (eje izquierda/derecha
    de candidaturas.json: Junts, PNV y CC en la derecha), de modo que cada bloque conserva el total del promedio nacional.
  - Ajuste proporcional iterativo: cada fila suma 100, los totales nacionales (los de los partidos libres, los que salen del propio reparto) coinciden y los territorios con encuestas
    alcanzan su objetivo en la medida en que los totales lo permiten.
CONSISTENTE = False: los partidos estatales siguen a las encuestas en cada territorio cubierto (versión «original» de Informes/blend_bloques.md); con True, las encuestas solo reparten entre
los territorios cubiertos.
Informes: Informes/comparacion_modelos_retro.md y Informes/blend_bloques.md (pruebas hacia atrás de 2019 y 2023).
"""

import csv
import json
import re
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

CARPETA_WEB = Path(__file__).resolve().parent
sys.path.insert(0, str(CARPETA_WEB.parent / "Sondeos"))
import detectar_cifras_atipicas as atipicas  # noqa: E402
import filtro_atipicos  # noqa: E402
import promedio  # noqa: E402
import solapamiento_de_campo  # noqa: E402
from motor_reparto import ProblemaDeReparto, repartir_proporcional  # noqa: E402

RUTA_ENCUESTAS = CARPETA_WEB.parent / "Sondeos" / "sondeos_regionales_largo.csv"
# Encuestas regionales o provinciales que ningún extractor recoge (p. ej. los gráficos de Ágora Integral por provincia, 22/11/2026): mismo formato que el fichero anterior, que se regenera en cada ciclo; este es persistente
RUTA_ENCUESTAS_MANUALES = CARPETA_WEB.parent / "Sondeos" / "encuestas_regionales_manuales.csv"
LAMBDA = 1.0
K0 = 3.0
MINIMO_DE_ENCUESTAS = 1  # desde el 22/11/2026 también las comunidades con una sola encuesta (antes dos); su peso es w = k / (k + K0), así que una sola pesa 0,25
VENTANA_DIAS = 90
VIDA_MEDIA_DIAS = 21  # vida media mínima del peso por antigüedad en los promedios regionales (la regla nacional la baja a 3 días cerca de la elección y anula las encuestas de más de dos semanas)
CONSISTENTE = False
RONDAS = 300
MUESTRA_SI_NO_CONSTA = 400  # muestra que se supone a una encuesta sin tamaño de muestra al calcular el ruido de un promedio (una encuesta provincial típica)
DERIVA_DIARIA = 0.001  # desviación típica (en tanto por uno) que acumula una cuota por raíz de día: unos 0,1 puntos por √día, lo que se mueve el promedio nacional
EFECTO_DE_DISENO = 1.25  # las encuestas por cuotas tienen más varianza que el muestreo aleatorio simple (+25 %)
# Error relativo del modelo en una provincia (σ de log(real/previsto), Web/simular_prevision.SIGMA_PROVINCIAL_CALIBRADA): clase de partido y tramo de cuota (cuota mínima, sigma)
CLASE_DE_BLOQUE = {"PP": "GRANDE", "PSOE": "GRANDE", "VOX": "VOX", "IZQ": "IZQ_ALT", "FV": "IZQ_ALT", "ERC": "REGIONAL", "JUNTS": "REGIONAL", "BILDU": "REGIONAL", "PNV": "REGIONAL", "BNG": "REGIONAL", "CC": "REGIONAL", "UPC": "IZQ_ALT", "ADELANTE": "IZQ_ALT"}
SIGMA_DEL_MODELO = {"GRANDE": [(0.30, 0.095), (0.15, 0.14), (0.0, 0.25)], "VOX": [(0.15, 0.08), (0.0, 0.13)], "IZQ_ALT": [(0.15, 0.17), (0.05, 0.19), (0.0, 0.24)],
                    "REGIONAL": [(0.30, 0.05), (0.15, 0.08), (0.0, 0.10)]}
# Calibración del 19/11/2026 de la forma provincial de los partidos regionales (Sondeos/calibrar_forma_regionales.py): error log(real / previsto) con previsto = cuota de la elección anterior x (total nuevo / total
# anterior), solo elecciones consecutivas. BNG (8 transiciones, 4 provincias): 0,066. ERC (10 transiciones): 0,118 por debajo del 15 % y 0,066 entre el 15 y el 30 %. PNV (15 transiciones): 0,114 entre el 15 y el 30 %.
# La σ de la simulación (0,14 para regionales por debajo del 15 %) mezcla otras fuentes de error; para el peso de las encuestas provinciales se usa la de la forma sola.
# Forma de PP, PSOE y Vox dentro de su comunidad (calibrar_forma_grandes.py, 20/11/2026, 10 elecciones, comunidades con 2 o más provincias): PP 0,039 (cuota >= 30 %), 0,052 (15-30 %) y 0,055 (< 15 %);
# PSOE 0,037, 0,049 y 0,021; Vox 0,040 (15-30 %) y 0,067 (< 15 %). Se usa cuando la comunidad de la provincia tiene su propio promedio de encuestas (su total está anclado y solo queda la forma). La σ de 0,095 de
# GRANDE (dado el total nacional) incluye además el error del total de la comunidad (unos 0,087), que en esas provincias ya está corregido por la encuesta de la comunidad.
SIGMA_DENTRO_DE_LA_COMUNIDAD = {"GRANDE": [(0.30, 0.04), (0.15, 0.05), (0.0, 0.055)], "VOX": [(0.15, 0.04), (0.0, 0.067)]}
SIGMA_PROPIA_DE_BLOQUE = {"BNG": 0.07,  # el BNG en Galicia es el más estable (0,066 medido, 0,07 con margen por las pocas elecciones)
                          "CC": 0.25}   # CC en 2026 va en coalición con Primero Canarias (escisión de Nueva Canarias): la σ de elecciones pasadas (0,10 por debajo del 15 %) no recoge ese cambio. Valor del 22/11/2026, sin medir
ERROR_DE_CASA_PUNTOS = 2.0  # error sistemático de una casa de nota n, en puntos de voto: ERROR_DE_CASA_PUNTOS x (1 - n); la nota es la de la hoja «Notas» (0,2 si la casa no figura)
PESO_POR_VARIANZA_EN_PROVINCIAS = True  # provincias: w de cada bloque = V modelo / (V modelo + V encuesta); comunidades: w = k / (k + K0)
RESULTADO_DE_ELECCION = re.compile(r"elections?", re.IGNORECASE)
# Bloques que solo se usan en los indicios territoriales manuales (Sondeos/indicios_territoriales.csv); no entran en el promedio de las encuestas regionales
BLOQUES_MANUALES = {"FA": ["SUMAR"], "EXISTE": ["EXISTE"], "GBAI": ["GBAI"]}
RUTA_INDICIOS = CARPETA_WEB.parent / "Sondeos" / "indicios_territoriales.csv"
BLOQUES = {"PP": ["PP"], "PSOE": ["PSOE"], "VOX": ["VOX"], "IZQ": ["SUMAR", "PODEMOS"], "FV": ["FV"], "ERC": ["ERC"], "JUNTS": ["JUNTS"], "BILDU": ["BILDU"], "PNV": ["PNV"], "BNG": ["BNG"], "CC": ["CC"], "UPC": ["UPC"], "ADELANTE": ["ADELANTE"]}
LIBRES = ("PNV", "BILDU", "BNG", "ERC", "JUNTS", "FV", "UPC", "CC", "ADELANTE", "GBAI")   # UPC, CC y Adelante Andalucía (22/11/2026): partidos de un solo territorio que siguen a sus encuestas también en el total nacional; Geroa Bai (solo Navarra), igual
# Columna de la tabla de Wikipedia -> candidatura del modelo -> nombre nacional (para la corrección de partido y las medias)
CANDIDATURA_DE_COLUMNA = {"PP": "PP", "PSOE": "PSOE", "PSE–EE (PSOE)": "PSOE", "PSdeG–PSOE": "PSOE", "PSC": "PSOE", "Vox": "VOX", "Sumar": "SUMAR", "FA": "SUMAR", "CHA": "SUMAR", "Podemos": "PODEMOS",  # CHA (Aragón, 22/11/2026): va dentro del Frente Amplio (CHA-FA), así que su columna suma a la de Sumar; sin ella la encuesta de A+M daba solo 5,4 en lugar de 12,0
                          
                          "Podem": "PODEMOS", "FV": "FV", "Compromís": "FV", "ERC": "ERC", "Junts": "JUNTS", "EH Bildu": "BILDU", "PNV": "PNV", "BNG": "BNG", "CCa": "CC", "UPC": "UPC", "Adelante Andalucía (2021)": "ADELANTE", "Adelante Andalucía": "ADELANTE"}
NOMBRE_NACIONAL = {"PP": "PP", "PSOE": "PSOE", "VOX": "Vox", "SUMAR": "Sumar", "PODEMOS": "Podemos", "FV": "FV", "ERC": "ERC", "JUNTS": "Junts", "BILDU": "EH Bildu", "PNV": "PNV", "BNG": "BNG", "CC": "CCa", "UPC": "UPC", "ADELANTE": "Adelante Andalucía"}
CANDIDATURA_DE_NOMBRE_NACIONAL = {v: k for k, v in NOMBRE_NACIONAL.items()}
BLOQUE_DE_CANDIDATURA = {i: b for b, ids in BLOQUES.items() for i in ids}
COLUMNAS_QUE_SE_SOLAPAN = [("Sumar", ["Podemos", "IU", "Unidas Podemos"]), ("FA", ["Podemos", "IU"])]
# Podemos concurre por separado del Frente Amplio en todas partes salvo en Canarias, la Comunitat Valenciana y Cataluña (donde va en candidaturas conjuntas: con ERC en Cataluña, sus candidatos son los
# números 6, 8 y 9 de la lista por Barcelona). Por eso, fuera de esos tres territorios la columna de Podemos de una encuesta NO se solapa con la de Sumar/FA y se conserva; dentro de ellos sí se descarta
# (el voto de Podemos va ya en la columna de la candidatura conjunta). Corrección del 24/11/2026, a partir de lo que dijo el usuario; antes se descartaba en todas partes salvo en dos encuestas (Social Data y
# CENTRA, en Andalucía). «IU» se sigue solapando con Sumar/FA en todos los territorios.
COMUNIDADES_DONDE_PODEMOS_VA_EN_COALICION = {"Canarias", "Comunitat Valenciana", "Cataluña"}
PROVINCIAS_DONDE_PODEMOS_VA_EN_COALICION = {"Barcelona", "Girona", "Lleida", "Tarragona", "Alicante/Alacant", "Castellón/Castelló", "Valencia/València", "Palmas (Las)", "Santa Cruz de Tenerife"}
COLUMNAS_DE_PODEMOS = {"Podemos", "Unidas Podemos"}
ENCUESTAS_CON_PODEMOS_APARTE = set()   # excepciones puntuales, si hicieran falta: (casa tal como viene en la fuente, unidad, fin de campo en ISO)


def podemos_va_en_coalicion(unidad):
    """True si Podemos no concurre por separado en esa unidad (comunidad o provincia de Canarias, Valencia o Cataluña)."""
    tipo, nombre = unidad
    return nombre in (COMUNIDADES_DONDE_PODEMOS_VA_EN_COALICION if tipo == "comunidad" else PROVINCIAS_DONDE_PODEMOS_VA_EN_COALICION)


# Columnas de las encuestas regionales que no pasan al blend (no tienen bloque propio) pero sí se enseñan en el promedio de cada territorio (22/11/2026): columna de Wikipedia -> candidatura del modelo
CANDIDATURA_PARA_MOSTRAR = {"Adelante Andalucía (2021)": "ADELANTE", "Adelante Andalucía": "ADELANTE", "SALF": "SALF", "UPN": "UPN", "CCa": "CC", "Existe": "EXISTE", "GBai": "GBAI", "PACMA": "PACMA"}
COMUNIDADES = {
    "Andalusia": "Andalucía", "Aragon": "Aragón", "Asturias": "Asturias", "Balearic Islands": "Illes Balears", "Basque Country": "País Vasco", "Canary Islands": "Canarias",
    "Cantabria": "Cantabria", "Castile and León": "Castilla y León", "Castilla–La Mancha": "Castilla-La Mancha", "Catalonia": "Cataluña", "Extremadura": "Extremadura",
    "Galicia": "Galicia", "La Rioja": "La Rioja", "Madrid": "Comunidad de Madrid", "Murcia": "Región de Murcia", "Navarre": "Navarra", "Valencian Community": "Comunitat Valenciana",
    "Ceuta": "Ceuta", "Melilla": "Melilla"}
PROVINCIAS_CON_NOMBRE_DISTINTO = {"A Coruña": "Coruña (A)", "Álava": "Araba/Álava", "Alicante": "Alicante/Alacant", "Biscay": "Bizkaia", "Castellón": "Castellón/Castelló", "Las Palmas": "Palmas (Las)",
                                  "Seville": "Sevilla", "Valencia": "Valencia/València"}


def unidad_de_region(region, nombres_de_provincia):
    if region in COMUNIDADES:
        return ("comunidad", COMUNIDADES[region])
    nombre = PROVINCIAS_CON_NOMBRE_DISTINTO.get(region, region)
    return ("provincia", nombre) if nombre in nombres_de_provincia else None


def leer_encuestas(dia, nombres_de_provincia):
    """{unidad: [encuesta con la estructura de promedio.py, con los valores en nombres nacionales]} de los VENTANA_DIAS días anteriores a «dia»."""
    desde = dia - timedelta(days=VENTANA_DIAS)
    brutas = defaultdict(dict)
    filas_de_encuestas = []
    for ruta_de_encuestas in (RUTA_ENCUESTAS, RUTA_ENCUESTAS_MANUALES):
        if ruta_de_encuestas.exists():
            with open(ruta_de_encuestas, encoding="utf-8-sig", newline="") as fichero:
                filas_de_encuestas.extend(csv.DictReader(fichero, delimiter=";"))
    if True:
        for fila in filas_de_encuestas:
            if fila["es_resultado_real"] == "1" or fila["porcentaje"] == "" or not fila["fin_campo"] or promedio.RECALCULO_DEL_CIS.match(fila["firma"]) or RESULTADO_DE_ELECCION.search(fila["firma"]):
                continue
            unidad = unidad_de_region(fila["region"], nombres_de_provincia)
            if unidad is None:
                continue
            anio, mes, dia_fin = (int(x) for x in fila["fin_campo"].split("-"))
            fin = date(anio, mes, max(dia_fin, 1))
            if fin > dia or fin < desde:
                continue
            clave = (fila["firma"], fila["cliente"], fila["fecha_texto"], fila["fin_campo"], fila["muestra"])
            if clave not in brutas[unidad]:
                inicio_original = solapamiento_de_campo.inicio_de_campo(fila["fecha_texto"], fin)
                recortado = (fin - inicio_original).days + 1 > promedio.DIAS_MAXIMOS_DE_CAMPO
                inicio = fin - timedelta(days=promedio.DIAS_DE_CAMPO_EQUIVALENTES - 1) if recortado else inicio_original
                brutas[unidad][clave] = {
                    "firma": promedio.normalizar_firma(fila["firma"]), "firma_original": fila["firma"], "fin": fin, "inicio": inicio, "inicio_original": inicio_original,
                    "campo_recortado": recortado, "medio": (inicio.toordinal() + fin.toordinal()) / 2, "muestra": int(fila["muestra"]) if fila["muestra"].strip().isdigit() else None,
                    "clave": clave, "cliente": fila["cliente"], "fecha_texto": fila["fecha_texto"], "valores": {}, "columnas": {}}
            brutas[unidad][clave]["columnas"][fila["partido"].replace("–", "–").replace("‑", "–").strip()] = float(fila["porcentaje"])
    resultado = {}
    for unidad, por_clave in brutas.items():
        lista = []
        for encuesta in por_clave.values():
            columnas = encuesta.pop("columnas")
            podemos_aparte = (encuesta["firma_original"], unidad[1], encuesta["fin"].isoformat()) in ENCUESTAS_CON_PODEMOS_APARTE or not podemos_va_en_coalicion(unidad)
            for principal, solapadas in COLUMNAS_QUE_SE_SOLAPAN:
                if principal in columnas:
                    for solapada in solapadas:
                        if podemos_aparte and solapada in COLUMNAS_DE_PODEMOS:
                            continue
                        columnas.pop(solapada, None)
            valores = defaultdict(float)
            for columna, porcentaje in columnas.items():
                candidatura = CANDIDATURA_DE_COLUMNA.get(columna)
                if candidatura:
                    valores[NOMBRE_NACIONAL[candidatura]] += porcentaje
                elif columna not in ("IE",):
                    valores[columna] += porcentaje  # partidos sin candidatura propia en el modelo: se conservan para que el filtro y el reescalado sean los de siempre
            encuesta["valores"] = dict(valores)
            lista.append(encuesta)
        resultado[unidad] = lista
    return resultado


def dias_de_campo(encuesta):
    """Días de campo (ordinales) de una entrega."""
    return list(range(encuesta["inicio"].toordinal(), encuesta["fin"].toordinal() + 1))


def entregas_vigentes(encuestas):
    """Mismo criterio que el promedio nacional (EXCLUSION_DE_SOLAPADAS, decisión del 17/11/2026): de cada casa se queda la última entrega y las anteriores que no se pisan con ella. Cada entrega guarda
    sus días de campo («dias») y las entrevistas por día («muestra_por_dia»), para poder quitar luego los días que ya cubre un detalle provincial."""
    vigentes = solapamiento_de_campo.sin_solapes(encuestas, lambda e: e["firma"]) if promedio.EXCLUSION_DE_SOLAPADAS["activo"] else list(encuestas)
    resultado = []
    for encuesta in vigentes:
        anotada = dict(encuesta)
        anotada["dias"] = {dia: 1.0 for dia in dias_de_campo(encuesta)}
        anotada["muestra_por_dia"] = (encuesta["muestra"] or MUESTRA_SI_NO_CONSTA) / len(anotada["dias"])
        resultado.append(anotada)
    return resultado


def muestra_efectiva(dias, entrevistas_por_dia):
    """Muestra efectiva de la media de varias entregas con solape: n_dia x (suma a_d)^2 / (suma a_d^2)."""
    if not dias:
        return 0.0
    return entrevistas_por_dia * sum(dias.values()) ** 2 / sum(a * a for a in dias.values())


def quitar_dias_con_detalle_provincial(por_unidad, provincias_de):
    """Regla del 19/11/2026: una encuesta que da datos por provincia ya está en las provincias y no se vuelve a usar en el blend de su comunidad. En cada comunidad, para cada casa con detalle provincial se
    quitan los días de campo que ese detalle cubre: lo que queda de la encuesta de la comunidad son las entrevistas de los días que ninguna provincia cubre (con su muestra efectiva), o nada.
    El porcentaje de la entrega sigue siendo el de toda su ventana (no se puede separar el de los días nuevos): por eso solo pesa la muestra de los días nuevos."""
    descartadas = []
    for unidad, encuestas in list(por_unidad.items()):
        if unidad[0] != "comunidad":
            continue
        cubiertos = defaultdict(set)
        for provincia in provincias_de.get(unidad, []):
            for encuesta in por_unidad.get(("provincia", provincia), []):
                cubiertos[(encuesta["firma"], encuesta["cliente"])].update(encuesta["dias"])
        restantes = []
        for encuesta in encuestas:
            propios = cubiertos.get((encuesta["firma"], encuesta["cliente"]))
            if not propios:
                restantes.append(encuesta)
                continue
            nuevos = {dia: a for dia, a in encuesta["dias"].items() if dia not in propios}
            muestra_nueva = muestra_efectiva(nuevos, encuesta["muestra_por_dia"])
            descartadas.append((unidad, encuesta["firma_original"], encuesta["fecha_texto"], round(muestra_nueva)))
            if muestra_nueva < 1:
                continue
            reducida = dict(encuesta)
            reducida["muestra"] = int(round(muestra_nueva))
            restantes.append(reducida)
        por_unidad[unidad] = restantes
    return descartadas


def promedios_por_unidad(dia, nombres_de_provincia, rating, provincias_de=None, detalle=None):
    """{unidad: ({bloque: cuota en tanto por uno}, k, ruido)} de los territorios con al menos MINIMO_DE_ENCUESTAS encuestas en su promedio (una en las provincias con peso por varianza).
    «ruido» = (suma(w^2 / n), suma(w^2 x días de antigüedad), suma(w^2 x error de casa^2)) / suma(w)^2 de las encuestas del promedio.
    Con «detalle» (un diccionario) rellena además, para mostrarlo en la web (21/11/2026): {unidad: {"k", "medias": {candidatura: porcentaje}, "encuestas": [{casa, fin, muestra, peso}]}}."""
    por_unidad_completo = {unidad: entregas_vigentes(lista) for unidad, lista in leer_encuestas(dia, nombres_de_provincia).items()}
    por_unidad = dict(por_unidad_completo)
    if provincias_de:
        quitar_dias_con_detalle_provincial(por_unidad, provincias_de)
    # Para enseñarlo (22/11/2026) cada comunidad se promedia también con todas sus encuestas, aunque alguna ya esté en sus provincias; para el blend solo cuentan las que quedan tras quitar lo que cubren las provincias
    trabajos = [(unidad, encuestas, True) for unidad, encuestas in por_unidad.items()]
    trabajos += [(unidad, encuestas, False) for unidad, encuestas in por_unidad_completo.items() if unidad[0] == "comunidad" and detalle is not None]
    ultimos = {}
    for region, (_lista, resultados) in atipicas.encuestas_regionales().items():
        unidad = unidad_de_region(region, nombres_de_provincia)
        if unidad:
            ultimos[unidad] = resultados
    penalizadas = {firma: filtro_atipicos.RECORTE_DE_PESO_DE_CASA for firma in filtro_atipicos.casas_penalizadas(promedio.normalizar_firma)}
    resultado = {}
    ventana, filtro, ajuste, vida = promedio.VENTANA_DIAS, dict(promedio.FILTRO_DE_ATIPICAS), dict(promedio.AJUSTE_MANUAL_DE_PESO), promedio.vida_media_minima
    try:
        promedio.vida_media_minima = lambda dias: float(VIDA_MEDIA_DIAS)
        promedio.VENTANA_DIAS = VENTANA_DIAS
        promedio.FILTRO_DE_ATIPICAS["activo"] = False
        promedio.AJUSTE_MANUAL_DE_PESO.update(penalizadas)
        for unidad, encuestas, para_el_blend in trabajos:
            encuestas, _descartes = filtro_atipicos.filtrar(encuestas, ultimos.get(unidad, {}), atipicas.EQUIVALENCIAS_REGIONALES)
            encuestas = [e for e in encuestas if e["valores"]]
            minimo = MINIMO_DE_ENCUESTAS
            if len(encuestas) < minimo:
                continue
            pesos = []
            medias, cuenta, usadas, _vida, _recientes = promedio.calcular_promedio(rating, hoy=dia, fecha_eleccion=promedio.FECHA_ELECCION, escribir=False, encuestas_leidas=encuestas, pesos_por_encuesta=pesos)
            if usadas < minimo:
                continue
            suma_pesos = sum(peso for _e, peso, _n in pesos)
            if suma_pesos > 0:
                ruido = (sum(peso * peso / (e["muestra"] or MUESTRA_SI_NO_CONSTA) for e, peso, _n in pesos) / suma_pesos ** 2,
                         sum(peso * peso * max(0.0, dia.toordinal() - e["medio"]) for e, peso, _n in pesos) / suma_pesos ** 2,
                         sum((peso * ERROR_DE_CASA_PUNTOS / 100.0 * (1.0 - rating.get(e["firma"], promedio.RATING_FIRMA_DESCONOCIDA))) ** 2 for e, peso, _n in pesos) / suma_pesos ** 2)
            else:
                ruido = (0.0, 0.0, 0.0)
            por_bloque = defaultdict(float)
            for nombre, valor in medias.items():
                candidatura = CANDIDATURA_DE_NOMBRE_NACIONAL.get(nombre)
                bloque = BLOQUE_DE_CANDIDATURA.get(candidatura)
                if bloque and cuenta[nombre] * 2 >= usadas:
                    por_bloque[bloque] += valor / 100.0
            if len(por_bloque) >= 3:
                if para_el_blend:
                    resultado[unidad] = (dict(por_bloque), usadas, ruido)
                if detalle is not None:
                    medias_por_candidatura = {}
                    for nombre, valor in medias.items():
                        if cuenta[nombre] * 2 < usadas:
                            continue
                        # Candidatura del modelo si la hay; si no, el nombre de la columna tal cual (CUP, UPL...), que la web enseña sin cifra del modelo
                        candidatura = CANDIDATURA_DE_NOMBRE_NACIONAL.get(nombre) or CANDIDATURA_PARA_MOSTRAR.get(nombre) or nombre
                        medias_por_candidatura[candidatura] = round(medias_por_candidatura.get(candidatura, 0.0) + valor, 2)
                    encuestas_del_promedio = []
                    for encuesta, peso, _antiguedad in sorted(pesos, key=lambda trio: -trio[1]):
                        encuestas_del_promedio.append({"casa": encuesta["firma_original"], "fin": encuesta["fin"].isoformat(), "muestra": encuesta["muestra"],
                                                       "peso": round(peso / suma_pesos, 3) if suma_pesos > 0 else 0})
                    detalle[unidad] = {"k": usadas, "medias": medias_por_candidatura, "encuestas": encuestas_del_promedio}
    finally:
        promedio.vida_media_minima = vida
        promedio.VENTANA_DIAS = ventana
        promedio.FILTRO_DE_ATIPICAS.clear()
        promedio.FILTRO_DE_ATIPICAS.update(filtro)
        promedio.AJUSTE_MANUAL_DE_PESO.clear()
        promedio.AJUSTE_MANUAL_DE_PESO.update(ajuste)
    return resultado


def indicios_manuales(dia, rating, provincias_de):
    """{unidad: ({bloque: cuota en tanto por uno}, k)} con los indicios de Sondeos/indicios_territoriales.csv (datos de un partido en un territorio que el extractor no recoge: encuesta que
    solo publica una suma, sección autonómica de un estudio nacional, cifra derivada de un total nacional...). Cada indicio pesa lo que su casa x 0,5 ^ (antigüedad / VIDA_MEDIA_DIAS);
    k es el número de indicios dentro de la ventana, y con él se aplica la misma w = lambda x k / (k + k0) que a los promedios regionales."""
    if not RUTA_INDICIOS.exists():
        return {}
    acumulado = defaultdict(list)
    with open(RUTA_INDICIOS, encoding="utf-8-sig") as fichero:
        for fila in csv.DictReader(fichero, delimiter=";"):
            fin = date.fromisoformat(fila["fin_campo"])
            antiguedad = (dia - fin).days
            unidad = ("comunidad" if fila["comunidad_o_provincia"] == "comunidad" else "provincia", fila["territorio"])
            # peso_manual (opcional): fija el peso del indicio y lo exime de la ventana de 90 días (resultados electorales, cifras derivadas); sin él, peso de la casa x vida media
            peso_manual = (fila.get("peso_manual") or "").strip()
            if unidad not in provincias_de or antiguedad < 0 or (not peso_manual and antiguedad > VENTANA_DIAS):
                continue
            if peso_manual:
                peso = float(peso_manual)
            else:
                peso = rating.get(promedio.normalizar_firma(fila["casa"]), promedio.RATING_FIRMA_DESCONOCIDA) * 0.5 ** (antiguedad / VIDA_MEDIA_DIAS)
            acumulado[(unidad, fila["bloque"])].append((float(fila["porcentaje"]) / 100.0, peso))
    resultado = {}
    for (unidad, bloque), valores in acumulado.items():
        media = sum(v * p for v, p in valores) / sum(p for _v, p in valores)
        por_bloque, k = resultado.get(unidad, ({}, 0))
        por_bloque[bloque] = media
        resultado[unidad] = (por_bloque, max(k, len(valores)))
    return resultado


def cuota_de_bloque(reparto, problema, provincias, ids):
    peso = sum(problema.peso[p] for p in provincias)
    return sum(reparto.get((p, i), 0.0) * problema.peso[p] for p in provincias for i in ids) / peso


PESOS_APLICADOS = {}  # {unidad: {bloque: w}} del último cálculo de objetivos_territoriales, para el resumen


def sigma_del_modelo(bloque, cuota, comunidad_anclada=False):
    """Error relativo (σ de log(real/previsto)) del modelo para un bloque con esa cuota en la provincia. Con la comunidad anclada por su propia encuesta, solo el error de la forma dentro de la comunidad."""
    if bloque in SIGMA_PROPIA_DE_BLOQUE:
        return SIGMA_PROPIA_DE_BLOQUE[bloque]
    clase = CLASE_DE_BLOQUE[bloque]
    tramos = SIGMA_DENTRO_DE_LA_COMUNIDAD[clase] if comunidad_anclada and clase in SIGMA_DENTRO_DE_LA_COMUNIDAD else SIGMA_DEL_MODELO[clase]
    for cuota_minima, sigma in tramos:
        if cuota >= cuota_minima:
            return sigma
    return tramos[-1][1]


def peso_del_bloque(unidad, bloque, cuota_modelo, cuota_encuesta, k, ruido, comunidad_anclada=False):
    """Peso de la encuesta en un bloque. Comunidades (y provincias con PESO_POR_VARIANZA_EN_PROVINCIAS = False): LAMBDA x k / (k + K0). Provincias: V modelo / (V modelo + V encuesta), con V modelo = (σ x cuota)^2
    y V encuesta = EFECTO_DE_DISENO x p (1 - p) x ruido de muestreo de la media ponderada + DERIVA_DIARIA^2 x antigüedad ponderada (días desde el día medio del campo) + el error sistemático de las casas (ERROR_DE_CASA_PUNTOS x (1 - nota))^2, ponderado como el promedio."""
    if unidad[0] != "provincia" or not PESO_POR_VARIANZA_EN_PROVINCIAS:
        return LAMBDA * k / (k + K0)
    varianza_modelo = (sigma_del_modelo(bloque, cuota_modelo, comunidad_anclada) * cuota_modelo) ** 2
    ruido_de_muestreo, ruido_de_deriva, varianza_de_casa = ruido
    varianza_encuesta = EFECTO_DE_DISENO * cuota_encuesta * (1 - cuota_encuesta) * ruido_de_muestreo + DERIVA_DIARIA ** 2 * ruido_de_deriva + varianza_de_casa
    return LAMBDA * varianza_modelo / (varianza_modelo + varianza_encuesta) if varianza_modelo + varianza_encuesta > 0 else 0.0


def objetivos_territoriales(problema, reparto0, promedios, provincias_de, manuales=None):
    """{unidad: {bloque cubierto: objetivo T}} con T = (1 - w) modelo + w encuesta (la encuesta repartida entre los bloques cubiertos, con la masa del modelo)."""
    fijos, modelo_de = {}, {}
    # Territorios con un indicio manual del Frente Amplio (Aragón: A+M, CIS, GAD3 y SocioMétrica): su total de FA ya entra por ahí, con la columna de CHA que el extractor no recoge. Si el bloque IZQ (Sumar + Podemos) de la
    # encuesta también contara, la misma encuesta pesaría dos veces y, como las encuestas no traen a Podemos aparte, aplastaría a Podemos (22/11/2026: en Aragón lo bajaba de 1,4 a 0,4 %).
    con_indicio_de_fa = {unidad for unidad, (cuotas_manuales, _k) in (manuales or {}).items() if "FA" in cuotas_manuales}
    for unidad, (cuotas_encuesta, k, ruido) in promedios.items():
        modelo = {b: cuota_de_bloque(reparto0, problema, provincias_de[unidad], ids) for b, ids in BLOQUES.items()}
        cubiertos = [b for b in cuotas_encuesta if modelo[b] > 0.002 and not (b == "IZQ" and unidad in con_indicio_de_fa)]
        if len(cubiertos) < 3:
            continue
        masa_modelo = sum(modelo[b] for b in cubiertos)
        masa_encuesta = sum(cuotas_encuesta[b] for b in cubiertos)
        modelo_de[unidad] = modelo
        fijos[unidad] = {}
        PESOS_APLICADOS[unidad] = {}
        for b in cubiertos:
            # Anclada: la comunidad tiene su propio promedio, o todas sus provincias tienen el suyo (la encuesta provincial de una casa cubre entonces toda la comunidad y su total, como en el País Vasco con Ikerfel)
            comunidad_anclada = unidad[0] == "provincia" and any(unidad[1] in provincias_de[c] and (c in promedios or all(("provincia", p) in promedios for p in provincias_de[c]))
                                                                for c in provincias_de if c[0] == "comunidad")
            w = peso_del_bloque(unidad, b, modelo[b], cuotas_encuesta[b], k, ruido, comunidad_anclada)
            PESOS_APLICADOS[unidad][b] = w
            fijos[unidad][b] = (1 - w) * modelo[b] + w * masa_modelo * cuotas_encuesta[b] / masa_encuesta
    for unidad, (cuotas_manuales, k) in (manuales or {}).items():
        w = LAMBDA * k / (k + K0)
        for bloque, cuota_encuesta in cuotas_manuales.items():
            modelo_del_bloque = cuota_de_bloque(reparto0, problema, provincias_de[unidad], BLOQUES_MANUALES[bloque])
            if modelo_del_bloque > 0.002:
                fijos.setdefault(unidad, {})[bloque] = (1 - w) * modelo_del_bloque + w * cuota_encuesta
    if CONSISTENTE:
        comunidades = [u for u in fijos if u[0] == "comunidad"]
        peso_u = {u: sum(problema.peso[p] for p in provincias_de[u]) for u in fijos}
        for bloque, ids in BLOQUES.items():
            if any(i in LIBRES for i in ids):
                continue
            numerador = sum(modelo_de[u][bloque] * peso_u[u] for u in comunidades if u in modelo_de and bloque in fijos[u])
            denominador = sum(fijos[u][bloque] * peso_u[u] for u in comunidades if bloque in fijos[u])
            if denominador > 0:
                for u in fijos:
                    if bloque in fijos[u]:
                        fijos[u][bloque] *= numerador / denominador
    return fijos


def converger(problema, fijos, provincias_de, bloque_de):
    """Ajuste proporcional iterativo sobre la matriz provincia x candidatura; devuelve (matriz, objetivo nacional final)."""
    matriz = dict(repartir_proporcional(problema))
    total = sum(problema.peso.values())
    orden = sorted(fijos, key=lambda u: 0 if u[0] == "comunidad" else 1)
    libres = [i for i in LIBRES if i in problema.partidos]
    objetivo = dict(problema.objetivo)
    bloques = defaultdict(list)
    for i in problema.partidos:
        if bloque_de.get(i):
            bloques[bloque_de[i]].append(i)
    total_de_bloque = {b: sum(problema.objetivo[i] for i in miembros) for b, miembros in bloques.items()}

    def normalizar_filas():
        for provincia in problema.provincias:
            suma_fila = sum(matriz.get((provincia, i), 0.0) for i in problema.partidos)
            for i in problema.partidos:
                if (provincia, i) in matriz:
                    matriz[(provincia, i)] /= suma_fila

    def total_nacional(i):
        return sum(matriz.get((p, i), 0.0) * problema.peso[p] for p in problema.provincias) / total

    for _ in range(RONDAS):
        for unidad in orden:
            provincias = provincias_de[unidad]
            for bloque, meta in fijos[unidad].items():
                ids_del_bloque = BLOQUES.get(bloque) or BLOQUES_MANUALES[bloque]
                actual = cuota_de_bloque(matriz, problema, provincias, ids_del_bloque)
                if actual > 0:
                    for provincia in provincias:
                        for i in ids_del_bloque:
                            if (provincia, i) in matriz:
                                matriz[(provincia, i)] *= meta / actual
            normalizar_filas()
        objetivo = dict(problema.objetivo)
        nuevo = {i: total_nacional(i) for i in libres}
        for i in libres:
            objetivo[i] = nuevo[i]
        for bloque, miembros in bloques.items():
            libres_del_bloque = [i for i in miembros if i in libres]
            otros = [i for i in miembros if i not in libres]
            if not libres_del_bloque or not otros:
                continue
            restante = total_de_bloque[bloque] - sum(nuevo[i] for i in libres_del_bloque)
            antiguo = sum(problema.objetivo[i] for i in otros)
            for i in otros:
                objetivo[i] = problema.objetivo[i] * restante / antiguo
        suma = sum(objetivo.values())
        objetivo = {i: v / suma for i, v in objetivo.items()}
        for i in problema.partidos:
            if i in libres:
                continue
            actual = total_nacional(i)
            if actual > 0:
                for provincia in problema.provincias:
                    if (provincia, i) in matriz:
                        matriz[(provincia, i)] *= objetivo[i] / actual
        normalizar_filas()
    return matriz, objetivo


def aplicar(problema, provincias_modelo, dia, rating):
    """(problema con la base y el objetivo del blend, resumen). Si no hay territorios con encuestas suficientes devuelve el problema sin cambios."""
    nombres_de_provincia = {p["nombre"] for p in provincias_modelo}
    provincias_de = defaultdict(list)
    for p in provincias_modelo:
        provincias_de[("comunidad", p["comunidad"])].append(p["nombre"])
        provincias_de[("provincia", p["nombre"])].append(p["nombre"])
    detalle_de_promedios = {}
    promedios = {u: v for u, v in promedios_por_unidad(dia, nombres_de_provincia, rating, provincias_de, detalle_de_promedios).items() if u in provincias_de}
    detalle_para_la_web = {"%s (%s)" % (u[1], u[0]): d for u, d in detalle_de_promedios.items() if u in provincias_de}
    reparto0 = repartir_proporcional(problema)
    manuales = indicios_manuales(dia, rating, provincias_de)
    fijos = objetivos_territoriales(problema, reparto0, promedios, provincias_de, manuales)
    if not fijos:
        return problema, {"territorios": {}, "promedios": detalle_para_la_web}
    ejes = json.loads((CARPETA_WEB / "candidaturas.json").read_text(encoding="utf-8"))["parametros"]["ejes"]
    bloque_de = {**{i: "DERECHA" for i in ejes["derecha"]}, **{i: "IZQUIERDA" for i in ejes["izquierda"]}}
    matriz, objetivo = converger(problema, fijos, provincias_de, bloque_de)
    final = ProblemaDeReparto(problema.provincias, problema.partidos, matriz, problema.peso, objetivo)
    def peso_medio(unidad):
        pesos = PESOS_APLICADOS.get(unidad)
        if pesos:
            return sum(pesos.values()) / len(pesos)
        k = manuales[unidad][1]
        return LAMBDA * k / (k + K0)

    resumen = {"territorios": {"%s (%s)" % (u[1], u[0]): {"k": (promedios.get(u) or manuales[u])[1], "w": round(peso_medio(u), 3), "w_por_bloque": {b: round(w, 3) for b, w in PESOS_APLICADOS.get(u, {}).items()}} for u in fijos},
               "objetivo_antes": {i: problema.objetivo[i] for i in problema.partidos}, "objetivo_despues": objetivo, "promedios": detalle_para_la_web}
    return final, resumen
