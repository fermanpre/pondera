"""
Serie diaria de la previsión (escaños, mayorías, primera fuerza...) desde el 1 de julio. (18/11/2026)

Para cada día calcula el promedio de ese día (promedio.calcular_promedio, con las mismas opciones que la previsión viva), lo traduce a un modelo con el mismo código que la previsión viva
(actualizar_prevision_diaria.calcular_datos_del_dia: objetivos, blend regional con las encuestas e indicios de ese día, proporción de UPC) y lo simula con el motor de la web
(serie_prevision_simular.js, Node). Escribe sitio/serie_prevision.json y .js (const SERIE_PREVISION), que dibuja assets/grafico_prevision.js.

Hasta «publicada_desde» la serie es una RECONSTRUCCIÓN: el modelo de hoy (base con el ancla del CIS de octubre, notas actuales de las casas, reglas de hoy) aplicado al promedio de cada día,
no lo que enseñaba la web ese día. «publicada_desde» se fija en la primera ejecución del workflow tras publicar la función (GITHUB_ACTIONS) y no cambia después.
Con --ultimos N solo se recalculan los últimos N días (más los que falten hasta hoy); lo anterior queda congelado. Sin fichero previo se calcula todo desde PRIMER_DIA_SERIE.
Uso: python serie_prevision_diaria.py [--ultimos N] [--desde AAAA-MM-DD] [--sorteos N]
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

CARPETA_WEB = Path(__file__).resolve().parent
CARPETA_SITIO = CARPETA_WEB / "sitio"
sys.path.insert(0, str(CARPETA_WEB.parent / "Sondeos"))

import promedio  # noqa: E402
import serie_promedio_diaria  # noqa: E402
from actualizar_prevision_diaria import calcular_datos_del_dia  # noqa: E402

PRIMER_DIA_SERIE = date(2026, 7, 1)
SORTEOS_POR_DIA = 10000
RUTA_SERIE = CARPETA_SITIO / "serie_prevision.json"
RUTA_COMBINACIONES = CARPETA_WEB / "combinaciones_de_mayoria.json"
CAMPOS_DE_PARTIDO = ("central", "p10", "mediana", "p90", "al_menos_uno")


def leer_registros_previos():
    """{día ISO: registro} de la serie guardada (formato por columnas) y sus metadatos."""
    if not RUTA_SERIE.exists():
        return {}, {}
    serie = json.loads(RUTA_SERIE.read_text(encoding="utf-8"))
    registros = {}
    for indice, dia in enumerate(serie["dias"]):
        if serie["hay_datos"][indice] is None or not serie["hay_datos"][indice]:
            registros[dia] = None
            continue
        registro = {"dia": dia, "en_el_aire": serie["en_el_aire"][indice]}
        for campo in CAMPOS_DE_PARTIDO:
            registro[campo] = {partido: valores[indice] for partido, valores in serie[campo].items() if valores[indice] is not None}
        registro["mayorias"] = {clave: valores[indice] for clave, valores in serie["mayorias"].items()}
        registro["bloques"] = {bloque: {estadistico: valores[indice] for estadistico, valores in columnas.items()} for bloque, columnas in serie["bloques"].items()}
        registro["primera_fuerza"] = {tipo: {clave: valores[indice] for clave, valores in columnas.items()} for tipo, columnas in serie["primera_fuerza"].items()}
        registros[dia] = registro
    metadatos = {clave: serie.get(clave) for clave in ("publicada_desde",)}
    return registros, metadatos


def en_columnas(registros, dias, metadatos, sorteos):
    """Convierte {día: registro} al formato por columnas que lee el gráfico."""
    combinaciones = json.loads(RUTA_COMBINACIONES.read_text(encoding="utf-8"))
    con_datos = [registros.get(dia) for dia in dias]
    modelo = next(registro for registro in con_datos if registro)

    def columna(extractor):
        return [extractor(registro) if registro else None for registro in con_datos]

    serie = {
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "primer_dia": dias[0], "ultimo_dia": dias[-1], "dias": dias, "hay_datos": [bool(registro) for registro in con_datos],
        "sorteos": sorteos, "mayoria_absoluta": combinaciones["mayoria_absoluta"],
        "publicada_desde": metadatos.get("publicada_desde"),
        "combinaciones": [{"id": c["id"], "nombre": c["nombre"], "grupo": c["grupo"], "partidos": c["partidos"]} for c in combinaciones["combinaciones"]],
        "bloques_definidos": combinaciones["bloques"],
        "en_el_aire": columna(lambda r: r["en_el_aire"]),
    }
    for campo in CAMPOS_DE_PARTIDO:
        serie[campo] = {partido: columna(lambda r, p=partido: r[campo].get(p)) for partido in modelo[campo]}
    serie["mayorias"] = {clave: columna(lambda r, c=clave: r["mayorias"][c]) for clave in modelo["mayorias"]}
    serie["bloques"] = {bloque: {estadistico: columna(lambda r, b=bloque, e=estadistico: r["bloques"][b][e]) for estadistico in columnas}
                        for bloque, columnas in modelo["bloques"].items()}
    serie["primera_fuerza"] = {tipo: {clave: columna(lambda r, t=tipo, c=clave: r["primera_fuerza"][t][c]) for clave in columnas}
                               for tipo, columnas in modelo["primera_fuerza"].items()}
    return serie


def redondear(valor):
    if isinstance(valor, float):
        return round(valor, 4)
    if isinstance(valor, dict):
        return {clave: redondear(v) for clave, v in valor.items()}
    return valor


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--ultimos", type=int, default=None)
    parser.add_argument("--desde", default=None)
    parser.add_argument("--sorteos", type=int, default=SORTEOS_POR_DIA)
    argumentos = parser.parse_args()

    dia_final = min(promedio.HOY, serie_promedio_diaria.ULTIMO_DIA_PUBLICABLE)
    primer_dia = date.fromisoformat(argumentos.desde) if argumentos.desde else PRIMER_DIA_SERIE
    todos_los_dias = [primer_dia + timedelta(days=n) for n in range((dia_final - primer_dia).days + 1)]
    registros, metadatos = leer_registros_previos()
    if argumentos.ultimos is not None and registros:
        recalcular = {dia_final - timedelta(days=n) for n in range(argumentos.ultimos)}
        recalcular |= {dia for dia in todos_los_dias if dia.isoformat() not in registros}
        dias_a_calcular = [dia for dia in todos_los_dias if dia in recalcular]
    else:
        dias_a_calcular = todos_los_dias
    print("Días de la serie: %d | a calcular: %d (%s a %s) | %d sorteos por día" % (len(todos_los_dias), len(dias_a_calcular), dias_a_calcular[0], dias_a_calcular[-1], argumentos.sorteos))

    pesos_de_firmas = serie_promedio_diaria.leer_pesos_de_firmas()
    encuestas = promedio.leer_encuestas("generales_proxima")
    datos_base = json.loads((CARPETA_SITIO / "datos_modelo.json").read_text(encoding="utf-8"))
    entrada = []
    sin_promedio = []
    medias_por_dia = {}
    for dia in dias_a_calcular:
        medias, _cuenta, _usadas, _vida, _recientes = promedio.calcular_promedio(pesos_de_firmas, hoy=dia, escribir=False, encuestas_leidas=encuestas)
        if not medias:
            sin_promedio.append(dia)
        else:
            medias_por_dia[dia] = medias
    # Front Valencià solo aparece en el promedio cuando alguna encuesta de la ventana la publica por separado; los días anteriores a la primera, que no tienen esa proporción,
    # usan la del primer día que sí la tiene (sin ella FV desaparecería del modelo ese día y no habría escaños de FV en la serie)
    con_valencia = [dia for dia in dias_a_calcular if dia in medias_por_dia and "FV" in medias_por_dia[dia] and "Sumar_con_FV" in medias_por_dia[dia]]
    if con_valencia:
        ultima = medias_por_dia[con_valencia[0]]  # al principio, la del primer día que la tiene; después, la última conocida
        rellenados = []
        for dia in dias_a_calcular:
            if dia not in medias_por_dia:
                continue
            if dia in con_valencia:
                ultima = medias_por_dia[dia]
            else:
                medias_por_dia[dia]["FV"], medias_por_dia[dia]["Sumar_con_FV"] = ultima["FV"], ultima["Sumar_con_FV"]
                rellenados.append(dia)
        if rellenados:
            print("Sin FV por separado en el promedio de %d días (hasta %s): se usa la proporción conocida más cercana (la del %s para los primeros)" % (len(rellenados), max(rellenados), con_valencia[0]))
    for dia in dias_a_calcular:
        if dia not in medias_por_dia:
            continue
        medias = medias_por_dia[dia]
        datos, _problema, _validos, _escanos = calcular_datos_del_dia(dia, datos_base, medias)
        entrada.append({"dia": dia.isoformat(), "datos": datos})
    if sin_promedio:
        print("Días sin promedio (sin encuestas en la ventana): %s" % ", ".join(d.isoformat() for d in sin_promedio))
    with tempfile.TemporaryDirectory() as carpeta:
        ruta_entrada, ruta_salida = Path(carpeta) / "entrada.json", Path(carpeta) / "salida.json"
        ruta_entrada.write_text(json.dumps({"dias": entrada}, separators=(",", ":")), encoding="utf-8")
        subprocess.run(["node", str(CARPETA_WEB / "serie_prevision_simular.js"), str(ruta_entrada), str(ruta_salida), str(argumentos.sorteos)], check=True)
        resultado = json.loads(ruta_salida.read_text(encoding="utf-8"))
    for registro in resultado["dias"]:
        registros[registro["dia"]] = redondear(registro)
    for dia in sin_promedio:
        registros[dia.isoformat()] = None

    if os.environ.get("GITHUB_ACTIONS") and not metadatos.get("publicada_desde"):
        metadatos["publicada_desde"] = dia_final.isoformat()
    serie = en_columnas(registros, [dia.isoformat() for dia in todos_los_dias], metadatos, argumentos.sorteos)
    texto = json.dumps(serie, ensure_ascii=False, separators=(",", ":"))
    RUTA_SERIE.write_text(texto, encoding="utf-8")
    (CARPETA_SITIO / "serie_prevision.js").write_text("const SERIE_PREVISION = " + texto + ";\n", encoding="utf-8")
    ultimo = registros[dia_final.isoformat()]
    print("Serie escrita: %d días, %.0f kB | %s: PP %d, PSOE %d, Vox %d escaños | P(PP primera en escaños) %.1f %%" % (
        len(todos_los_dias), len(texto.encode("utf-8")) / 1024, dia_final, ultimo["central"]["PP"], ultimo["central"]["PSOE"], ultimo["central"]["VOX"],
        100 * ultimo["primera_fuerza"]["escanos"]["PP"]))


if __name__ == "__main__":
    main()
