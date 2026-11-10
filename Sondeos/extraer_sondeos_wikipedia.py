"""
Extrae las tablas «Voting intention estimates» de las páginas de sondeos de Wikipedia (inglés) a formato largo.

Notas de método:
  - Las fechas de campo no llevan año en el HTML. Las filas van en orden cronológico inverso, así que
    el año se infiere recorriendo las tablas de cada página: parte del año de la elección de la página y
    resta 1 cada vez que el mes de la fila sube 7 o más meses respecto al de la fila anterior. Las filas
    de resultado electoral («2019 general»...) sirven de ancla y de comprobación.
  - Cada celda de partido trae «porcentaje escaños»; se guarda el porcentaje tal cual se escribió
    (valor_texto) para conservar la precisión publicada, y como número en valor.
  - Las filas de resultado electoral no se guardan como encuestas.

Salidas en esta carpeta: sondeos_wikipedia_largo.csv y resumen_wikipedia.csv
Uso: python extraer_sondeos_wikipedia.py
"""

import csv
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from lxml import html

CARPETA = Path(__file__).resolve().parent  # Sondeos/ (en local y en GitHub)
BASE = "https://en.wikipedia.org/wiki/"

# (convocatoria, título de la página, año de la elección = año de la primera fila)
PAGINAS = [
    ("generales_1977", "Opinion_polling_for_the_1977_Spanish_general_election", 1977),
    ("generales_1979", "Opinion_polling_for_the_1979_Spanish_general_election", 1979),
    ("generales_1982", "Opinion_polling_for_the_1982_Spanish_general_election", 1982),
    ("generales_1986", "Opinion_polling_for_the_1986_Spanish_general_election", 1986),
    ("generales_1989", "Opinion_polling_for_the_1989_Spanish_general_election", 1989),
    ("generales_1993", "Opinion_polling_for_the_1993_Spanish_general_election", 1993),
    ("generales_1996", "Opinion_polling_for_the_1996_Spanish_general_election", 1996),
    ("generales_2000", "Opinion_polling_for_the_2000_Spanish_general_election", 2000),
    ("generales_2004", "Opinion_polling_for_the_2004_Spanish_general_election", 2004),
    ("generales_2008", "Opinion_polling_for_the_2008_Spanish_general_election", 2008),
    ("generales_2011", "Opinion_polling_for_the_2011_Spanish_general_election", 2011),
    ("generales_2015", "Opinion_polling_for_the_2015_Spanish_general_election", 2015),
    ("generales_2016", "Opinion_polling_for_the_2016_Spanish_general_election", 2016),
    ("generales_2019A", "Opinion_polling_for_the_April_2019_Spanish_general_election", 2019),
    ("generales_2019N", "Opinion_polling_for_the_November_2019_Spanish_general_election", 2019),
    ("generales_2023", "Opinion_polling_for_the_2023_Spanish_general_election", 2023),
    # Wikipedia separa los sondeos de 2019 a 2021 en una subpágina (el título lleva un guion largo)
    ("generales_2023_tramo_2019_2021", "Nationwide_opinion_polling_for_the_2023_Spanish_general_election_(2019–2021)", 2021),
    ("generales_proxima", "Opinion_polling_for_the_next_Spanish_general_election", 2026),
    ("europeas_2014", "2014_European_Parliament_election_in_Spain", 2014),
    ("europeas_2019", "2019_European_Parliament_election_in_Spain", 2019),
    ("europeas_2024", "2024_European_Parliament_election_in_Spain", 2024),
]

MESES = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}
COLUMNAS_QUE_NO_SON_PARTIDOS = {"lead", "?", "other/ none", "other", "turnout", "polling firm/commissioner", "fieldwork date", "sample size"}
PATRON_FECHA = re.compile(r"(\d{1,2})\s*([A-Z][a-z]{2})")
PATRON_NUMERO = re.compile(r"^\d+(?:\.\d+)?")


def bajar(titulo):
    peticion = urllib.request.Request(BASE + urllib.parse.quote(titulo, safe="_(),:"), headers={"User-Agent": "Mozilla/5.0 (investigacion personal)"})
    return html.fromstring(urllib.request.urlopen(peticion, timeout=60).read())


def texto(celda):
    for etiqueta in celda.xpath(".//sup | .//style | .//script"):
        etiqueta.getparent().remove(etiqueta)
    crudo = " ".join(celda.itertext())
    crudo = re.sub(r"\[[^\]]*\]", " ", crudo)
    return re.sub(r"\s+", " ", crudo).strip()


