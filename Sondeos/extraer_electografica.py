"""
Completa las encuestas de Wikipedia con las de Electogrāfica (electografica.com), que suele publicarlas antes. (20/11/2026)

Fuente: el canal público de Blogger de cada etiqueta (sin autenticación), que trae cada entrada completa en HTML:
    https://www.electografica.com/feeds/posts/default/-/<etiqueta>?alt=json&max-results=N
  - Generales_CCAA: encuestas de generales por comunidad (y alguna provincia).
  - Generales: encuestas de generales de toda España.
De cada entrada se leen el titular («GALICIA · Elecciones generales · Encuesta Sondaxe 19/11/2026»), la estimación de voto (barras «bar-fill-anim», una por partido)
y la ficha técnica (encuestadora, cliente, fecha de realización, muestra). No trae porcentajes por provincia; solo datos factuales, no se copian imágenes ni textos.

Fusión: las encuestas nuevas se AÑADEN a sondeos_regionales_largo.csv y a sondeos_wikipedia_largo.csv (convocatoria generales_proxima) solo si no están ya.
Si coinciden con una de Wikipedia (misma casa y mismo fin de campo; en las nacionales, también mismo cliente y fin de campo), gana Wikipedia. Idempotente: los extractores de
Wikipedia regeneran los ficheros desde cero en cada ejecución del workflow y este script se ejecuta después. Si la descarga falla, termina sin error y no toca nada.

Las encuestas NACIONALES solo se completan con --con-nacionales: el contraste del 20/11/2026 (contrastar_electografica_wikipedia.py) enseñó diferencias sistemáticas con Wikipedia
(el porcentaje de «FA» sale 0,2 a 0,5 puntos distinto y en los seguimientos acumulativos como SW Demoscopia o Sigma Dos la entrega no es la misma), y Wikipedia ya las lleva al día.
Las regionales coinciden con Wikipedia partido a partido.

Uso: python extraer_electografica.py [--simular] [--con-nacionales]   (--simular enseña lo que añadiría sin escribir)
"""

import csv
import html
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

CARPETA = Path(__file__).resolve().parent
sys.path.insert(0, str(CARPETA))
import solapamiento_de_campo  # noqa: E402  (inicio_de_campo: primer día de una fecha en texto de Wikipedia)

RUTA_REGIONAL = CARPETA / "sondeos_regionales_largo.csv"
RUTA_NACIONAL = CARPETA / "sondeos_wikipedia_largo.csv"
URL_DEL_CANAL = "https://www.electografica.com/feeds/posts/default/-/%s?alt=json&max-results=%d"
AGENTE_DE_USUARIO = "Mozilla/5.0 (compatible; lector de encuestas para un proyecto personal)"
ENTRADAS_POR_ETIQUETA = 70
DIAS_REGIONALES = 120   # solo se consideran encuestas regionales con fin de campo en los últimos 120 días
DIAS_NACIONALES = 14    # y nacionales en las últimas dos semanas (Wikipedia las lleva casi al día)
SEGUNDOS_DE_ESPERA = 40

PAGINA_NACIONAL = "Opinion_polling_for_the_next_Spanish_general_election"
CONVOCATORIA_NACIONAL = "generales_proxima"
MESES_EN_INGLES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Región del titular de Electogrāfica (en mayúsculas, sin tildes) -> nombre que usa sondeos_regionales_largo.csv
REGION_DE_TITULAR = {
    "ANDALUCIA": "Andalusia", "ARAGON": "Aragon", "ASTURIAS": "Asturias", "PRINCIPADO DE ASTURIAS": "Asturias", "ILLES BALEARS": "Balearic Islands", "CANARIAS": "Canary Islands",
    "CANTABRIA": "Cantabria", "CASTILLA Y LEON": "Castile and León", "CASTILLA-LA MANCHA": "Castilla–La Mancha", "CATALUNA": "Catalonia", "COMUNITAT VALENCIANA": "Valencian Community",
    "EXTREMADURA": "Extremadura", "GALICIA": "Galicia", "COMUNIDAD DE MADRID": "Madrid", "MADRID": "Madrid", "REGION DE MURCIA": "Murcia", "MURCIA": "Murcia",
    "NAVARRA": "Navarre", "COMUNIDAD FORAL DE NAVARRA": "Navarre", "PAIS VASCO": "Basque Country", "LA RIOJA": "La Rioja", "CEUTA": "Ceuta", "MELILLA": "Melilla",
    "A CORUNA": "A Coruña", "LUGO": "Lugo", "OURENSE": "Ourense", "PONTEVEDRA": "Pontevedra", "LEON": "León", "ALAVA": "Álava", "ARABA/ALAVA": "Álava", "BIZKAIA": "Biscay",
    "GIPUZKOA": "Gipuzkoa", "VALENCIA": "Valencia", "ALICANTE": "Alicante", "CASTELLON": "Castellón", "CADIZ": "Cádiz",
}

