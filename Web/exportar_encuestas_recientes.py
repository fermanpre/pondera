"""
Datos de la sección «Crea tu propio promedio» del simulador (17/11/2026).

Escribe sitio/encuestas_recientes.js con:
  - las encuestas más recientes de cada encuestadora en los últimos DIAS_DE_VENTANA días (tal como se publicaron, sin quitar acumulados), con el valor de cada partido,
    el valor tras la corrección por encuesta «de parte» (valores_modelo) y el peso que les da hoy el modelo (peso_modelo, en puntos sobre 100);
  - los parámetros con los que el modelo traduce un promedio de encuestas a objetivos por candidatura (los mismos pasos de calcular_prevision_base.calcular_objetivos),
    para que el navegador repita esa traducción con el promedio del visitante.
Uso: python exportar_encuestas_recientes.py
"""

import csv
import json
import sys
from datetime import date, timedelta
from pathlib import Path

CARPETA_WEB = Path(__file__).resolve().parent
CARPETA_SITIO = CARPETA_WEB / "sitio"
sys.path.insert(0, str(CARPETA_WEB.parent / "Sondeos"))

import filtro_atipicos  # noqa: E402
import promedio  # noqa: E402
import serie_promedio_diaria  # noqa: E402

DIAS_DE_VENTANA = 90
CONVOCATORIA = "generales_proxima"


def parametros_de_traduccion():
    """Constantes de la traducción del promedio a objetivos: factor de blancos, coalición UPN-PP, cuotas fijas de PACMA, Otros y Existe, y equivalencias de nombres."""
    configuracion = json.loads((CARPETA_WEB / "candidaturas.json").read_text(encoding="utf-8"))
    base = json.loads((CARPETA_WEB / "base_2026.json").read_text(encoding="utf-8"))
    provincias = base["provincias"]
    total_candidaturas = sum(p["votos_candidaturas"] for p in provincias.values())
    total_validos = sum(p["votos_validos"] for p in provincias.values())
    parametros = {"factor_de_blancos": total_candidaturas / total_validos}
    coalicion = configuracion["parametros"]["coalicion_upn_pp"]
    parametros["coalicion"] = {
        "columna": coalicion["columna"], "socio": coalicion["socio"],
        "votos_coalicion_base": sum(p["cuotas"][coalicion["columna"]] * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas,
        "votos_pp_dentro": sum((p["parte_pp_de_la_coalicion"] or 0.0) * p["cuotas"][coalicion["columna"]] * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas,
        "votos_pp_fuera": sum(p["cuotas"][coalicion["socio"]] * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas,
    }
    for clave in ("PACMA", "OTROS", "EXISTE"):
        parametros["cuota_" + clave.lower()] = sum(p["cuotas"][clave] * p["votos_candidaturas"] for p in provincias.values()) / total_candidaturas
    from calcular_prevision_base import EQUIVALENCIAS_ENCUESTA_A_CANDIDATURA
    parametros["equivalencias"] = EQUIVALENCIAS_ENCUESTA_A_CANDIDATURA
    return parametros


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    pesos_de_firmas = serie_promedio_diaria.leer_pesos_de_firmas()
    dia = min(promedio.HOY, serie_promedio_diaria.ULTIMO_DIA_PUBLICABLE)
    leidas = promedio.leer_encuestas_acumuladas(CONVOCATORIA)
    # Vida media del día (la misma que usa el promedio) para el peso por defecto
    _medias, _cuenta, _usadas, vida_media, _recientes = promedio.calcular_promedio(pesos_de_firmas, hoy=dia, escribir=False, solo_terminadas=False)
    # La encuesta más reciente de cada encuestadora dentro de la ventana
    limite = dia - timedelta(days=DIAS_DE_VENTANA)
    ultima_por_firma = {}
    for encuesta in leidas:
        if encuesta["firma"] in promedio.FIRMAS_EXCLUIDAS or not limite <= encuesta["fin"] <= dia:
            continue
        anterior = ultima_por_firma.get(encuesta["firma"])
        if anterior is None or (encuesta["fin"], encuesta["inicio"]) > (anterior["fin"], anterior["inicio"]):
            ultima_por_firma[encuesta["firma"]] = encuesta
    casas_con_recorte = filtro_atipicos.casas_penalizadas(promedio.normalizar_firma)
    error_de_referencia = promedio.error_de_muestra(promedio.MUESTRA_DE_REFERENCIA)
    filas = []
    for encuesta in ultima_por_firma.values():
        corregida = promedio.corregir_encuesta_de_parte(encuesta)
        rating_n = min(1.0, error_de_referencia / promedio.error_de_muestra(encuesta["muestra"]))
        rating_c = pesos_de_firmas.get(encuesta["firma"], promedio.RATING_FIRMA_DESCONOCIDA)
        nota = rating_n * rating_c * promedio.AJUSTE_MANUAL_DE_PESO.get(encuesta["firma"], 1.0)
        recorte = filtro_atipicos.RECORTE_DE_PESO_DE_CASA if encuesta["firma"] in casas_con_recorte else 1.0
        antiguedad = abs(dia.toordinal() - encuesta["medio"])
        peso = nota * recorte * 0.5 ** (antiguedad / vida_media)
        filas.append({
            "firma": encuesta["firma_original"], "cliente": encuesta["cliente"],
            "campo": serie_promedio_diaria.fecha_de_campo_en_espanol(encuesta["fecha_texto"], encuesta["fin"]), "fin": encuesta["fin"].isoformat(),
            "muestra": encuesta["muestra"], "de_parte": bool(corregida.get("corregida_de_parte")),
            "valores": {p: round(v, 2) for p, v in encuesta["valores"].items()},
            "valores_modelo": {p: round(v, 2) for p, v in corregida["valores"].items()} if corregida is not encuesta else None,
            "peso_bruto": peso,
        })
    total = sum(f["peso_bruto"] for f in filas) or 1.0
    for fila in filas:
        fila["peso_modelo"] = round(100.0 * fila.pop("peso_bruto") / total, 2)
    filas.sort(key=lambda f: f["fin"], reverse=True)
    promedio_modelo = {}
    with open(CARPETA_WEB.parent / "Sondeos" / "promedio_actual.csv", encoding="utf-8") as fichero:
        for fila in csv.DictReader(fichero, delimiter=";"):
            promedio_modelo[fila["partido"]] = round(float(fila["promedio_pct"]), 2)
    datos = {"dia": dia.isoformat(), "promedio_modelo": promedio_modelo, "dias_de_ventana": DIAS_DE_VENTANA, "vida_media": round(vida_media, 2), "encuestas": filas, "traduccion": parametros_de_traduccion()}
    texto = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    (CARPETA_SITIO / "encuestas_recientes.js").write_text("const ENCUESTAS_RECIENTES = " + texto + ";\n", encoding="utf-8")
    print("Encuestas recientes: %d encuestadoras en los %d días hasta el %s (vida media %.1f días)" % (len(filas), DIAS_DE_VENTANA, dia, vida_media))


if __name__ == "__main__":
    main()
