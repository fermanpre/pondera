"""
Resultados definitivos del Congreso de 2023 por provincia, para las columnas «2023» de la página de provincias.

Entrada: historico/congreso_2023_candidaturas.csv y congreso_2023_participacion.csv (BOE, definitivos, con voto CERA).
Salida:  sitio/resultados_2023.js («const RESULTADOS_2023 = …;» por provincia y «const RESULTADOS_2023_COMUNIDADES = …;» por comunidad) y sitio/resultados_2023.json.

Por provincia se guardan los votos válidos (con blancos), los escaños y, por candidatura, votos y escaños.
Se incluyen las candidaturas con al menos el 0,5 % de los votos válidos de la provincia, o con algún escaño, y PACMA siempre.
La clave es la del modelo (PP, PSOE, SUMAR, EXISTE…); las candidaturas que el modelo no tiene llevan la clave «X:<siglas>».
"""

import csv
import json
import re
import sys
from pathlib import Path

import normalizar_historico

CARPETA_HISTORICO = Path(r"C:\Trabajo_Claude\Elecciones\Web\historico")
CARPETA_SITIO = Path(__file__).resolve().parent / "sitio"
UMBRAL_DE_VOTO = 0.005
FILAS_DE_TOTAL = ("Total estatal", "Total andaluz")

CLAVE_DE_MODELO = {
    "PP": "PP", "PSOE": "PSOE", "VOX": "VOX", "SUMAR": "SUMAR", "ERC": "ERC", "JUNTS": "JUNTS", "BILDU": "BILDU", "PNV": "PNV", "BNG": "BNG",
    "CC": "CC", "UPN": "UPN", "PACMA": "PACMA", "EXISTE": "EXISTE", "ADELANTE_ANDALUCIA": "ADELANTE",
}


def siglas_de(nombre_original):
    """Texto del último paréntesis de «Nombre completo (SIGLAS)», sin el punto final que a veces arrastra el BOE."""
    coincidencias = re.findall(r"\(([^()]*)\)", nombre_original)
    if coincidencias:
        return coincidencias[-1].strip()
    return nombre_original.strip()


def clave_y_nombre(nombre_original):
    clave_historica = normalizar_historico.clave_de(nombre_original)
    if clave_historica in CLAVE_DE_MODELO:
        return CLAVE_DE_MODELO[clave_historica], None
    siglas = siglas_de(nombre_original)
    return "X:" + siglas, siglas