# Nombre del partido en Electogrāfica (en mayúsculas, sin tildes, sin espacios, guiones ni puntos) -> nombre en las tablas de Wikipedia, por ámbito.
PARTIDOS_COMUNES = {
    "PP": "PP", "PSOE": "PSOE", "VOX": "Vox", "FA": "FA", "SUMAR": "Sumar", "PODEMOS": "Podemos", "PODEM": "Podem", "ERC": "ERC", "JUNTS": "Junts", "EHBILDU": "EH Bildu",
    "PNV": "PNV", "EAJPNV": "PNV", "BNG": "BNG", "CCA": "CCa", "CCA1CAN": "CCa", "CCA1ACAN": "CCa", "UPN": "UPN", "SALF": "SALF", "CHA": "CHA", "CUP": "CUP", "COMPROMIS": "Compromís", "EXISTE": "Existe",
    "GBAI": "GBai", "IE": "IE", "SUMARECP": "FA", "CUPPR": "CUP", "FV": "FV", "ADELANTEANDALUCIA": "Adelante Andalucía (2021)",
}
PARTIDOS_REGIONALES_POR_REGION = {
    "Galicia": {"PSDEGPSOE": "PSdeG–PSOE", "PSOE": "PSdeG–PSOE"},
    "Catalonia": {"PSC": "PSC", "PSCPSOE": "PSC", "PSOE": "PSC"},
    "Basque Country": {"PSEEE": "PSE–EE (PSOE)", "PSEEEPSOE": "PSE–EE (PSOE)", "PSOE": "PSE–EE (PSOE)"},
    "Biscay": {"PSEEE": "PSE–EE (PSOE)", "PSOE": "PSE–EE (PSOE)"}, "Gipuzkoa": {"PSEEE": "PSE–EE (PSOE)", "PSOE": "PSE–EE (PSOE)"}, "Álava": {"PSEEE": "PSE–EE (PSOE)", "PSOE": "PSE–EE (PSOE)"},
    "Valencian Community": {"COMPROMISEUPVPODEMERPV": "FV"},
}
PARTIDOS_NACIONALES = {"COMPROMISEUPVPODEMERPV": "FV", "COMPROMISFV": "FV", "NCBCPODEMOSIUSUMAR": None}
NOMBRES_QUE_NO_SON_PARTIDOS = {"PARTICIPACION"}


def sin_tildes_y_mayusculas(texto):
    descompuesto = unicodedata.normalize("NFKD", texto)
    sin_marcas = "".join(letra for letra in descompuesto if not unicodedata.combining(letra))
    return sin_marcas.upper().strip()


def clave_de_partido(nombre):
    """Nombre en mayúsculas sin tildes, espacios, guiones, puntos ni comas: «PSdeG-PSOE» -> «PSDEGPSOE»."""
    return re.sub(r"[\s\-–.,()/]", "", sin_tildes_y_mayusculas(nombre))


def descargar_entradas(etiqueta):
    """Lista de entradas del canal de una etiqueta: {titulo, publicada, enlace, contenido}. Lanza excepción si la descarga falla."""
    peticion = urllib.request.Request(URL_DEL_CANAL % (etiqueta, ENTRADAS_POR_ETIQUETA), headers={"User-Agent": AGENTE_DE_USUARIO})
    with urllib.request.urlopen(peticion, timeout=SEGUNDOS_DE_ESPERA) as respuesta:
        canal = json.loads(respuesta.read().decode("utf-8"))["feed"]
    entradas = []
    for entrada in canal.get("entry", []):
        enlace = ""
        for vinculo in entrada.get("link", []):
            if vinculo.get("rel") == "alternate":
                enlace = vinculo.get("href", "")
        entradas.append({"titulo": entrada["title"]["$t"], "publicada": entrada["published"]["$t"][:10], "enlace": enlace, "contenido": entrada.get("content", {}).get("$t", "")})
    return entradas