def nombre_de_cabecera(celda):
    nombre = texto(celda)
    if nombre:
        return nombre
    for expresion in (".//abbr/@title", ".//a/@title", ".//img/@alt"):
        candidatos = celda.xpath(expresion)
        if candidatos:
            return candidatos[0].strip()
    return ""


def numero_de_atributo(celda, atributo):
    valor = re.sub(r"[^\d]", "", celda.get(atributo) or "")
    return int(valor) if valor else 1


def construir_rejilla(filas):
    """Expande colspan y rowspan: devuelve, para cada fila, la lista de columnas reales como pares (celda, es_continuacion).
    Una celda que ocupa varias columnas (p. ej. Frente Amplio y Front Valencià juntos) aparece en todas, y solo la primera no es continuación.
    Sin esto, los valores que siguen a una celda combinada se asignan a la columna equivocada."""
    rejilla = []
    pendientes = {}  # columna -> (celda, filas que le quedan)
    for fila in filas:
        celdas = fila.xpath("./th|./td")
        columnas = []
        columna = 0
        posicion_celda = 0
        while posicion_celda < len(celdas) or any(c >= columna for c in pendientes):
            if columna in pendientes:
                celda_arrastrada, restantes = pendientes[columna]
                columnas.append((celda_arrastrada, True))
                if restantes > 1:
                    pendientes[columna] = (celda_arrastrada, restantes - 1)
                else:
                    del pendientes[columna]
                columna += 1
                continue
            if posicion_celda >= len(celdas):
                columna += 1
                columnas.append((None, True))
                continue
            celda = celdas[posicion_celda]
            posicion_celda += 1
            ancho = numero_de_atributo(celda, "colspan")
            alto = numero_de_atributo(celda, "rowspan")
            for desplazamiento in range(ancho):
                columnas.append((celda, desplazamiento > 0))
                if alto > 1:
                    pendientes[columna] = (celda, alto - 1)
                columna += 1
        rejilla.append(columnas)
    return rejilla


def fecha_fin(texto_fecha):
    """Devuelve (día, mes) del final del campo o (None, mes) si solo hay mes."""
    coincidencias = PATRON_FECHA.findall(texto_fecha)
    if coincidencias:
        dia, mes = coincidencias[-1]
        if mes in MESES:
            return int(dia), MESES[mes]
    meses = [MESES[m] for m in re.findall(r"[A-Z][a-z]{2}", texto_fecha) if m in MESES]
    return (None, meses[-1]) if meses else (None, None)


def extraer_pagina(convocatoria, titulo, anio_eleccion):
    arbol = bajar(titulo)
    anio_actual, mes_previo = anio_eleccion, None
    filas_salida, anclas, desajustes = [], 0, []
    numero_tabla = 0
    for tabla in arbol.xpath("//table[contains(@class,'wikitable')]"):
        encabezado = tabla.xpath("preceding::*[self::h2 or self::h3 or self::h4][1]")
        seccion = texto(encabezado[0]).replace("edit", "").strip() if encabezado else ""
        filas = tabla.xpath(".//tr")
        rejilla = construir_rejilla(filas)
        cabeceras = filas[0].xpath("./th") if filas else []
        if not cabeceras or not texto(cabeceras[0]).startswith("Polling firm") or not ("Voting intention estimates" in seccion or re.fullmatch(r"\d{4}", seccion)):
            continue
        numero_tabla += 1
        partidos = [("" if continuacion else nombre_de_cabecera(celda)) for celda, continuacion in rejilla[0] if celda is not None]
        for columnas_de_la_fila in rejilla[1:]:
            celdas = [celda for celda, _continuacion in columnas_de_la_fila]
            if len(celdas) < 6 or celdas[0] is None or not texto(celdas[0]):
                continue
            firma_cliente = texto(celdas[0])
            fecha_texto = texto(celdas[1])
            muestra_texto = texto(celdas[2])
            etiqueta_resultado = re.match(r"^(\d{4}) (general|European|regional|local)", firma_cliente)
            dia, mes = fecha_fin(fecha_texto)
            if mes is None:
                continue
            if etiqueta_resultado or muestra_texto in ("—", "-", "–", ""):
                if etiqueta_resultado:
                    anclas += 1
                    if int(etiqueta_resultado.group(1)) != anio_actual and mes_previo is not None:
                        desajustes.append((titulo[-40:], firma_cliente, anio_actual))
                    anio_actual = int(etiqueta_resultado.group(1))
                    mes_previo = mes
                continue
            if mes_previo is not None and mes - mes_previo >= 7:
                anio_actual -= 1
            mes_previo = mes
            muestra = int(re.sub(r"[^\d]", "", muestra_texto)) if re.search(r"\d", muestra_texto) else ""
            firma = firma_cliente.split("/")[0].strip()
            cliente = "/".join(firma_cliente.split("/")[1:]).strip()
            fin_iso = "%04d-%02d-%02d" % (anio_actual, mes, dia) if dia else ""
            for posicion in range(4, min(len(celdas), len(partidos))):
                partido = partidos[posicion]
                celda_del_valor, es_continuacion = columnas_de_la_fila[posicion]
                if not partido or es_continuacion or celda_del_valor is None or partido.lower() in COLUMNAS_QUE_NO_SON_PARTIDOS:
                    continue
                numero = PATRON_NUMERO.match(texto(celda_del_valor))
                if not numero:
                    continue
                filas_salida.append(
                    {"convocatoria": convocatoria, "pagina": titulo, "tabla": numero_tabla, "firma": firma, "cliente": cliente,
                     "fecha_texto": fecha_texto, "anio_inferido": anio_actual, "fin_campo": fin_iso, "muestra": muestra,
                     "partido": partido, "valor_texto": numero.group(0), "valor": float(numero.group(0))}
                )
    return filas_salida, anclas, desajustes


