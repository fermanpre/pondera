"""
Actualización diaria de la previsión a partir del promedio vivo. (14/11/2026)

Hace que los objetivos nacionales de la previsión (y todo lo que sale de ellos) sean siempre los del promedio de encuestas que muestra la web:
  1. Recalcula el promedio actual con el mismo código y los mismos pesos de firma que la serie diaria (Sondeos/promedio.py, Sondeos/pesos_firmas.csv) y lo escribe en
     Sondeos/promedio_actual.csv. Con la veda de sondeos el día de cálculo no pasa del último día publicable (serie_promedio_diaria.ULTIMO_DIA_PUBLICABLE).
  2. Traduce el promedio a objetivos por candidatura (calcular_prevision_base.py) sobre la base de base_2026.json (que no cambia con los días).
  3. Sustituye los «objetivos» de sitio/datos_modelo.json y .js (el resto del modelo, la base provincial y las sigmas, queda como está: el motor JavaScript de la web
     lo lee y hace el reparto y el Monte Carlo en el navegador).
  4. Regenera sitio/prueba_python.json (reparto proporcional y escaños sin ruido con el motor Python) y la página Resumen (generar_resumen.py: HTML, CSV y XLSX).
Si cambia el conjunto de candidaturas con objetivo positivo (entra o sale un partido), se detiene sin escribir nada: hay que regenerar el modelo entero con exportar_datos_web.py.
Uso: python actualizar_prevision_diaria.py
"""

import json
import sys
from pathlib import Path

CARPETA_WEB = Path(__file__).resolve().parent
CARPETA_SITIO = CARPETA_WEB / "sitio"
sys.path.insert(0, str(CARPETA_WEB.parent / "Sondeos"))

import generar_resumen  # noqa: E402
import promedio  # noqa: E402
import serie_promedio_diaria  # noqa: E402
from calcular_prevision_base import preparar_problema  # noqa: E402
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


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    dia = recalcular_promedio_actual()
    problema, validos, escanos = preparar_problema()
    ruta_modelo = CARPETA_SITIO / "datos_modelo.json"
    datos = json.loads(ruta_modelo.read_text(encoding="utf-8"))
    if set(problema.partidos) != set(datos["partidos"]):
        raise SystemExit("Cambia el conjunto de candidaturas del modelo (%s): regenerar con exportar_datos_web.py." % sorted(set(problema.partidos) ^ set(datos["partidos"])))
    antes = datos["objetivos"]
    datos["objetivos"] = {partido: problema.objetivo[partido] for partido in datos["partidos"]}
    datos["fecha_promedio"] = dia.isoformat()
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
    cambios = {partido: round(100 * (datos["objetivos"][partido] - antes[partido]), 2) for partido in datos["partidos"] if abs(datos["objetivos"][partido] - antes[partido]) > 5e-5}
    print("Previsión actualizada con el promedio de %s. Cambios en los objetivos (puntos): %s" % (dia, cambios or "ninguno"))
    print("Escaños sin ruido:", dict(sorted(total.items(), key=lambda par: -par[1])))


if __name__ == "__main__":
    main()