def leer_ficha_tecnica(contenido):
    """{etiqueta: valor} de la ficha técnica (Encuestadora, Cliente, Fecha realización, Método, Muestra, Margen de error)."""
    ficha = {}
    patron = r'<span class="field-label">([^<]+)</span><span class="field-value">(?:<a[^>]*>)?([^<]*)'
    for etiqueta, valor in re.findall(patron, contenido):
        ficha[html.unescape(etiqueta).strip()] = html.unescape(valor).strip()
    return ficha


def leer_estimacion_de_voto(contenido):
    """[(nombre del partido, porcentaje)] del panel «Estimación de voto (%)» (el primero de la entrada), en el orden de la página."""
    inicio = contenido.find('id="p1t-a"')
    fin = contenido.find('id="p1t-b"')
    if inicio < 0:
        return []
    panel = contenido[inicio:fin if fin > inicio else len(contenido)]
    nombres = re.findall(r"font-size:13px;font-weight:500[^>]*>([^<]+)</div>", panel)
    porcentajes = re.findall(r'bar-fill-anim" data-w="([\d.]+)"', panel)
    pares = []
    for nombre, porcentaje in zip(nombres, porcentajes):
        pares.append((html.unescape(nombre).strip(), float(porcentaje)))
    return pares


def interpretar_fecha_de_realizacion(texto):
    """(primer día, último día) como fechas, o None. Formatos: «14-18/11/2026», «29/10-02/11/2026», «19/11/2026»."""
    texto = texto.replace("–", "-").strip()
    coincidencia = re.match(r"^(\d{1,2})-(\d{1,2})/(\d{1,2})/(\d{4})$", texto)
    if coincidencia:
        dia_inicial, dia_final, mes, anio = (int(valor) for valor in coincidencia.groups())
        return date(anio, mes, dia_inicial), date(anio, mes, dia_final)
    coincidencia = re.match(r"^(\d{1,2})/(\d{1,2})-(\d{1,2})/(\d{1,2})/(\d{4})$", texto)
    if coincidencia:
        dia_inicial, mes_inicial, dia_final, mes_final, anio = (int(valor) for valor in coincidencia.groups())
        anio_inicial = anio - 1 if mes_inicial > mes_final else anio
        return date(anio_inicial, mes_inicial, dia_inicial), date(anio, mes_final, dia_final)
    coincidencia = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", texto)
    if coincidencia:
        dia, mes, anio = (int(valor) for valor in coincidencia.groups())
        return date(anio, mes, dia), date(anio, mes, dia)
    return None


def fecha_como_en_wikipedia(primer_dia, ultimo_dia):
    """«14–18 Nov 2026», «29 Oct–2 Nov 2026» o «19 Nov 2026» (con raya, como las tablas de Wikipedia)."""
    mes_final = MESES_EN_INGLES[ultimo_dia.month - 1]
    if primer_dia == ultimo_dia:
        return "%d %s %d" % (ultimo_dia.day, mes_final, ultimo_dia.year)
    if primer_dia.month == ultimo_dia.month and primer_dia.year == ultimo_dia.year:
        return "%d–%d %s %d" % (primer_dia.day, ultimo_dia.day, mes_final, ultimo_dia.year)
    mes_inicial = MESES_EN_INGLES[primer_dia.month - 1]
    return "%d %s–%d %s %d" % (primer_dia.day, mes_inicial, ultimo_dia.day, mes_final, ultimo_dia.year)


def interpretar_muestra(texto):
    digitos = re.sub(r"[^\d]", "", texto.split("entrevistas")[0])
    return int(digitos) if digitos else ""


