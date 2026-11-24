"""
Previsión del Senado de hoy: escribe sitio/senado.json y sitio/senado.js (const SENADO). (19/11/2026)

Parte del modelo de la previsión viva (actualizar_prevision_diaria.calcular_datos_del_dia: promedio de hoy, blend regional, indicios), simula el Congreso con el Monte Carlo de Python (montecarlo.simular)
y, en cada sorteo, calcula los senadores elegidos por voto con el modelo de senado.py en todos los escenarios a la vez (sin pactos, lista conjunta de izquierdas, pacto PP-Vox al 50, 75 y 100 %),
con los mismos sorteos. El resumen es el de simular_prevision.resumir_senado. Los 58 senadores designados por los parlamentos autonómicos no se estiman aquí (la página los añade aparte).
Es lento (unos 5 a 10 minutos por cada 1.000 sorteos: de 10.000, de media hora a una hora y media): lo ejecuta una vez al día el workflow «Previsión del Senado». Uso: python prevision_senado_diaria.py [sorteos]
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

CARPETA_WEB = Path(__file__).resolve().parent
CARPETA_SITIO = CARPETA_WEB / "sitio"
sys.path.insert(0, str(CARPETA_WEB.parent / "Sondeos"))

import montecarlo  # noqa: E402
import promedio  # noqa: E402
import serie_promedio_diaria  # noqa: E402
import simular_prevision as sim  # noqa: E402
from actualizar_prevision_diaria import calcular_datos_del_dia  # noqa: E402

SORTEOS_POR_DEFECTO = 10000
SEMILLA = 20261129


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sorteos = int(sys.argv[1]) if len(sys.argv) > 1 else SORTEOS_POR_DEFECTO
    dia = min(promedio.HOY, serie_promedio_diaria.ULTIMO_DIA_PUBLICABLE)
    datos_base = json.loads((CARPETA_SITIO / "datos_modelo.json").read_text(encoding="utf-8"))
    datos_del_dia, problema, validos, escanos = calcular_datos_del_dia(dia, datos_base)
    factor_sigma = {p["nombre"]: p.get("factor_sigma", 1.0) for p in datos_del_dia["provincias"]}
    recolector = sim.preparar_recolector_senado(problema)
    inicio = time.time()
    nacionales, _provinciales = montecarlo.simular(
        problema, sim.BLOQUES, sim.SIGMA_BLOQUE, sim.SIGMA_PARTIDO, sim.SIGMA_PROVINCIAL, validos, escanos, sorteos, SEMILLA,
        palanca_media=0.0, palanca_sigma=0.0, pesos_palanca=sim.PESOS_PALANCA, tramos_provinciales=sim.SIGMA_PROVINCIAL_CALIBRADA,
        clase_de_partido=sim.CLASE_DE_PARTIDO, recolector_senado=recolector, factor_sigma_provincial=factor_sigma)
    print("%d sorteos en %.0f s" % (sorteos, time.time() - inicio))
    resumen = sim.resumir_senado(recolector, sorteos)
    salida = {"fecha_promedio": dia.isoformat(), "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "sorteos": sorteos, "senado": resumen}
    texto = json.dumps(salida, ensure_ascii=False, separators=(",", ":"))
    (CARPETA_SITIO / "senado.json").write_text(texto, encoding="utf-8")
    (CARPETA_SITIO / "senado.js").write_text("const SENADO = " + texto + ";\n", encoding="utf-8")
    principal = resumen["nacional"]
    print("Escenario principal (%s): " % resumen["escenario_principal"] + ", ".join("%s %.0f (%d-%d)" % (clave, datos["mediana"], datos["p10"], datos["p90"])
                                                                                     for clave, datos in sorted(principal.items(), key=lambda par: -par[1]["mediana"])[:8]))
    print("Escrito sitio/senado.json: %.0f kB" % (len(texto.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
