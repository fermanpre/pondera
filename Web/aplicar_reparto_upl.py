"""Reparto del voto de la Unión del Pueblo Leonés (UPL) en la base de la previsión. (22/11/2026)

UPL no se presenta a las generales de 2026 (dato del usuario), pero en 2023 sacó 22.499 votos en León y 526 en Zamora (resultados provisionales de la base) y esos votos estaban en «OTROS» de
base_2026.json, lo que dejaba a León con un 7 % de «otros y en blanco» sin explicación. Con los resultados por sección de las generales de 2016 a 2023 en León (Interior, ficheros MESA; regresión ecológica,
Datos_Interior/estimar_destino_upl.py) el voto de UPL sale casi a partes iguales del PP y del PSOE (derecha -0,45 a -0,50, izquierda -0,46 a -0,49; Vox y la izquierda alternativa, nada apreciable).
Decisión del usuario (22/11/2026): se reparte la mitad al PP y la mitad al PSOE.

La base de cada provincia es 0,75 x (2023) + 0,25 x (media de las generales de 2019), y las generales de 2019 de la base no llevan los votos de UPL, así que la masa de UPL que está en «OTROS» es
0,75 x (votos de UPL en 2023 / votos a candidaturas de 2023). Este script la quita de «OTROS» y la suma, mitad y mitad, a PP y PSOE. Es idempotente: marca la base con «reparto_upl» y no se aplica dos veces.
Si se reconstruye la base desde construir_base_2026.py, hay que volver a ejecutarlo.
Uso: python aplicar_reparto_upl.py
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
CARPETA_WEB = Path(__file__).resolve().parent
RUTA_BASE = CARPETA_WEB / "base_2026.json"
PESO_DE_2023_EN_LA_BASE = 0.75
VOTOS_DE_UPL_EN_2023 = {"León": 22499, "Zamora": 526}   # congreso_2023_prov_candidaturas.csv (base de la previsión)
REPARTO_DE_UPL = {"PP": 0.5, "PSOE": 0.5}


def main():
    base = json.loads(RUTA_BASE.read_text(encoding="utf-8"))
    if base.get("reparto_upl"):
        print("El reparto de UPL ya está aplicado a la base: no se hace nada.")
        return
    resumen = {}
    for provincia, votos_de_upl in VOTOS_DE_UPL_EN_2023.items():
        datos = base["provincias"][provincia]
        masa = PESO_DE_2023_EN_LA_BASE * votos_de_upl / datos["votos_candidaturas"]
        cuotas = datos["cuotas"]
        if cuotas["OTROS"] < masa:
            raise SystemExit("En %s «OTROS» (%.4f) es menor que la masa de UPL (%.4f): no se aplica." % (provincia, cuotas["OTROS"], masa))
        cuotas["OTROS"] -= masa
        for candidatura, fraccion in REPARTO_DE_UPL.items():
            cuotas[candidatura] += masa * fraccion
        resumen[provincia] = {"masa_de_upl": round(masa, 5), "otros_despues": round(cuotas["OTROS"], 5), "suma_de_cuotas": round(sum(cuotas.values()), 6)}
    base["reparto_upl"] = {"fecha": "2026-11-22", "reparto": REPARTO_DE_UPL, "provincias": resumen}
    RUTA_BASE.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Reparto de UPL aplicado:", json.dumps(resumen, ensure_ascii=False))


if __name__ == "__main__":
    main()
