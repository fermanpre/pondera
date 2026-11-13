"""
Listado de todos los sondeos de la próxima elección general con sus fuentes (PDF y artículos de prensa), como en la tabla de Wikipedia. (13/11/2026)

Baja la página de Wikipedia con extraer_sondeos_wikipedia.extraer_pagina(con_enlaces=True) y escribe sitio/listado_sondeos.json y sitio/listado_sondeos.js
(una fila por sondeo: firma, cliente, fechas, muestra, voto por partido y fuentes). Datos de Wikipedia, CC BY-SA 4.0.
Uso: python exportar_listado_sondeos.py
"""

import json
import sys
from pathlib import Path

CARPETA_WEB = Path(__file__).resolve().parent
sys.path.insert(0, str(CARPETA_WEB.parent / "Sondeos"))  # funciona igual en local y en el repositorio
import extraer_sondeos_wikipedia as wiki  # noqa: E402
from encuestas_de_parte import promotor_de  # noqa: E402

CARPETA_SITIO = CARPETA_WEB / "sitio"
CONVOCATORIA = "generales_proxima"
PAGINA = "Opinion_polling_for_the_next_Spanish_general_election"
ANIO_DE_LA_ELECCION = 2026
# Nombre de columna de Wikipedia -> nombre en el listado (Sumar y su sucesor Frente Amplio comparten columna)
NOMBRE_DE_PARTIDO = {"FA": "Sumar/FA", "Sumar": "Sumar/FA"}
PARTIDOS_EN_ORDEN = ["PP", "PSOE", "Vox", "Sumar/FA", "Podemos", "ERC", "Junts", "EH Bildu", "PNV", "BNG", "SALF", "CCa", "UPN", "FV"]


def normalizar_partido(nombre):
    if nombre.startswith("Adelante"):
        return "Adelante Andalucía"
    if nombre.startswith("Alian"):
        return "Aliança.cat"
    return NOMBRE_DE_PARTIDO.get(nombre, nombre)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    filas, _anclas, _desajustes = wiki.extraer_pagina(CONVOCATORIA, PAGINA, ANIO_DE_LA_ELECCION, con_enlaces=True)
    sondeos = {}
    for fila in filas:
        clave = (fila["firma"], fila["cliente"], fila["fecha_texto"], fila["anio_inferido"], fila["muestra"])
        sondeo = sondeos.setdefault(clave, {
            "firma": fila["firma"], "cliente": fila["cliente"], "campo": fila["fecha_texto"], "fin": fila["fin_campo"],
            "muestra": fila["muestra"] if fila["muestra"] != "" else None, "valores": {}, "fuentes": fila["enlaces"],
            "de_parte": promotor_de(fila["firma"], fila["cliente"])[0]})
        sondeo["valores"][normalizar_partido(fila["partido"])] = fila["valor"]
    listado = sorted(sondeos.values(), key=lambda s: s["fin"], reverse=True)
    sin_fuente = sum(1 for s in listado if not s["fuentes"])
    contenido = json.dumps({"partidos": PARTIDOS_EN_ORDEN, "sondeos": listado}, ensure_ascii=False, separators=(",", ":"))
    (CARPETA_SITIO / "listado_sondeos.json").write_text(contenido, encoding="utf-8")
    (CARPETA_SITIO / "listado_sondeos.js").write_text("const LISTADO_SONDEOS = " + contenido + ";\n", encoding="utf-8")
    print("Sondeos: %d (%d sin fuente); %s a %s" % (len(listado), sin_fuente, listado[-1]["fin"], listado[0]["fin"]))


if __name__ == "__main__":
    main()
