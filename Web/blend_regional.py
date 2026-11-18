"""
Blend con las encuestas subnacionales (comunidad y provincia). (17/11/2026)

Parte del problema de reparto que ya incluye el promedio nacional (objetivos) y el ancla del CIS (base_2026.json) y lo acerca a las encuestas de cada territorio con al menos dos encuestas
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
LAMBDA = 1.0
K0 = 3.0
MINIMO_DE_ENCUESTAS = 2
VENTANA_DIAS = 90
VIDA_MEDIA_DIAS = 21  # vida media mínima del peso por antigüedad en los promedios regionales (la regla nacional la baja a 3 días cerca de la elección y anula las encuestas de más de dos semanas)
CONSISTENTE = False
RONDAS = 300
RESULTADO_DE_ELECCION = re.compile(r"elections?", re.IGNORECASE)
# Bloques que solo se usan en los indicios territoriales manuales (Sondeos/indicios_territoriales.csv); no entran en el promedio de las encuestas regionales
BLOQUES_MANUALES = {"FA": ["SUMAR"], "EXISTE": ["EXISTE"]}
RUTA_INDICIOS = CARPETA_WEB.parent / "Sondeos" / "indicios_territoriales.csv"
BLOQUES = {"PP": ["PP"], "PSOE": ["PSOE"], "VOX": ["VOX"], "IZQ": ["SUMAR", "PODEMOS"], "FV": ["FV"], "ERC": ["ERC"], "JUNTS": ["JUNTS"], "BILDU": ["BILDU"], "PNV": ["PNV"], "BNG": ["BNG"], "CC": ["CC"]}
LIBRES = ("PNV", "BILDU", "BNG", "ERC", "JUNTS", "FV")
# Columna de la tabla de Wikipedia -> candidatura del modelo -> nombre nacional (para la corrección de partido y las medias)
CANDIDATURA_DE_COLUMNA = {"PP": "PP", "PSOE": "PSOE", "PSE–EE (PSOE)": "PSOE", "PSdeG–PSOE": "PSOE", "PSC": "PSOE", "Vox": "VOX", "Sumar": "SUMAR", "FA": "SUMAR", "Podemos": "PODEMOS",
                          "Podem": "PODEMOS", "FV": "FV", "Compromís": "FV", "ERC": "ERC", "Junts": "JUNTS", "EH Bildu": "BILDU", "PNV": "PNV", "BNG": "BNG", "CCa": "CC"}
NOMBRE_NACIONAL = {"PP": "PP", "PSOE": "PSOE", "VOX": "Vox", "SUMAR": "Sumar", "PODEMOS": "Podemos", "FV": "FV", "ERC": "ERC", "JUNTS": "Junts", "BILDU": "EH Bildu", "PNV": "PNV", "BNG": "BNG", "CC": "CCa"}
CANDIDATURA_DE_NOMBRE_NACIONAL = {v: k for k, v in NOMBRE_NACIONAL.items()}
BLOQUE_DE_CANDIDATURA = {i: b for b, ids in BLOQUES.items() for i in ids}
COLUMNAS_QUE_SE_SOLAPAN = [("Sumar", ["Podemos", "IU", "Unidas Podemos"]), ("FA", ["Podemos", "IU"])]
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
    with open(RUTA_ENCUESTAS, encoding="utf-8-sig", newline="") as fichero:
        for fila in csv.DictReader(fichero, delimiter=";"):
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
            for principal, solapadas in COLUMNAS_QUE_SE_SOLAPAN:
                if principal in columnas:
                    for solapada in solapadas:
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


def promedios_por_unidad(dia, nombres_de_provincia, rating):
    """{unidad: ({bloque: cuota en tanto por uno}, k)} de los territorios con al menos MINIMO_DE_ENCUESTAS encuestas en su promedio."""
    por_unidad = leer_encuestas(dia, nombres_de_provincia)
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
        for unidad, encuestas in por_unidad.items():
            encuestas, _descartes = filtro_atipicos.filtrar(encuestas, ultimos.get(unidad, {}), atipicas.EQUIVALENCIAS_REGIONALES)
            encuestas = [e for e in encuestas if e["valores"]]
            if len(encuestas) < MINIMO_DE_ENCUESTAS:
                continue
            medias, cuenta, usadas, _vida, _recientes = promedio.calcular_promedio(rating, hoy=dia, fecha_eleccion=promedio.FECHA_ELECCION, escribir=False, encuestas_leidas=encuestas)
            if usadas < MINIMO_DE_ENCUESTAS:
                continue
            por_bloque = defaultdict(float)
            for nombre, valor in medias.items():
                candidatura = CANDIDATURA_DE_NOMBRE_NACIONAL.get(nombre)
                bloque = BLOQUE_DE_CANDIDATURA.get(candidatura)
                if bloque and cuenta[nombre] * 2 >= usadas:
                    por_bloque[bloque] += valor / 100.0
            if len(por_bloque) >= 3:
                resultado[unidad] = (dict(por_bloque), usadas)
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


def objetivos_territoriales(problema, reparto0, promedios, provincias_de, manuales=None):
    """{unidad: {bloque cubierto: objetivo T}} con T = (1 - w) modelo + w encuesta (la encuesta repartida entre los bloques cubiertos, con la masa del modelo)."""
    fijos, modelo_de = {}, {}
    for unidad, (cuotas_encuesta, k) in promedios.items():
        modelo = {b: cuota_de_bloque(reparto0, problema, provincias_de[unidad], ids) for b, ids in BLOQUES.items()}
        cubiertos = [b for b in cuotas_encuesta if modelo[b] > 0.002]
        if len(cubiertos) < 3:
            continue
        masa_modelo = sum(modelo[b] for b in cubiertos)
        masa_encuesta = sum(cuotas_encuesta[b] for b in cubiertos)
        w = LAMBDA * k / (k + K0)
        modelo_de[unidad] = modelo
        fijos[unidad] = {b: (1 - w) * modelo[b] + w * masa_modelo * cuotas_encuesta[b] / masa_encuesta for b in cubiertos}
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
    promedios = {u: v for u, v in promedios_por_unidad(dia, nombres_de_provincia, rating).items() if u in provincias_de}
    reparto0 = repartir_proporcional(problema)
    manuales = indicios_manuales(dia, rating, provincias_de)
    fijos = objetivos_territoriales(problema, reparto0, promedios, provincias_de, manuales)
    if not fijos:
        return problema, {"territorios": {}}
    ejes = json.loads((CARPETA_WEB / "candidaturas.json").read_text(encoding="utf-8"))["parametros"]["ejes"]
    bloque_de = {**{i: "DERECHA" for i in ejes["derecha"]}, **{i: "IZQUIERDA" for i in ejes["izquierda"]}}
    matriz, objetivo = converger(problema, fijos, provincias_de, bloque_de)
    final = ProblemaDeReparto(problema.provincias, problema.partidos, matriz, problema.peso, objetivo)
    resumen = {"territorios": {"%s (%s)" % (u[1], u[0]): {"k": (promedios.get(u) or manuales[u])[1], "w": round(LAMBDA * (promedios.get(u) or manuales[u])[1] / ((promedios.get(u) or manuales[u])[1] + K0), 3)} for u in fijos},
               "objetivo_antes": {i: problema.objetivo[i] for i in problema.partidos}, "objetivo_despues": objetivo}
    return final, resumen