def clave_en_provincia(provincia, clave):
    """En Navarra, UPN y PP concurren en coalición en 2026: sus resultados de 2023 se suman en la fila UPN."""
    if provincia == "Navarra" and clave == "PP":
        return "UPN"
    return clave


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    votos_validos = {}
    with open(CARPETA_HISTORICO / "congreso_2023_participacion.csv", encoding="utf-8") as fichero:
        for fila in csv.DictReader(fichero):
            if fila["provincia"] not in FILAS_DE_TOTAL:
                votos_validos[fila["provincia"]] = int(fila["votos_validos"])

    votos = {}
    escanos = {}
    total_escanos = {}
    nombres_originales = {}
    with open(CARPETA_HISTORICO / "congreso_2023_candidaturas.csv", encoding="utf-8") as fichero:
        for fila in csv.DictReader(fichero):
            provincia = fila["provincia"]
            if provincia in FILAS_DE_TOTAL:
                continue
            if fila["candidatura"] == "__TOTAL_ESCANOS__":
                total_escanos[provincia] = int(fila["valor"])
                continue
            clave_candidatura = (provincia, fila["candidatura"])
            nombres_originales[fila["candidatura"]] = True
            diccionario = votos if fila["tipo"] == "votos" else escanos
            # Una candidatura aparece en varias páginas del PDF: se conserva el primer valor y se avisa si otra página lo contradice
            if clave_candidatura in diccionario and diccionario[clave_candidatura] != int(fila["valor"]):
                print("AVISO: valores distintos para", clave_candidatura, diccionario[clave_candidatura], fila["valor"])
                continue
            diccionario.setdefault(clave_candidatura, int(fila["valor"]))

    resultado = {}
    for provincia, validos in votos_validos.items():
        candidaturas = []
        escanos_repartidos = 0
        for (provincia_fila, nombre_original), cantidad in votos.items():
            if provincia_fila != provincia:
                continue
            clave, siglas = clave_y_nombre(nombre_original)
            clave = clave_en_provincia(provincia, clave)
            if "BLANCO" in nombre_original.upper() and "ESCA" in nombre_original.upper():
                continue
            escanos_de_la_candidatura = escanos.get((provincia, nombre_original), 0)
            if clave != "PACMA" and escanos_de_la_candidatura == 0 and cantidad / validos < UMBRAL_DE_VOTO:
                continue
            escanos_repartidos += escanos_de_la_candidatura
            entrada = {"clave": clave, "votos": cantidad, "escanos": escanos_de_la_candidatura}
            if siglas is not None:
                entrada["siglas"] = siglas
            candidaturas.append(entrada)
        # Una misma clave puede salir de dos candidaturas (por ejemplo, varias listas que el modelo agrupa): se suman
        agrupadas = {}
        for entrada in candidaturas:
            if entrada["clave"] in agrupadas:
                agrupadas[entrada["clave"]]["votos"] += entrada["votos"]
                agrupadas[entrada["clave"]]["escanos"] += entrada["escanos"]
            else:
                agrupadas[entrada["clave"]] = entrada
        lista = sorted(agrupadas.values(), key=lambda entrada: -entrada["votos"])
        if escanos_repartidos != total_escanos[provincia]:
            print("AVISO: escaños de %s: suman %d y el total es %d" % (provincia, escanos_repartidos, total_escanos[provincia]))
        resultado[provincia] = {"validos": validos, "escanos": total_escanos[provincia], "candidaturas": lista}

    # Comunidades autónomas: se suman votos y escaños de sus provincias y se aplica el umbral del 0,5 % sobre el total de la comunidad
    comunidad_de_provincia = {}
    datos_modelo = json.loads((CARPETA_SITIO / "datos_modelo.json").read_text(encoding="utf-8"))
    for provincia_modelo in datos_modelo["provincias"]:
        comunidad_de_provincia[provincia_modelo["nombre"]] = provincia_modelo["comunidad"]
    votos_por_comunidad = {}
    validos_por_comunidad = {}
    escanos_por_comunidad = {}
    for provincia, validos in votos_validos.items():
        comunidad = comunidad_de_provincia[provincia]
        validos_por_comunidad[comunidad] = validos_por_comunidad.get(comunidad, 0) + validos
        escanos_por_comunidad[comunidad] = escanos_por_comunidad.get(comunidad, 0) + total_escanos[provincia]
    siglas_por_clave = {}
    for (provincia, nombre_original), cantidad in votos.items():
        if "BLANCO" in nombre_original.upper() and "ESCA" in nombre_original.upper():
            continue
        clave, siglas = clave_y_nombre(nombre_original)
        clave = clave_en_provincia(provincia, clave)
        comunidad = comunidad_de_provincia[provincia]
        acumulado = votos_por_comunidad.setdefault(comunidad, {}).setdefault(clave, {"votos": 0, "escanos": 0})
        acumulado["votos"] += cantidad
        acumulado["escanos"] += escanos.get((provincia, nombre_original), 0)
        if siglas is not None:
            siglas_por_clave[clave] = siglas
    resultado_comunidades = {}
    for comunidad, por_clave in votos_por_comunidad.items():
        lista = []
        for clave, acumulado in por_clave.items():
            if clave != "PACMA" and acumulado["escanos"] == 0 and acumulado["votos"] / validos_por_comunidad[comunidad] < UMBRAL_DE_VOTO:
                continue
            entrada = {"clave": clave, "votos": acumulado["votos"], "escanos": acumulado["escanos"]}
            if clave in siglas_por_clave:
                entrada["siglas"] = siglas_por_clave[clave]
            lista.append(entrada)
        lista.sort(key=lambda entrada: -entrada["votos"])
        suma_escanos = sum(entrada["escanos"] for entrada in lista)
        if suma_escanos != escanos_por_comunidad[comunidad]:
            print("AVISO: escaños de %s: suman %d y el total es %d" % (comunidad, suma_escanos, escanos_por_comunidad[comunidad]))
        resultado_comunidades[comunidad] = {"validos": validos_por_comunidad[comunidad], "escanos": escanos_por_comunidad[comunidad], "candidaturas": lista}

    texto = json.dumps(resultado, ensure_ascii=False, separators=(",", ":"))
    texto_comunidades = json.dumps(resultado_comunidades, ensure_ascii=False, separators=(",", ":"))
    (CARPETA_SITIO / "resultados_2023.json").write_text(json.dumps({"provincias": resultado, "comunidades": resultado_comunidades}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (CARPETA_SITIO / "resultados_2023.js").write_text("const RESULTADOS_2023 = " + texto + ";" + chr(10) + "const RESULTADOS_2023_COMUNIDADES = " + texto_comunidades + ";" + chr(10), encoding="utf-8")
    print("Provincias: %d | %.0f kB" % (len(resultado), len(texto.encode("utf-8")) / 1024))
    extras = sorted({entrada["siglas"] for datos in resultado.values() for entrada in datos["candidaturas"] if "siglas" in entrada})
    print("Candidaturas sin clave del modelo mostradas:", ", ".join(extras))
    for provincia in ("Teruel", "Almería"):
        datos = resultado.get(provincia)
        if datos:
            print(provincia, datos["validos"], [(e["clave"], e["votos"], e["escanos"]) for e in datos["candidaturas"]])


if __name__ == "__main__":
    main()
