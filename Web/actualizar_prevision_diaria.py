"""
Actualización diaria de la previsión a partir del promedio vivo. (14/11/2026)

Hace que los objetivos nacionales de la previsión (y todo lo que sale de ellos) sean siempre los del promedio de encuestas que muestra la web:
  1. Recalcula el promedio actual con el mismo código y los mismos pesos de firma que la serie diaria (Sondeos/promedio.py, Sondeos/pesos_firmas.csv) y lo escribe en
     Sondeos/promedio_actual.csv. Con la veda de sondeos el día de cálculo no pasa del último día publicable (serie_promedio_diaria.ULTIMO_DIA_PUBLICABLE).
  2. Traduce el promedio a objetivos por candidatura (calcular_prevision_base.py) sobre la base de base_2026.json (que no cambia con los días).
  3. Sustituye los «objetivos» de sitio/datos_modelo.json y .js (el resto del modelo, la base provincial y las sigmas, queda como está: el motor JavaScript de la web
     lo lee y hace el reparto y el Monte Carlo en el navegador).
  3 bis. En los últimos días antes de la votación (el último día publicable es el 23/11/2026 y la votación el 29), los objetivos no salen del promedio de ese último día sino del promedio
     proyectado con la tendencia de los últimos 7 días (Sondeos/proyeccion_tendencia.py, sin reescalar). Sondeos/promedio_actual.csv y la serie del promedio siguen siendo el promedio de las encuestas.
  4. Regenera sitio/prueba_python.json (reparto proporcional y escaños sin ruido con el motor Python) y la página Resumen (generar_resumen.py: HTML, CSV y XLSX).
Si cambia el conjunto de candidaturas con objetivo positivo (entra o sale un partido), se detiene sin escribir nada: hay que regenerar el modelo entero con exportar_datos_web.py.
Uso: python actualizar_prevision_diaria.py
"""

import copy
import json
import sys
from pathlib import Path

CARPETA_WEB = Path(__file__).resolve().parent
CARPETA_SITIO = CARPETA_WEB / "sitio"
sys.path.insert(0, str(CARPETA_WEB.parent / "Sondeos"))

import blend_regional  # noqa: E402
import generar_resumen  # noqa: E402
import promedio  # noqa: E402
import proyeccion_tendencia  # noqa: E402
import serie_promedio_diaria  # noqa: E402
from calcular_prevision_base import preparar_problema, proporcion_upc_en_frente_amplio  # noqa: E402
from motor_reparto import desplazar_en_proporcional, repartir_con_ajuste_iterativo, repartir_escanos_con_coaliciones  # noqa: E402

BARRERA_ELECTORAL = 0.03


def recalcular_promedio_actual():
    pesos_de_firmas = serie_promedio_diaria.leer_pesos_de_firmas()
    dia = min(promedio.HOY, serie_promedio_diaria.ULTIMO_DIA_PUBLICABLE)
    medias, _cuenta, usadas, _vida, _recientes = promedio.calcular_promedio(pesos_de_firmas, hoy=dia, escribir=True)
    if not medias:
        raise SystemExit("Sin encuestas en la ventana del %s: no se actualiza la previsión." % dia)
    print("Promedio actual a %s: %d encuestas | PP %.2f, PSOE %.2f, Vox %.2f" % (dia, usadas, medias["PP"], medias["PSOE"], medias["Vox"]))
    return dia


def promedio_para_la_prevision(dia):
    """(medias proyectadas, detalle de la proyección), o (None, None) si hoy no se proyecta. Calcula el promedio de cada uno de los últimos VENTANA_DIAS días con el mismo código y los mismos
    pesos de firma que el promedio vivo y desplaza el del último día con la pendiente de cada partido (proyeccion_tendencia.proyectar)."""
    horizonte = proyeccion_tendencia.horizonte_aplicable(dia, promedio.FECHA_ELECCION)
    if not horizonte:
        return None, None
    pesos_de_firmas = serie_promedio_diaria.leer_pesos_de_firmas()
    encuestas = promedio.leer_encuestas("generales_proxima")
    medias_por_dia = {}
    for dia_de_la_ventana in proyeccion_tendencia.dias_de_la_ventana(dia):
        medias_por_dia[dia_de_la_ventana] = promedio.calcular_promedio(pesos_de_firmas, hoy=dia_de_la_ventana, escribir=False, encuestas_leidas=encuestas)[0]
    proyectadas, detalle = proyeccion_tendencia.proyectar(medias_por_dia, dia, horizonte)
    movimientos = {partido: round(proyectadas[partido] - medias_por_dia[dia][partido], 2) for partido in proyectadas if abs(proyectadas[partido] - medias_por_dia[dia][partido]) >= 0.05}
    print("Proyección de la tendencia (%d días, pendiente de los últimos %d): %s" % (horizonte, proyeccion_tendencia.VENTANA_DIAS, movimientos))
    return proyectadas, detalle


