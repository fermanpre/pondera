"""Correcciones de la casa y del cliente de encuestas regionales mal atribuidas en la fuente. (23/11/2026)

sondeos_regionales_largo.csv se rehace en cada ciclo a partir de la página de Wikipedia de encuestas subnacionales, así que corregirlo a mano en el CSV no dura: esta tabla se aplica cada vez
que el extractor lo escribe (extraer_sondeos_regionales.py y extraer_electografica.py) y también se puede aplicar a mano con «python correcciones_de_atribucion.py».

Cada corrección identifica la encuesta por región, casa y cliente de la fuente, fecha final de campo y muestra, y la reetiqueta con la casa y el cliente correctos. Solo cambia esas dos columnas.
"""
import csv
import sys
from pathlib import Path

CORRECCIONES = [
    {
        # El 22/11/2026 la tabla de Wikipedia (o su lectura) atribuyó a Social Data / Grupo Viva la encuesta de Aragón del 16-19 de noviembre. Es la de A+M para Heraldo de Aragón: mismas cifras
        # (PP 33,7, PSOE 27,7, Vox 20,7, FA 9,9, Existe 3,2), misma muestra (1.800), misma participación (70,1 %) y el enlace de la fuente es el artículo de Heraldo. Social Data es una encuesta distinta,
        # la de Andalucía (muestra de 2.000, campo del 13 de octubre al 14 de noviembre).
        "region": "Aragon", "firma": "Social Data", "cliente": "Grupo Viva", "fin_campo": "2026-11-19", "muestra": "1800",
        "firma_correcta": "A+M", "cliente_correcto": "Heraldo de Aragón",
    },
]


def corregir_filas(filas):
    """Aplica CORRECCIONES a una lista de filas (diccionarios del CSV regional) y devuelve cuántas filas ha cambiado."""
    cambiadas = 0
    for fila in filas:
        for correccion in CORRECCIONES:
            # Se compara como texto: en memoria la muestra puede ser un número y en el CSV, una cadena
            if all(str(fila.get(columna, "")) == str(correccion[columna]) for columna in ("region", "firma", "cliente", "fin_campo", "muestra")):
                fila["firma"] = correccion["firma_correcta"]
                fila["cliente"] = correccion["cliente_correcto"]
                cambiadas += 1
    return cambiadas


def corregir_fichero(ruta):
    """Aplica las correcciones a un CSV regional ya escrito (separador «;», UTF-8 con BOM) y lo reescribe si ha cambiado algo."""
    with open(ruta, encoding="utf-8-sig", newline="") as fichero:
        lector = csv.DictReader(fichero, delimiter=";")
        nombres_de_columnas = lector.fieldnames
        filas = list(lector)
    cambiadas = corregir_filas(filas)
    if cambiadas:
        with open(ruta, "w", encoding="utf-8-sig", newline="") as fichero:
            escritor = csv.DictWriter(fichero, fieldnames=nombres_de_columnas, delimiter=";")
            escritor.writeheader()
            escritor.writerows(filas)
    return cambiadas


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ruta_por_defecto = Path(__file__).resolve().parent / "sondeos_regionales_largo.csv"
    print("Filas corregidas en %s: %d" % (ruta_por_defecto.name, corregir_fichero(ruta_por_defecto)))
