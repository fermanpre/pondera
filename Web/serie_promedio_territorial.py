"""
Serie diaria del promedio de encuestas de cada comunidad y provincia, desde las generales del 23/07/2023. (22/11/2026)

Para cada día se llama a blend_regional.promedios_por_unidad(dia, ...), la misma función que alimenta la tabla «Promedio de encuestas» de las páginas de territorio: las mismas reglas que el promedio
nacional (nota de la casa, antigüedad, tamaño de muestra, una entrega por casa) con ventana de 90 días y solo con las encuestas cuyo fin de campo es anterior o igual a ese día. Los días en que el
territorio no reúne encuestas suficientes (dos en una comunidad, una en una provincia) quedan como null y la gráfica corta la línea, igual que la nacional: no se interpola.

Un territorio sale en la web con gráfico solo si tiene al menos MINIMO_DE_ENCUESTAS_PARA_GRAFICO encuestas con porcentajes en su historia (haya o no días con promedio: sin promedio, solo puntos); con menos, no hay evolución que enseñar.

Salidas (en la carpeta del sitio web): serie_territorial.json y serie_territorial.js («const SERIE_TERRITORIAL = …;»).
  unidades: {«Nombre (tipo)»: {desde: índice del primer día con datos, k: encuestas del promedio de cada día, partidos: {candidatura: [%...]}, encuestas: [{casa, fin, valores}]}}
  Las listas empiezan en «desde» (los días anteriores no tienen promedio) y llegan hasta el último día.
Uso: python serie_promedio_territorial.py
"""

import json
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

CARPETA_WEB = Path(__file__).resolve().parent
sys.path.insert(0, str(CARPETA_WEB.parent / "Sondeos"))

import blend_regional  # noqa: E402
import promedio  # noqa: E402
import serie_promedio_diaria  # noqa: E402

CARPETA_SITIO = CARPETA_WEB / "sitio"
PRIMER_DIA = date(2023, 7, 24)  # día siguiente a las generales de 2023
ULTIMO_DIA_PUBLICABLE = date(2026, 11, 23)  # veda de sondeos: desde el 24/11 no se publica
MINIMO_DE_ENCUESTAS_PARA_GRAFICO = 3


def candidatura_para_mostrar(nombre_nacional):
    """Misma regla que el detalle que va a la web: candidatura del modelo, o la de CANDIDATURA_PARA_MOSTRAR, o el nombre de la columna tal cual."""
    return (blend_regional.CANDIDATURA_DE_NOMBRE_NACIONAL.get(nombre_nacional)
            or blend_regional.CANDIDATURA_PARA_MOSTRAR.get(nombre_nacional) or nombre_nacional)


def datos_del_modelo():
    datos = json.loads((CARPETA_SITIO / "datos_modelo.json").read_text(encoding="utf-8"))
    nombres_de_provincia = {provincia["nombre"] for provincia in datos["provincias"]}
    provincias_de = defaultdict(list)
    for provincia in datos["provincias"]:
        provincias_de[("comunidad", provincia["comunidad"])].append(provincia["nombre"])
        provincias_de[("provincia", provincia["nombre"])].append(provincia["nombre"])
    return nombres_de_provincia, provincias_de