def casa_y_cliente_del_titular(texto):
    """De «Encuesta Ikerfel/G. Vasco 30/10/2026» o «Encuesta 40dB. 19/11/2026 (2)»: («Ikerfel», «G. Vasco») y («40dB», «»). Es el respaldo cuando la ficha no trae la encuestadora."""
    texto = re.sub(r"^\s*Encuesta\s+", "", texto)
    texto = re.sub(r"\s+\d{1,2}/\d{1,2}/\d{4}.*$", "", texto)
    casa, separador, cliente = texto.partition("/")
    return casa.rstrip(".").strip(), cliente.strip()


def interpretar_entrada(entrada):
    """Diccionario de una encuesta (ambito, casa, cliente, primer_dia, ultimo_dia, muestra, valores [(partido, %)], enlace) o None si la entrada no es una encuesta con el formato nuevo."""
    partes = [parte.strip() for parte in html.unescape(entrada["titulo"]).split("·")]
    if len(partes) < 3 or "Elecciones generales" not in partes[1]:
        return None
    ficha = leer_ficha_tecnica(entrada["contenido"])
    fechas = interpretar_fecha_de_realizacion(ficha.get("Fecha realización", ""))
    valores = leer_estimacion_de_voto(entrada["contenido"])
    casa, cliente_del_titular = casa_y_cliente_del_titular(partes[2])
    casa = ficha.get("Encuestadora", casa).rstrip(".").strip()
    cliente = ficha.get("Cliente", "")
    if cliente in ("", "n/a"):
        cliente = cliente_del_titular
    if not fechas or not valores or not casa:
        return None
    return {"ambito": partes[0], "casa": casa, "cliente": cliente, "primer_dia": fechas[0], "ultimo_dia": fechas[1],
            "muestra": interpretar_muestra(ficha.get("Muestra", "")), "valores": valores, "enlace": entrada["enlace"]}


def nombre_de_partido(nombre_electografica, region):
    """Nombre del partido en las tablas de Wikipedia, o None si no se conoce (en cuyo caso se descarta y se avisa)."""
    clave = clave_de_partido(nombre_electografica)
    if clave in NOMBRES_QUE_NO_SON_PARTIDOS:
        return None
    if region in PARTIDOS_REGIONALES_POR_REGION and clave in PARTIDOS_REGIONALES_POR_REGION[region]:
        return PARTIDOS_REGIONALES_POR_REGION[region][clave]
    if region is None and clave in PARTIDOS_NACIONALES:
        return PARTIDOS_NACIONALES[clave]
    return PARTIDOS_COMUNES.get(clave)


def firma_normalizada(nombre):
    """Misma normalización de casas que usa el promedio (promedio.normalizar_firma), sin importarlo para no cargar todo el modelo."""
    return re.sub(r"[^a-z0-9]", "", sin_tildes_y_mayusculas(nombre).lower())


def cargar_filas(ruta):
    with open(ruta, encoding="utf-8-sig", newline="") as fichero:
        lector = csv.DictReader(fichero, delimiter=";")
        return lector.fieldnames, list(lector)


def guardar_filas(ruta, nombres_de_columnas, filas):
    with open(ruta, "w", encoding="utf-8-sig", newline="") as fichero:
        escritor = csv.DictWriter(fichero, fieldnames=nombres_de_columnas, delimiter=";")
        escritor.writeheader()
        escritor.writerows(filas)


def inicio_de_campo_iso(fila):
    """Primer día de campo de una fila de Wikipedia, en ISO (o el último día si la fecha no se puede leer)."""
    try:
        fin = date.fromisoformat(fila["fin_campo"])
    except ValueError:
        return ""
    return solapamiento_de_campo.inicio_de_campo(fila["fecha_texto"], fin).isoformat()


def claves_regionales_existentes(filas):
    """Claves (región, casa, fin de campo) y (región, casa, primer día de campo): una misma encuesta puede traer un día de diferencia en el fin de campo entre fuentes,
    pero no en el primero, mientras que las entregas distintas de un tracking empiezan en días distintos."""
    claves = set()
    for fila in filas:
        casa = firma_normalizada(fila["firma"])
        claves.add((fila["region"], casa, "fin", fila["fin_campo"]))
        claves.add((fila["region"], casa, "inicio", inicio_de_campo_iso(fila)))
        if fila["muestra"] != "":
            # La misma encuesta con otro nombre de casa («OBEDE» y «OBEDE-UCAM», «GESOP» y «CEO»): mismo territorio, mismo fin de campo y misma muestra
            claves.add((fila["region"], "muestra", fila["fin_campo"], str(fila["muestra"])))
    return claves


