"""
Monte Carlo de la previsión de 2026: rangos de escaños por candidatura, provincia y comunidad.

Parte de los mismos objetivos y la misma base que calcular_prevision_base.py y de la dispersión calibrada en calibrar_montecarlo.py.
Como los retrocesos dieron una cobertura algo corta (74 % en rangos del 80 % y 87 % en los del 95 %), se amplía toda la dispersión con
FACTOR_DE_AMPLIACION = 1.0  # calibrado: las sigmas de bloque son ya el RMS medido en 16 generales (calibrar_nacional_historico.py).

Opciones: python simular_prevision.py [sorteos] [palanca_media_psoe] [palanca_sigma_psoe]
  La palanca «voto útil al PSOE» (puntos de voto que pasan al PSOE) está desactivada por defecto; con una media distinta de cero se aplica a todos los sorteos.
Salida: prevision_montecarlo.json y un resumen por pantalla.
"""

import json
import sys
import time
from collections import defaultdict
from pathlib import Path

from calcular_prevision_base import calcular_objetivos, leer_promedio, preparar_problema
from montecarlo import resumir_nacional, simular
from motor_reparto import ProblemaDeReparto
from senado import ESCENARIO_PRINCIPAL, RecolectorSenado, construir_modelo_senado

CARPETA_WEB = Path(__file__).resolve().parent
FACTOR_DE_AMPLIACION = 1.0  # calibrado: las sigmas de bloque son ya el RMS medido en 16 generales (calibrar_nacional_historico.py)
BLOQUES = {
    "PP": "DERECHA", "VOX": "DERECHA", "UPN": "DERECHA", "PSOE": "IZQUIERDA", "SUMAR": "IZQUIERDA", "PODEMOS": "IZQUIERDA", "FV": "IZQUIERDA", "UPC": "IZQUIERDA",
    "ERC": "NACIONALISTAS", "JUNTS": "NACIONALISTAS", "BILDU": "NACIONALISTAS", "PNV": "NACIONALISTAS", "BNG": "NACIONALISTAS", "CC": "NACIONALISTAS",
}
# Calibración nacional con 16 elecciones (calibrar_nacional_historico.py, 09/11/2026): error del promedio a 26 días frente al resultado, en puntos de voto. Con la ampliación ×1,2
# los rangos del 80 % cubrieron el 81 % (derecha), el 81 % (izquierda) y el 94 % (nacionalistas) de las 16 elecciones. Los errores propios de cada partido se ajustan al error relativo
# medido (PP 0,17; PSOE 0,11; izquierda alternativa 0,17) descontando la parte que ya aporta el bloque.
# Recalibración conjunta del 12/11/2026 (calibrar_sigmas_conjunta.py): el generador (montecarlo.perturbar_objetivos) mueve el total de cada bloque con el error de bloque y el ruido propio de cada
# partido solo reparte dentro del bloque. Los seis parámetros de bloque y de PP, PSOE y la izquierda alternativa se ajustan para que el error EFECTIVO generado coincida con el medido en las
# 16 generales (1977-2023, promedio a 26 días, en puntos de voto: bloques 2,92, 2,90 y 1,73; PP 2,93; PSOE 3,52; izquierda alternativa 1,89). Los demás partidos no tienen medición.
SIGMA_BLOQUE = {"DERECHA": 3.09, "IZQUIERDA": 4.44, "NACIONALISTAS": 1.81}  # puntos de voto (parámetro del generador, no error efectivo)
SIGMA_PARTIDO = {
    "PP": 0.0, "PSOE": 0.281, "VOX": 0.20, "SUMAR": 0.0, "FV": 0.0, "UPC": 0.0, "PODEMOS": 0.0, "ERC": 0.10, "JUNTS": 0.10, "BILDU": 0.10, "PNV": 0.10, "BNG": 0.10, "CC": 0.10,
    "UPN": 0.10, "SALF": 0.35, "ADELANTE": 0.30, "PACMA": 0.15, "EXISTE": 0.10, "OTROS": 0.15,
}
SIGMA_PROVINCIAL = {
    "PP": 0.08, "PSOE": 0.08, "VOX": 0.10, "SUMAR": 0.10, "FV": 0.12, "UPC": 0.12, "PODEMOS": 0.15, "ERC": 0.08, "JUNTS": 0.08, "BILDU": 0.08, "PNV": 0.08, "BNG": 0.08, "CC": 0.08,
    "UPN": 0.08, "SALF": 0.20, "ADELANTE": 0.25, "PACMA": 0.10, "EXISTE": 0.08, "OTROS": 0.15,
}
# Sigma provincial calibrada con las 15 transiciones entre elecciones generales (calibrar_sigma_provincial.py, 09/11/2026): error log(real/previsto) del reparto
# provincial dado el total nacional, por clase de partido y tramo de cuota (cuota mínima, sigma). No se amplía ×1,2: se mide directamente sobre los datos.
CLASE_DE_PARTIDO = {"PP": "GRANDE", "PSOE": "GRANDE", "VOX": "VOX", "SUMAR": "IZQ_ALT", "FV": "IZQ_ALT", "UPC": "IZQ_ALT", "PODEMOS": "IZQ_ALT", "ADELANTE": "IZQ_ALT",
                    "ERC": "REGIONAL", "JUNTS": "REGIONAL", "BILDU": "REGIONAL", "PNV": "REGIONAL", "BNG": "REGIONAL", "CC": "REGIONAL", "UPN": "REGIONAL", "EXISTE": "REGIONAL",
                    "SALF": "NUEVO", "PACMA": "NUEVO", "OTROS": "NUEVO"}
