"""
Votos de las generales de 2023 por provincia agrupados en izquierda, derecha y otros, para la página del mapa. (13/11/2026)

Entrada: historico/congreso_2023_candidaturas.csv y congreso_2023_participacion.csv (BOE, definitivos, con voto CERA).
Salida:  sitio/datos_mapa_2023.js («const MAPA_2023 = {provincia: {izq, der, otros, total}}», votos a candidaturas; sin blancos ni nulos).
La clasificación es la de PONDERA y se publica en la página (BLOQUES_DEL_MAPA en assets/app_mapa.js debe decir lo mismo para 2026).
Uso: python exportar_mapa_2023.py
"""

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

import normalizar_historico

CARPETA_HISTORICO = Path(r"C:\Trabajo_Claude\Elecciones\Web\historico")
CARPETA_SITIO = Path(__file__).resolve().parent / "sitio"
CLAVES_DE_IZQUIERDA = {"PSOE", "SUMAR", "ERC", "BILDU", "BNG", "CUP", "ADELANTE_ANDALUCIA", "PACMA", "FRENTE_OBRERO", "PODEMOS"}
CLAVES_DE_DERECHA = {"PP", "VOX", "JUNTS", "PDECAT", "PNV", "CC", "NC", "UPN"}
FILAS_DE_TOTAL = ("Total estatal", "Total andaluz")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    votos = defaultdict(lambda: {"izq": 0, "der": 0, "otros": 0})
    with open(CARPETA_HISTORICO / "congreso_2023_candidaturas.csv", encoding="utf-8") as fichero:
        for fila in csv.DictReader(fichero):
            if fila["tipo"] != "votos" or fila["provincia"] in FILAS_DE_TOTAL or fila["candidatura"] == "__TOTAL_ESCANOS__":
                continue
            clave = normalizar_historico.clave_de(fila["candidatura"])
            lado = "izq" if clave in CLAVES_DE_IZQUIERDA else "der" if clave in CLAVES_DE_DERECHA else "otros"
            votos[fila["provincia"]][lado] += int(fila["valor"])
    votos_candidaturas = {}
    with open(CARPETA_HISTORICO / "congreso_2023_participacion.csv", encoding="utf-8") as fichero:
        for fila in csv.DictReader(fichero):
            if fila["provincia"] not in FILAS_DE_TOTAL:
                votos_candidaturas[fila["provincia"]] = int(fila["votos_candidaturas"])
    resultado = {}
    for provincia in sorted(votos):
        suma = sum(votos[provincia].values())
        assert suma == votos_candidaturas[provincia], (provincia, suma, votos_candidaturas[provincia])
        resultado[provincia] = dict(votos[provincia], total=suma)
    assert len(resultado) == 52, len(resultado)
    texto = "const MAPA_2023 = %s;\n" % json.dumps(resultado, ensure_ascii=False, separators=(",", ":"))
    (CARPETA_SITIO / "datos_mapa_2023.js").write_text(texto, encoding="utf-8")
    izquierda = sum(v["izq"] for v in resultado.values())
    derecha = sum(v["der"] for v in resultado.values())
    total = sum(v["total"] for v in resultado.values())
    print("Escrito datos_mapa_2023.js: 52 provincias | izquierda %.1f %%, derecha %.1f %%, otros %.1f %%" % (100 * izquierda / total, 100 * derecha / total, 100 * (total - izquierda - derecha) / total))


if __name__ == "__main__":
    main()