def claves_nacionales_existentes(filas):
    """(casas normalizadas con fin de campo, clientes normalizados con fin de campo) de la convocatoria próxima."""
    por_casa = set()
    por_cliente = set()
    for fila in filas:
        if fila["convocatoria"] != CONVOCATORIA_NACIONAL:
            continue
        por_casa.add((firma_normalizada(fila["firma"]), fila["fin_campo"]))
        por_casa.add((firma_normalizada(fila["firma"]), "inicio " + inicio_de_campo_iso(fila)))
        if fila["muestra"] != "":
            por_casa.add(("muestra", fila["fin_campo"], str(fila["muestra"])))
        if fila["cliente"]:
            por_cliente.add((firma_normalizada(fila["cliente"]), fila["fin_campo"]))
    return por_casa, por_cliente


def filas_regionales_de(encuesta, region, nombres_de_columnas):
    filas = []
    for nombre, porcentaje in encuesta["valores"]:
        partido = nombre_de_partido(nombre, region)
        if partido is None or porcentaje == 0:
            continue
        fila = {columna: "" for columna in nombres_de_columnas}
        fila.update({"region": region, "firma": encuesta["casa"], "cliente": encuesta["cliente"], "fecha_texto": fecha_como_en_wikipedia(encuesta["primer_dia"], encuesta["ultimo_dia"]),
                     "fin_campo": encuesta["ultimo_dia"].isoformat(), "muestra": encuesta["muestra"], "es_resultado_real": 0, "partido": partido, "porcentaje": porcentaje,
                     "enlaces": json.dumps([encuesta["enlace"]], ensure_ascii=False)})
        filas.append(fila)
    return filas


def filas_nacionales_de(encuesta, nombres_de_columnas):
    filas = []
    for nombre, porcentaje in encuesta["valores"]:
        partido = nombre_de_partido(nombre, None)
        if partido is None or porcentaje == 0:
            continue
        fila = {columna: "" for columna in nombres_de_columnas}
        fila.update({"convocatoria": CONVOCATORIA_NACIONAL, "pagina": PAGINA_NACIONAL, "tabla": "1", "firma": encuesta["casa"], "cliente": encuesta["cliente"],
                     "fecha_texto": fecha_como_en_wikipedia(encuesta["primer_dia"], encuesta["ultimo_dia"]), "anio_inferido": encuesta["ultimo_dia"].year,
                     "fin_campo": encuesta["ultimo_dia"].isoformat(), "muestra": encuesta["muestra"], "partido": partido, "valor_texto": "%s" % porcentaje, "valor": porcentaje})
        filas.append(fila)
    return filas


def descartes_de_partidos(encuesta, region):
    return [nombre for nombre, _ in encuesta["valores"] if nombre_de_partido(nombre, region) is None and clave_de_partido(nombre) not in NOMBRES_QUE_NO_SON_PARTIDOS]


def completar_regionales(simular, hoy):
    nombres_de_columnas, filas_existentes = cargar_filas(RUTA_REGIONAL)
    existentes = claves_regionales_existentes(filas_existentes)
    corte = hoy - timedelta(days=DIAS_REGIONALES)
    nuevas = []
    for entrada in descargar_entradas("Generales_CCAA"):
        encuesta = interpretar_entrada(entrada)
        if encuesta is None or not (corte <= encuesta["ultimo_dia"] <= hoy):
            continue
        region = REGION_DE_TITULAR.get(sin_tildes_y_mayusculas(encuesta["ambito"]))
        if region is None:
            print("  [regional] ámbito desconocido, se descarta: %s" % encuesta["ambito"])
            continue
        casa = firma_normalizada(encuesta["casa"])
        clave = (region, casa, "fin", encuesta["ultimo_dia"].isoformat())
        clave_de_inicio = (region, casa, "inicio", encuesta["primer_dia"].isoformat())
        clave_de_muestra = (region, "muestra", encuesta["ultimo_dia"].isoformat(), str(encuesta["muestra"]))
        if clave in existentes or clave_de_inicio in existentes or (encuesta["muestra"] != "" and clave_de_muestra in existentes):
            continue
        filas = filas_regionales_de(encuesta, region, nombres_de_columnas)
        if len(filas) < 3:
            print("  [regional] menos de 3 partidos reconocidos, se descarta: %s %s %s" % (region, encuesta["casa"], encuesta["ultimo_dia"]))
            continue
        existentes.add(clave)
        existentes.add(clave_de_inicio)
        existentes.add(clave_de_muestra)
        nuevas += filas
        sin_mapa = descartes_de_partidos(encuesta, region)
        print("  [regional] NUEVA %-20s %-14s %s (muestra %s) %d partidos%s" % (region, encuesta["casa"], fecha_como_en_wikipedia(encuesta["primer_dia"], encuesta["ultimo_dia"]),
                                                                       encuesta["muestra"], len(filas), ("; sin mapear: %s" % ", ".join(sin_mapa)) if sin_mapa else ""))
    if nuevas and not simular:
        guardar_filas(RUTA_REGIONAL, nombres_de_columnas, filas_existentes + nuevas)
    return len(nuevas)


