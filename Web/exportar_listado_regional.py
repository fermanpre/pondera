"""
Listado de los sondeos regionales y provinciales de las generales de 2026 con sus fuentes, para la página «Sondeos regionales». (13/11/2026)

Baja la página de Wikipedia «Sub-national opinion polling for the 2026 Spanish general election» con extraer_sondeos_regionales.extraer_filas() y escribe
sitio/listado_regional.json y sitio/listado_regional.js: una entrada por ámbito (comunidad o provincia) con sus encuestas (porcentajes y escaños por partido, fuentes)
y los resultados reales de 2023 y de las europeas de 2024 como referencia. Datos de Wikipedia, CC BY-SA 4.0.
Uso: python exportar_listado_regional.py
"""

import json
import sys
from pathlib import Path

CARPETA_WEB = Path(__file__).resolve().parent
sys.path.insert(0, str(CARPETA_WEB.parent / "Sondeos"))  # funciona igual en local y en el repositorio
import extraer_sondeos_regionales as regionales  # noqa: E402
from encuestas_de_parte import promotor_de  # noqa: E402

CARPETA_SITIO = CARPETA_WEB / "sitio"
NOMBRE_DEL_AMBITO = {
    "Andalusia": "Andalucía", "Aragon": "Aragón", "Asturias": "Asturias", "Balearic Islands": "Illes Balears", "Basque Country": "País Vasco", "Canary Islands": "Canarias",
    "Cantabria": "Cantabria", "Castile and León": "Castilla y León", "Castilla–La Mancha": "Castilla-La Mancha", "Catalonia": "Cataluña", "Extremadura": "Extremadura",
    "Galicia": "Galicia", "La Rioja": "La Rioja", "Madrid": "Comunidad de Madrid", "Murcia": "Región de Murcia", "Navarre": "Navarra", "Valencian Community": "Comunitat Valenciana",
    "A Coruña": "A Coruña", "Álava": "Araba/Álava", "Alicante": "Alicante", "Biscay": "Bizkaia", "Cádiz": "Cádiz", "Castellón": "Castellón", "Gipuzkoa": "Gipuzkoa",
    "Lugo": "Lugo", "Melilla": "Melilla", "Ourense": "Ourense", "Pontevedra": "Pontevedra", "Valencia": "Valencia",
}
COMUNIDADES = {"Andalusia", "Aragon", "Asturias", "Balearic Islands", "Basque Country", "Canary Islands", "Cantabria", "Castile and León", "Castilla–La Mancha", "Catalonia",
               "Extremadura", "Galicia", "La Rioja", "Madrid", "Murcia", "Navarre", "Valencian Community"}


def main():
    filas = regionales.extraer_filas()
    ambitos = {}
    encuestas = {}
    for fila in filas:
        region = fila["region"]
        if region not in NOMBRE_DEL_AMBITO:
            continue
        clave = (region, fila["firma"], fila["cliente"], fila["fecha_texto"], fila["fin_campo"], fila["muestra"], fila["es_resultado_real"])
        sondeo = encuestas.setdefault(clave, {
            "firma": fila["firma"], "cliente": fila["cliente"], "campo": fila["fecha_texto"], "fin": fila["fin_campo"], "muestra": fila["muestra"] or None,
            "resultado": bool(fila["es_resultado_real"]), "de_parte": promotor_de(fila["firma"], fila["cliente"])[0], "valores": {}, "escanos": {}, "fuentes": json.loads(fila["enlaces"]), "_region": region})
        if fila["porcentaje"] != "":
            sondeo["valores"][fila["partido"]] = fila["porcentaje"]
        if fila["escanos_min"] != "":
            sondeo["escanos"][fila["partido"]] = [fila["escanos_min"], fila["escanos_max"]]
    for sondeo in encuestas.values():
        region = sondeo.pop("_region")
        sondeo["tipo"] = "resultado" if sondeo["resultado"] else ("porcentajes" if sondeo["valores"] else "escaños")
        ambito = ambitos.setdefault(region, {"nombre": NOMBRE_DEL_AMBITO[region], "tipo": "comunidad" if region in COMUNIDADES else "provincia", "sondeos": []})
        ambito["sondeos"].append(sondeo)
    for ambito in ambitos.values():
        ambito["sondeos"].sort(key=lambda s: (s["resultado"], s["fin"]), reverse=False)
        reales = [s for s in ambito["sondeos"] if s["resultado"]]
        encuestas_del_ambito = sorted([s for s in ambito["sondeos"] if not s["resultado"]], key=lambda s: s["fin"], reverse=True)
        ambito["sondeos"] = encuestas_del_ambito + reales
    ordenados = sorted(ambitos.values(), key=lambda a: (a["tipo"] != "comunidad", a["nombre"]))
    contenido = json.dumps({"ambitos": ordenados}, ensure_ascii=False, separators=(",", ":"))
    (CARPETA_SITIO / "listado_regional.json").write_text(contenido, encoding="utf-8")
    (CARPETA_SITIO / "listado_regional.js").write_text("const LISTADO_REGIONAL = " + contenido + ";\n", encoding="utf-8")
    total = sum(len([s for s in a["sondeos"] if not s["resultado"]]) for a in ordenados)
    con_porcentajes = sum(1 for a in ordenados for s in a["sondeos"] if s["tipo"] == "porcentajes")
    print("Ámbitos: %d; encuestas: %d (%d con porcentajes)" % (len(ordenados), total, con_porcentajes))


if __name__ == "__main__":
    main()