def main():
    todas, resumen = [], []
    for convocatoria, titulo, anio in PAGINAS:
        try:
            filas, anclas, desajustes = extraer_pagina(convocatoria, titulo, anio)
        except Exception as error:
            print(convocatoria, "ERROR", type(error).__name__, error)
            continue
        todas += filas
        encuestas = {(f["firma"], f["fecha_texto"], f["anio_inferido"], f["muestra"]) for f in filas}
        anios = sorted({f["anio_inferido"] for f in filas})
        resumen.append({"convocatoria": convocatoria, "encuestas": len(encuestas), "datos": len(filas),
                        "anios": "%s-%s" % (anios[0], anios[-1]) if anios else "", "anclas": anclas, "desajustes_de_ancla": len(desajustes)})
        print(resumen[-1], desajustes[:3], flush=True)
    for nombre, filas in (("sondeos_wikipedia_largo.csv", todas), ("resumen_wikipedia.csv", resumen)):
        with open(CARPETA / nombre, "w", encoding="utf-8-sig", newline="") as fichero:
            escritor = csv.DictWriter(fichero, fieldnames=list(filas[0].keys()), delimiter=";")
            escritor.writeheader()
            escritor.writerows(filas)
    print("Datos totales:", len(todas))


PROPORCION_MINIMA_DE_FILAS = 0.8  # si la descarga trae menos de este fracción de las filas que ya había, se aborta sin escribir


def actualizar_solo_proxima():
    """Baja solo la página de la próxima elección y reemplaza únicamente esas filas de sondeos_wikipedia_largo.csv (las demás convocatorias no se tocan).
    Falla con aviso, sin escribir nada, si Wikipedia devuelve muchas menos filas que las que ya había (cambio de formato o página rota)."""
    convocatoria, titulo, anio = next(pagina for pagina in PAGINAS if pagina[0] == "generales_proxima")
    filas_nuevas, _anclas, desajustes = extraer_pagina(convocatoria, titulo, anio)
    ruta_csv = CARPETA / "sondeos_wikipedia_largo.csv"
    with open(ruta_csv, encoding="utf-8-sig", newline="") as fichero:
        lector = csv.DictReader(fichero, delimiter=";")
        nombres_de_columnas = lector.fieldnames
        filas_existentes = list(lector)
    filas_previas = [fila for fila in filas_existentes if fila["convocatoria"] == convocatoria]
    if len(filas_nuevas) < PROPORCION_MINIMA_DE_FILAS * len(filas_previas):
        raise SystemExit("ABORTADO: la descarga trae %d filas y ya había %d; no se escribe nada." % (len(filas_nuevas), len(filas_previas)))
    if set(filas_nuevas[0].keys()) != set(nombres_de_columnas):
        raise SystemExit("ABORTADO: las columnas de la descarga no coinciden con las del CSV; no se escribe nada.")
    resto = [fila for fila in filas_existentes if fila["convocatoria"] != convocatoria]
    with open(ruta_csv, "w", encoding="utf-8-sig", newline="") as fichero:
        escritor = csv.DictWriter(fichero, fieldnames=nombres_de_columnas, delimiter=";")
        escritor.writeheader()
        escritor.writerows(resto + filas_nuevas)
    print("Próxima elección: %d filas antes, %d ahora (desajustes de ancla: %d)." % (len(filas_previas), len(filas_nuevas), len(desajustes)))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if "--solo-proxima" in sys.argv:
        actualizar_solo_proxima()
    else:
        main()