def completar_nacionales(simular, hoy):
    nombres_de_columnas, filas_existentes = cargar_filas(RUTA_NACIONAL)
    por_casa, por_cliente = claves_nacionales_existentes(filas_existentes)
    corte = hoy - timedelta(days=DIAS_NACIONALES)
    nuevas = []
    for entrada in descargar_entradas("Generales"):
        encuesta = interpretar_entrada(entrada)
        if encuesta is None or not (corte <= encuesta["ultimo_dia"] <= hoy) or sin_tildes_y_mayusculas(encuesta["ambito"]) not in ("ESPANA", "ESPAÑA"):
            continue
        fin = encuesta["ultimo_dia"].isoformat()
        clave_casa = (firma_normalizada(encuesta["casa"]), fin)
        clave_de_inicio = (firma_normalizada(encuesta["casa"]), "inicio " + encuesta["primer_dia"].isoformat())
        clave_cliente = (firma_normalizada(encuesta["cliente"]), fin) if encuesta["cliente"] else None
        clave_de_muestra = ("muestra", fin, str(encuesta["muestra"]))
        if clave_casa in por_casa or clave_de_inicio in por_casa or (clave_cliente and clave_cliente in por_cliente) or (encuesta["muestra"] != "" and clave_de_muestra in por_casa):
            continue
        filas = filas_nacionales_de(encuesta, nombres_de_columnas)
        if len(filas) < 4:
            print("  [nacional] menos de 4 partidos reconocidos, se descarta: %s %s" % (encuesta["casa"], encuesta["ultimo_dia"]))
            continue
        por_casa.add(clave_casa)
        por_casa.add(clave_de_inicio)
        por_casa.add(clave_de_muestra)
        if clave_cliente:
            por_cliente.add(clave_cliente)
        nuevas += filas
        sin_mapa = descartes_de_partidos(encuesta, None)
        print("  [nacional] NUEVA %-14s %s (cliente %s, muestra %s) %d partidos%s" % (encuesta["casa"], fecha_como_en_wikipedia(encuesta["primer_dia"], encuesta["ultimo_dia"]), encuesta["cliente"],
                                                                                 encuesta["muestra"], len(filas), ("; sin mapear: %s" % ", ".join(sin_mapa)) if sin_mapa else ""))
    if nuevas and not simular:
        guardar_filas(RUTA_NACIONAL, nombres_de_columnas, filas_existentes + nuevas)
    return len(nuevas)


def main():
    simular = "--simular" in sys.argv
    hoy = datetime.now(timezone.utc).date()
    try:
        regionales = completar_regionales(simular, hoy)
        nacionales = completar_nacionales(simular, hoy) if "--con-nacionales" in sys.argv else 0
    except Exception as error:  # la red o el formato de la página no deben romper el workflow: se sigue con Wikipedia sola
        print("Electogrāfica no disponible (%s: %s): se sigue solo con Wikipedia." % (type(error).__name__, error))
        return
    print("Electogrāfica: %d filas regionales y %d nacionales %s." % (regionales, nacionales, "que se añadirían" if simular else "añadidas"))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