def encuestas_con_valores(ultimo_dia, nombres_de_provincia):
    """{unidad: {(casa, fin): {candidatura: porcentaje}}} de todas las encuestas leídas del CSV (ventana sin límite), para dibujar los puntos de cada encuesta."""
    ventana_original = blend_regional.VENTANA_DIAS
    blend_regional.VENTANA_DIAS = 100000
    try:
        leidas = blend_regional.leer_encuestas(ultimo_dia, nombres_de_provincia)
    finally:
        blend_regional.VENTANA_DIAS = ventana_original
    resultado = {}
    for unidad, lista in leidas.items():
        resultado[unidad] = {}
        for encuesta in lista:
            valores = defaultdict(float)
            for nombre, porcentaje in encuesta["valores"].items():
                valores[candidatura_para_mostrar(nombre)] += porcentaje
            resultado[unidad][(encuesta["firma_original"], encuesta["fin"].isoformat())] = dict(valores)
    return resultado


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ultimo_dia = min(promedio.HOY, ULTIMO_DIA_PUBLICABLE)
    dias = [PRIMER_DIA + timedelta(days=n) for n in range((ultimo_dia - PRIMER_DIA).days + 1)]
    nombres_de_provincia, provincias_de = datos_del_modelo()
    rating = serie_promedio_diaria.leer_pesos_de_firmas()

    medias_por_unidad = defaultdict(dict)     # {unidad: {índice de día: {candidatura: %}}}
    k_por_unidad = defaultdict(dict)          # {unidad: {índice de día: encuestas del promedio}}
    for indice, dia in enumerate(dias):
        detalle = {}
        blend_regional.promedios_por_unidad(dia, nombres_de_provincia, rating, provincias_de, detalle)
        for unidad, datos_del_dia in detalle.items():
            if unidad not in provincias_de:
                continue
            medias_por_unidad[unidad][indice] = datos_del_dia["medias"]
            k_por_unidad[unidad][indice] = datos_del_dia["k"]
        if indice % 200 == 0:
            print("  día %d de %d (%s)" % (indice, len(dias), dia), flush=True)

    todas_las_encuestas = encuestas_con_valores(ultimo_dia, nombres_de_provincia)
    unidades = {}
    resumen = []
    for unidad in sorted(set(medias_por_unidad) | set(todas_las_encuestas), key=lambda u: (u[0], u[1])):
        if unidad not in provincias_de:
            continue
        encuestas_de_la_unidad = sorted(todas_las_encuestas.get(unidad, {}).items(), key=lambda elemento: elemento[0][1])
        dias_con_promedio = len(medias_por_unidad.get(unidad, {}))
        if len(encuestas_de_la_unidad) < MINIMO_DE_ENCUESTAS_PARA_GRAFICO:
            resumen.append((unidad, len(encuestas_de_la_unidad), dias_con_promedio, "sin gráfico"))
            continue
        # Líneas: candidaturas del promedio, desde el primer día con promedio. Puntos: toda encuesta del CSV, solo para las candidaturas que pasan del 2 % en alguna encuesta o están en el promedio
        if dias_con_promedio:
            primer_indice = min(medias_por_unidad[unidad])
            candidaturas_con_linea = sorted({candidatura for medias in medias_por_unidad[unidad].values() for candidatura in medias})
        else:
            primer_indice = len(dias)
            candidaturas_con_linea = []
        partidos = {candidatura: [medias_por_unidad[unidad].get(indice, {}).get(candidatura) for indice in range(primer_indice, len(dias))] for candidatura in candidaturas_con_linea}
        candidaturas_con_puntos = set(candidaturas_con_linea)
        for _clave, valores in encuestas_de_la_unidad:
            candidaturas_con_puntos.update(candidatura for candidatura, porcentaje in valores.items() if porcentaje >= 2)
        puntos = []
        for (casa, fin), valores in encuestas_de_la_unidad:
            puntos.append({"casa": casa, "fin": fin, "valores": {c: round(v, 1) for c, v in valores.items() if c in candidaturas_con_puntos}})
        unidades["%s (%s)" % (unidad[1], unidad[0])] = {
            "desde": primer_indice, "k": [k_por_unidad[unidad].get(indice) for indice in range(primer_indice, len(dias))], "partidos": partidos, "encuestas": puntos}
        resumen.append((unidad, len(encuestas_de_la_unidad), dias_con_promedio, "con gráfico"))

    datos = {
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "primer_dia": dias[0].isoformat(), "ultimo_dia": dias[-1].isoformat(), "dias": len(dias),
        "ultimo_dia_publicable": ULTIMO_DIA_PUBLICABLE.isoformat(), "ventana_dias": blend_regional.VENTANA_DIAS, "unidades": unidades,
    }
    texto_json = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    (CARPETA_SITIO / "serie_territorial.json").write_text(texto_json, encoding="utf-8")
    (CARPETA_SITIO / "serie_territorial.js").write_text("const SERIE_TERRITORIAL = " + texto_json + ";\n", encoding="utf-8")
    for unidad, numero_de_encuestas, dias_con_promedio, veredicto in resumen:
        print("%-34s %2d encuestas, %4d días con promedio: %s" % ("%s (%s)" % (unidad[1], unidad[0]), numero_de_encuestas, dias_con_promedio, veredicto))
    print("Territorios con gráfico: %d | JSON: %.0f kB" % (len(unidades), len(texto_json.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