# Recalibrada el 12/11/2026 con el histórico CORREGIDO (extraer_historico_circunscripciones.py: las celdas combinadas con rowspan desplazaban los partidos regionales y los etiquetaban como otros,
# lo que inflaba la σ de los regionales hasta 0,28-0,34). Con el fichero corregido (calibrar_sigma_provincial.py, 15 transiciones): regionales 0,05 (cuota >30 %), 0,08 (15-30 %) y 0,14 (<15 %);
# PP y PSOE 0,095, 0,14 y 0,25; izquierda alternativa 0,17, 0,19 y 0,24; Cs y Vox 0,08 y 0,13. Nuevos no tienen historial: se conserva 0,30.
SIGMA_PROVINCIAL_CALIBRADA = {"GRANDE": [(0.30, 0.095), (0.15, 0.14), (0.0, 0.25)], "VOX": [(0.15, 0.08), (0.0, 0.13)], "IZQ_ALT": [(0.15, 0.17), (0.05, 0.19), (0.0, 0.24)],
                              "REGIONAL": [(0.30, 0.05), (0.15, 0.08), (0.0, 0.14)], "NUEVO": [(0.0, 0.30)]}
# Sobreestimación de cada partido por las encuestas en 2023: de ahí sale el reparto de los puntos que gana el PSOE con la palanca
PARTIDOS_MAYORIA_DERECHA = ("PP", "VOX", "UPN", "CC", "SALF")
PARTIDOS_MAYORIA_IZQUIERDA = ("PSOE", "SUMAR", "PODEMOS", "FV", "UPC", "ADELANTE", "ERC", "JUNTS", "BILDU", "PNV", "BNG")
PESOS_PALANCA = {"PP": 1.1, "VOX": 0.8, "SUMAR": 0.7, "PODEMOS": 0.7, "ERC": 0.35, "JUNTS": 0.36, "PNV": 0.17, "BNG": 0.12}


def preparar_recolector_senado(problema):
    return RecolectorSenado(construir_modelo_senado(), dict(problema.base), 20261130)


