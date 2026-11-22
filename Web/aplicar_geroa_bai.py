"""Geroa Bai como candidatura propia en Navarra, fuera de «OTROS». (22/11/2026)

Geroa Bai sacó 9.938 votos en Navarra en 2023 (2,9 % de los votos a candidaturas) y no concurrió con línea propia en las generales de 2019, así que su masa está dentro de «OTROS»
de base_2026.json. Con la base de cada provincia = 0,75 x (2023) + 0,25 x (media de 2019), su masa en la base es 0,75 x (votos de Geroa Bai en 2023 / votos a candidaturas de 2023).
Este script la quita de «OTROS» de Navarra y la pone en la columna nueva «GBAI» (que vale 0 en las demás provincias), y añade «GBAI» a la lista de candidaturas de sitio/datos_modelo.json y .js
(partidos, sigma de partido y clase), porque actualizar_prevision_diaria.py se detiene si cambia el conjunto de candidaturas del modelo. Las cuotas y los objetivos de ese fichero los rehace
actualizar_prevision_diaria.py en cada ciclo; la estimación de Geroa Bai se acerca a las encuestas con los indicios de Sondeos/indicios_territoriales.csv (bloque manual GBAI de blend_regional.py).
Es idempotente: marca la base con «geroa_bai» y no se aplica dos veces. Si se reconstruye la base desde construir_base_2026.py, hay que volver a ejecutarlo.
Uso: python aplicar_geroa_bai.py
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
CARPETA_WEB = Path(__file__).resolve().parent
RUTA_BASE = CARPETA_WEB / "base_2026.json"
RUTA_MODELO = CARPETA_WEB / "sitio" / "datos_modelo.json"
RUTA_MODELO_JS = CARPETA_WEB / "sitio" / "datos_modelo.js"
PESO_DE_2023_EN_LA_BASE = 0.75
VOTOS_DE_GEROA_BAI_EN_2023 = {"Navarra": 9938}   # resultados_2023.json (clave X:GBAI)
SIGMA_DE_PARTIDO = 0.20       # error relativo del total nacional: mayor que el de Existe (0,10) porque las encuestas la sitúan muy por debajo de su base
CLASE_DE_PARTIDO = "REGIONAL"


def aplicar_a_la_base():
    base = json.loads(RUTA_BASE.read_text(encoding="utf-8"))
    if base.get("geroa_bai"):
        print("Geroa Bai ya está aplicada a la base: no se hace nada con ella.")
        return
    resumen = {}
    for provincia, datos in base["provincias"].items():
        datos["cuotas"]["GBAI"] = 0.0
    for provincia, votos in VOTOS_DE_GEROA_BAI_EN_2023.items():
        datos = base["provincias"][provincia]
        masa = PESO_DE_2023_EN_LA_BASE * votos / datos["votos_candidaturas"]
        cuotas = datos["cuotas"]
        if cuotas["OTROS"] < masa:
            raise SystemExit("En %s «OTROS» (%.4f) es menor que la masa de Geroa Bai (%.4f): no se aplica." % (provincia, cuotas["OTROS"], masa))
        cuotas["OTROS"] -= masa
        cuotas["GBAI"] = masa
        resumen[provincia] = {"masa_de_geroa_bai": round(masa, 5), "otros_despues": round(cuotas["OTROS"], 5), "suma_de_cuotas": round(sum(cuotas.values()), 6)}
    base["geroa_bai"] = {"fecha": "2026-11-22", "provincias": resumen}
    RUTA_BASE.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Geroa Bai aplicada a la base:", json.dumps(resumen, ensure_ascii=False))


def aplicar_al_modelo():
    datos = json.loads(RUTA_MODELO.read_text(encoding="utf-8"))
    if "GBAI" in datos["partidos"]:
        print("«GBAI» ya está en datos_modelo.json: no se hace nada con él.")
        return
    posicion = datos["partidos"].index("EXISTE") + 1 if "EXISTE" in datos["partidos"] else datos["partidos"].index("OTROS")
    datos["partidos"].insert(posicion, "GBAI")
    datos["sigma_partido"]["GBAI"] = SIGMA_DE_PARTIDO
    datos["clase_de_partido"]["GBAI"] = CLASE_DE_PARTIDO
    texto_json = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    RUTA_MODELO.write_text(texto_json, encoding="utf-8")
    RUTA_MODELO_JS.write_text("const DATOS_MODELO = " + texto_json + ";\n", encoding="utf-8")
    print("«GBAI» añadido a datos_modelo.json y .js (posición %d de %d)." % (posicion, len(datos["partidos"])))


if __name__ == "__main__":
    aplicar_a_la_base()
    aplicar_al_modelo()