def calcular_datos_del_dia(dia, datos_base, medias=None):
    """(datos del modelo con los objetivos y las cuotas de ese día, problema de reparto, votos válidos, escaños por provincia).
    Con medias (promedio.calcular_promedio de un día pasado) no usa promedio_actual.csv: así se reconstruye la previsión de cualquier día con el mismo código que la viva
    (Web/serie_prevision_diaria.py). No escribe nada."""
    problema, validos, escanos = preparar_problema(medias, dia)
    datos = copy.deepcopy(datos_base)
    if set(problema.partidos) != set(datos["partidos"]):
        raise SystemExit("Cambia el conjunto de candidaturas del modelo (%s): regenerar con exportar_datos_web.py." % sorted(set(problema.partidos) ^ set(datos["partidos"])))
    # Blend con las encuestas subnacionales (decisión del usuario, 17/11/2026: lambda 1, k0 3): acerca la base provincial y los totales de los partidos de un solo territorio a sus encuestas.
    # Si falla, la previsión sigue siendo la del promedio nacional con el ancla del CIS.
    try:
        problema, resumen_blend = blend_regional.aplicar(problema, datos["provincias"], dia, serie_promedio_diaria.leer_pesos_de_firmas())
    except Exception as error:  # no se bloquea la actualización diaria por esto
        print("Blend regional no aplicado (%s: %s)" % (type(error).__name__, error))
        resumen_blend = {"territorios": {}}
    datos["blend_regional"] = {"fecha": dia.isoformat(), "lambda": blend_regional.LAMBDA, "k0": blend_regional.K0, "territorios": resumen_blend["territorios"], "promedios": resumen_blend.get("promedios", {})}
    datos["objetivos"] = {partido: problema.objetivo[partido] for partido in datos["partidos"]}
    # Factor de la sigma provincial de la simulación (blend_regional.factores_de_sigma): más incertidumbre donde no hay encuestas locales (24/11/2026). Si el blend no se aplicó, 1 (sin cambio)
    factores_de_sigma = resumen_blend.get("factor_sigma", {})
    factores_por_partido = resumen_blend.get("factor_sigma_partido", {})
    for provincia in datos["provincias"]:
        provincia["factor_sigma"] = factores_de_sigma.get(provincia["nombre"], 1.0)
        if provincia["nombre"] in factores_por_partido:
            provincia["factor_sigma_partido"] = factores_por_partido[provincia["nombre"]]
        else:
            provincia.pop("factor_sigma_partido", None)
    # Las cuotas provinciales salen siempre del problema (con o sin blend ese día): si no, un día sin blend heredaría las del fichero, que pueden ser las de otro día
    por_nombre = {p["nombre"]: p for p in datos["provincias"]}
    for nombre in problema.provincias:
        fila = {i: problema.base[(nombre, i)] for i in problema.partidos if (nombre, i) in problema.base}
        suma_fila = sum(fila.values())
        por_nombre[nombre]["cuotas"] = {i: v / suma_fila for i, v in fila.items()}
    # Parte de UPC en (UPC + Frente Amplio), recalculada con las encuestas que la publican (Sondeos/upc_en_encuestas.csv): la usa el promedio propio de la web para repartir el total.
    datos["proporcion_upc_en_frente_amplio"] = proporcion_upc_en_frente_amplio(json.loads((CARPETA_WEB / "base_2026.json").read_text(encoding="utf-8"))["provincias"], dia)
    datos["fecha_promedio"] = dia.isoformat()
    return datos, problema, validos, escanos


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    dia = recalcular_promedio_actual()
    medias_proyectadas, detalle_de_la_proyeccion = promedio_para_la_prevision(dia)
    ruta_modelo = CARPETA_SITIO / "datos_modelo.json"
    datos_base = json.loads(ruta_modelo.read_text(encoding="utf-8"))
    antes = datos_base["objetivos"]
    datos, problema, validos, escanos = calcular_datos_del_dia(dia, datos_base, medias=medias_proyectadas)
    if detalle_de_la_proyeccion:
        datos["proyeccion_tendencia"] = detalle_de_la_proyeccion
    else:
        datos.pop("proyeccion_tendencia", None)
    resumen_blend = datos["blend_regional"]
    if resumen_blend["territorios"]:
        print("Blend regional aplicado a %d territorios: %s" % (len(resumen_blend["territorios"]), ", ".join("%s (k=%d, w=%.2f)" % (n, t["k"], t["w"]) for n, t in sorted(resumen_blend["territorios"].items()))))
    texto_json = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    ruta_modelo.write_text(texto_json, encoding="utf-8")
    (CARPETA_SITIO / "datos_modelo.js").write_text("const DATOS_MODELO = " + texto_json + ";\n", encoding="utf-8")

    # Reparto sin ruido con el motor Python (mismo código que exportar_datos_web.py)
    reparto = repartir_con_ajuste_iterativo(problema, desplazar_en_proporcional)
    escanos_por_provincia = {}
    for nombre in problema.provincias:
        votos = {partido: reparto[(nombre, partido)] * problema.peso[nombre]
                 for partido in problema.partidos if partido not in ("OTROS",) and (nombre, partido) in reparto}
        resultado = repartir_escanos_con_coaliciones(votos, escanos[nombre], BARRERA_ELECTORAL * validos[nombre], nombre)
        escanos_por_provincia[nombre] = {partido: n for partido, n in resultado.items() if n}
    cuotas_finales = {nombre: {partido: reparto[(nombre, partido)] for partido in problema.partidos if (nombre, partido) in reparto} for nombre in problema.provincias}
    (CARPETA_SITIO / "prueba_python.json").write_text(json.dumps({"cuotas": cuotas_finales, "escanos": escanos_por_provincia}, ensure_ascii=False), encoding="utf-8")
    total = {}
    for provincia in escanos_por_provincia.values():
        for partido, n in provincia.items():
            total[partido] = total.get(partido, 0) + n
    generar_resumen.main()
    cambios = {partido: round(100 * (datos["objetivos"][partido] - antes.get(partido, 0.0)), 2) for partido in datos["partidos"] if abs(datos["objetivos"][partido] - antes.get(partido, 0.0)) > 5e-5}
    print("Previsión actualizada con el promedio de %s. Cambios en los objetivos (puntos): %s" % (dia, cambios or "ninguno"))
    print("Escaños sin ruido:", dict(sorted(total.items(), key=lambda par: -par[1])))


if __name__ == "__main__":
    main()