def main():
    argumentos = [a for a in sys.argv[1:] if not a.startswith("--")]
    usar_sigma_calibrada = "--sigma-antigua" not in sys.argv
    sorteos = int(argumentos[0]) if len(argumentos) > 0 else 1000
    palanca_media = float(argumentos[1]) if len(argumentos) > 1 else 0.0
    palanca_sigma = float(argumentos[2]) if len(argumentos) > 2 else 0.0
    problema, validos, escanos = preparar_problema()
    ampliar = lambda diccionario: {clave: valor * FACTOR_DE_AMPLIACION for clave, valor in diccionario.items()}
    inicio = time.time()
    recolector = preparar_recolector_senado(problema)
    nacionales, provinciales = simular(problema, BLOQUES, ampliar(SIGMA_BLOQUE), ampliar(SIGMA_PARTIDO), ampliar(SIGMA_PROVINCIAL), validos, escanos, sorteos, 20261129,
                                       palanca_media=palanca_media, palanca_sigma=palanca_sigma, pesos_palanca=PESOS_PALANCA,
                                       tramos_provinciales=SIGMA_PROVINCIAL_CALIBRADA if usar_sigma_calibrada else None, clase_de_partido=CLASE_DE_PARTIDO, recolector_senado=recolector)
    print("%d sorteos en %.0f s (palanca PSOE: media %.1f, sigma %.1f; sigma provincial %s)" % (sorteos, time.time() - inicio, palanca_media, palanca_sigma, "calibrada" if usar_sigma_calibrada else "antigua"), flush=True)
    partidos = [p for p in problema.partidos if p != "OTROS"]
    resumen = resumir_nacional(nacionales, partidos)
    print("%-9s %8s %7s %12s %12s" % ("Partido", "Mediana", "Media", "Rango 80 %", "Rango 95 %"))
    for partido in sorted(partidos, key=lambda p: -resumen[p]["media"]):
        r = resumen[partido]
        print("%-9s %8.0f %7.1f %5.0f-%-5.0f %5.0f-%-5.0f" % (partido, r["mediana"], r["media"], r["p10"], r["p90"], r["p025"], r["p975"]))
    derecha = sorted(s.get("PP", 0) + s.get("VOX", 0) + s.get("UPN", 0) for s in nacionales)
    izquierda = sorted(s.get("PSOE", 0) + s.get("SUMAR", 0) + s.get("PODEMOS", 0) + s.get("FV", 0) + s.get("UPC", 0) for s in nacionales)
    print("\nPP + Vox + UPN: mediana %d | P(>=176) = %.1f %%" % (derecha[len(derecha) // 2], 100 * sum(1 for v in derecha if v >= 176) / sorteos))
    print("PSOE + Sumar + Podemos + FV: mediana %d | P(>=176) = %.1f %%" % (izquierda[len(izquierda) // 2], 100 * sum(1 for v in izquierda if v >= 176) / sorteos))
    # Mayorías posibles: la derecha suma CC (podría apoyarla) y SALF; el PNV solo cabe en la mayoría de izquierda y nacionalistas
    mayoria_derecha = lambda s: sum(s.get(p, 0) for p in PARTIDOS_MAYORIA_DERECHA) >= 176
    mayoria_izquierda = lambda s: sum(s.get(p, 0) for p in PARTIDOS_MAYORIA_IZQUIERDA) >= 176
    solo_derecha = sum(1 for s in nacionales if mayoria_derecha(s) and not mayoria_izquierda(s))
    solo_izquierda = sum(1 for s in nacionales if mayoria_izquierda(s) and not mayoria_derecha(s))
    ambas = sum(1 for s in nacionales if mayoria_derecha(s) and mayoria_izquierda(s))
    ninguna = sorteos - solo_derecha - solo_izquierda - ambas
    sin_cc = sum(1 for s in nacionales if sum(s.get(p, 0) for p in PARTIDOS_MAYORIA_DERECHA if p != "CC") >= 176)
    print("\nMayoría derecha (PP+Vox+UPN+CC+SALF): %.1f %% | sin contar CC: %.1f %%" % (100 * (solo_derecha + ambas) / sorteos, 100 * sin_cc / sorteos))
    print("Mayoría izquierda y nacionalistas (PSOE+Sumar+Podemos+FV+Adelante+ERC+Junts+Bildu+PNV+BNG): %.1f %%" % (100 * (solo_izquierda + ambas) / sorteos))
    print("Solo derecha %.1f %% | solo izquierda %.1f %% | ambas %.1f %% | ninguna (bloqueo) %.1f %%" % (100 * solo_derecha / sorteos, 100 * solo_izquierda / sorteos, 100 * ambas / sorteos, 100 * ninguna / sorteos))
    totales_derecha = sorted(sum(s.get(p, 0) for p in PARTIDOS_MAYORIA_DERECHA) for s in nacionales)
    totales_izquierda = sorted(sum(s.get(p, 0) for p in PARTIDOS_MAYORIA_IZQUIERDA) for s in nacionales)
    print("Escaños derecha: mediana %d (p10 %d, p90 %d) | izquierda y nacionalistas: mediana %d (p10 %d, p90 %d)" % (
        totales_derecha[sorteos // 2], totales_derecha[sorteos // 10], totales_derecha[9 * sorteos // 10],
        totales_izquierda[sorteos // 2], totales_izquierda[sorteos // 10], totales_izquierda[9 * sorteos // 10]))
    for partido in ("PODEMOS", "ADELANTE", "SALF", "UPN", "CC", "BNG", "PNV"):
        if partido in partidos:
            print("P(%s >= 1 escaño) = %.1f %%" % (partido, 100 * sum(1 for s in nacionales if s.get(partido, 0) >= 1) / sorteos))

    por_provincia = {}
    for provincia in problema.provincias:
        entrada = {}
        for partido in partidos:
            cuentas = defaultdict(int)
            for sorteo in provinciales:
                cuentas[sorteo.get((provincia, partido), 0)] += 1
            if len(cuentas) == 1 and 0 in cuentas:
                continue
            entrada[partido] = {str(n): round(c / sorteos, 4) for n, c in sorted(cuentas.items())}
        por_provincia[provincia] = entrada
    # Distribución nacional de cada partido, estadísticos de los bloques y resumen por comunidad autónoma (para las pestañas del Excel)
    from crear_excel_prevision import COMUNIDAD_DE_PROVINCIA
    distribucion_nacional = {}
    for partido in partidos:
        cuentas = defaultdict(int)
        for s in nacionales:
            cuentas[s.get(partido, 0)] += 1
        distribucion_nacional[partido] = {str(n): round(c / sorteos, 4) for n, c in sorted(cuentas.items())}
    estadisticos = lambda valores: {"media": sum(valores) / len(valores), "mediana": valores[len(valores) // 2], "p10": valores[len(valores) // 10], "p90": valores[9 * len(valores) // 10],
                                    "p025": valores[int(0.025 * len(valores))], "p975": valores[int(0.975 * len(valores))]}
    bloques_resumen = {"PP + Vox + UPN": estadisticos(derecha), "PSOE + Sumar + Podemos + FV": estadisticos(izquierda),
                       "Derecha ampliada (PP, Vox, UPN, CC, SALF)": estadisticos(totales_derecha),
                       "Izquierda y nacionalistas (PSOE, Sumar, Podemos, FV, Adelante, ERC, Junts, Bildu, PNV, BNG)": estadisticos(totales_izquierda)}
    totales_por_comunidad = []
    for sorteo in provinciales:
        acumulado = defaultdict(int)
        for (provincia, partido), cantidad in sorteo.items():
            acumulado[(COMUNIDAD_DE_PROVINCIA[provincia], partido)] += cantidad
        totales_por_comunidad.append(acumulado)
    comunidades = {}
    for comunidad, partido in sorted({clave for acumulado in totales_por_comunidad for clave in acumulado}):
        valores = sorted(acumulado.get((comunidad, partido), 0) for acumulado in totales_por_comunidad)
        resumen_comunidad = estadisticos(valores)
        resumen_comunidad["p_al_menos_1"] = sum(1 for v in valores if v >= 1) / sorteos
        comunidades.setdefault(comunidad, {})[partido] = resumen_comunidad
    probabilidad_de_al_menos_uno = {partido: sum(1 for s in nacionales if s.get(partido, 0) >= 1) / sorteos for partido in partidos}
    salida = {"sorteos": sorteos, "palanca_media": palanca_media, "palanca_sigma": palanca_sigma, "factor_de_ampliacion": FACTOR_DE_AMPLIACION, "sigma_provincial_calibrada": usar_sigma_calibrada,
              "nacional": resumen, "pp_vox_upn_176": sum(1 for v in derecha if v >= 176) / sorteos,
              "mayorias": {"solo_derecha": solo_derecha / sorteos, "solo_izquierda_y_nacionalistas": solo_izquierda / sorteos, "ambas": ambas / sorteos, "ninguna": ninguna / sorteos,
                           "derecha_sin_cc": sin_cc / sorteos}, "provincias": por_provincia,
              "distribucion_nacional": distribucion_nacional, "p_al_menos_1": probabilidad_de_al_menos_uno, "bloques": bloques_resumen, "comunidades": comunidades,
              "senado": resumir_senado(recolector, sorteos)}
    (CARPETA_WEB / "prevision_montecarlo.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")


def resumir_senado(recolector, sorteos):
    """Senadores elegidos por voto (208 de 266): resumen de cada escenario (pactos) y, en la raíz, el del escenario principal."""
    resumen = resumir_resultados_senado(recolector.resultados[ESCENARIO_PRINCIPAL], sorteos)
    resumen["escenario_principal"] = ESCENARIO_PRINCIPAL
    resumen["escenarios"] = {}
    for nombre, resultados in recolector.resultados.items():
        resumen_del_escenario = resumir_resultados_senado(resultados, sorteos)
        resumen_del_escenario["titulo"] = recolector.escenarios[nombre]["titulo"]
        resumen_del_escenario["disciplina_izquierda"] = recolector.escenarios[nombre]["disciplina_izquierda"]
        resumen_del_escenario["seguimiento_pp_vox"] = recolector.escenarios[nombre]["seguimiento_pp_vox"]
        resumen["escenarios"][nombre] = resumen_del_escenario
    resumen["nota"] = ("Solo senadores elegidos por voto (208). Los 58 designados por los parlamentos autonómicos no se estiman aquí (se añaden aparte). "
                       "SDP = lista conjunta de izquierdas «Senado de Progreso» (PSOE + Sumar + FV).")
    return resumen


def resumir_resultados_senado(resultados, sorteos):
    claves = sorted({clave for sorteo in resultados.nacionales for clave in sorteo})
    nacional = {}
    for clave in claves:
        valores = sorted(sorteo.get(clave, 0) for sorteo in resultados.nacionales)
        nacional[clave] = {"media": sum(valores) / sorteos, "mediana": valores[sorteos // 2], "p10": valores[sorteos // 10], "p90": valores[9 * sorteos // 10],
                           "p025": valores[int(0.025 * sorteos)], "p975": valores[int(0.975 * sorteos)]}
    por_circunscripcion = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for sorteo in resultados.por_circunscripcion:
        for (circunscripcion, clave), cantidad in sorteo.items():
            por_circunscripcion[circunscripcion][clave][cantidad] += 1
    distribucion = {circunscripcion: {clave: {str(n): round(c / sorteos, 4) for n, c in sorted(cuentas.items())} for clave, cuentas in partidos.items()}
                    for circunscripcion, partidos in por_circunscripcion.items()}
    # Bloques (revisado el 21/11/2026): derecha = PP + Vox + UPN; izquierda = lista conjunta o PSOE + Sumar + FV (+ Podemos, UPC y Adelante si salieran); el resto (nacionalistas, CC y locales) no se cuenta con ninguna.
    derecha_claves = ("PP", "VOX", "UPN")
    izquierda_claves = ("SDP", "PSOE", "SUMAR", "FV", "PODEMOS", "UPC", "ADELANTE")
    elegidos_totales = [sum(s.values()) for s in resultados.nacionales]
    derecha = [sum(s.get(c, 0) for c in derecha_claves) for s in resultados.nacionales]
    ventaja = sorted(2 * d - total for d, total in zip(derecha, elegidos_totales))   # derecha menos todo lo demás
    maximo = max(elegidos_totales) if elegidos_totales else 0

    def histograma(valores):
        """Probabilidad de cada número de senadores elegidos (0..máximo), redondeada."""
        cuentas = [0] * (maximo + 1)
        for valor in valores:
            cuentas[valor] += 1
        return [round(c / sorteos, 4) for c in cuentas]

    distribucion_de_bloques = {
        "derecha": histograma(derecha),
        "izquierda": histograma([sum(s.get(c, 0) for c in izquierda_claves) for s in resultados.nacionales]),
        "pp": histograma([s.get("PP", 0) for s in resultados.nacionales]),
        "elegidos": maximo,
    }
    return {"nacional": nacional, "circunscripciones": distribucion, "distribucion_de_bloques": distribucion_de_bloques, "ventaja_derecha_sobre_izquierda_y_nacionalistas": {
        "mediana": ventaja[sorteos // 2], "p10": ventaja[sorteos // 10], "p90": ventaja[9 * sorteos // 10], "p_positiva": sum(1 for v in ventaja if v > 0) / sorteos}}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
