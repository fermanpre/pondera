"""
Genera las páginas estáticas del sitio PONDERA en Web/sitio/ a partir de:
  - Web/plantillas/<nombre>.html : contenido de cada página (sin cabecera ni pie);
  - Web/changelog.json           : historial de cambios (fecha, titulo, texto), de más reciente a más antiguo.

Escribe: las páginas .html, changelog.html, 404.html, feed.xml (RSS del changelog), sitemap.xml, robots.txt, assets/favicon.svg y assets/og-image.png.
No toca los datos (serie_promedio.*, datos_modelo.*) ni los scripts de la previsión.

Uso: python generar_sitio.py
"""

import html
import json
import re
import shutil
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

CARPETA = Path(__file__).resolve().parent
CARPETA_SITIO = CARPETA / "sitio"
CARPETA_PLANTILLAS = CARPETA / "plantillas"
RUTA_CHANGELOG = CARPETA / "changelog.json"

BASE_URL = "https://fermanpre.github.io/pondera"
NOMBRE_SITIO = "PONDERA"
LEMA = "Elecciones generales 2026"
# Versión de esta generación del sitio (23/11/2026): se añade como «?v=...» a los scripts y a la hoja de estilo propios. GitHub Pages sirve los ficheros con Cache-Control: max-age=600, así que sin
# ella una página puede enseñar durante diez minutos un fichero de datos de un ciclo anterior junto a otros del ciclo actual (el escenario de la portada y el de la página de un partido, por ejemplo).
VERSION_DE_LA_GENERACION = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
URL_REPOSITORIO = "https://github.com/fermanpre/pondera"

SCRIPTS_DE_PREVISION = ["datos_modelo.js", "datos_mapa_2023.js", "resultados_2023.js", "assets/comun.js", "assets/partidos.js", "motor.js", "assets/hemiciclo.js", "escenario_representativo.js", "assets/app_prevision.js"]
SCRIPTS_DE_COMUNIDADES = ["datos_modelo.js", "datos_votos.js", "datos_mapa_2023.js", "resultados_2023.js", "assets/comun.js", "assets/territorios.js", "motor.js", "assets/hemiciclo.js", "serie_territorial.js", "assets/serie_territorial.js", "assets/cis_otros_por_comunidad.js", "assets/origen_escanos_fv.js", "assets/promedio_territorio.js", "escenario_representativo.js", "assets/app_prevision.js"]
SCRIPTS_DE_PARTIDOS = ["assets/comun.js", "assets/territorios.js", "datos_partidos.js", "assets/app_partido.js"]
SCRIPTS_DE_PROVINCIAS = SCRIPTS_DE_COMUNIDADES + ["voto_util.js", "assets/voto_util.js"]  # voto_util.js: escaños en juego y voto útil (Web/voto_util_provincias.js)
# Inicio reúne escaños, mapa, promedio y sondeos. Los datos pesados del promedio y de los sondeos los carga assets/carga_diferida.js al acercarse a su sección.
SCRIPTS_DEL_SENADO = ["senado.js", "senado_designados.js", "assets/comun.js", "assets/app_senado.js"]
SCRIPTS_DE_MUNDOS = ["mundos.js", "assets/comun.js", "assets/hemiciclo.js", "assets/mundos_posibles.js"]  # mundos.js lo calcula Web/mundos_posibles.js (node) en el workflow
SCRIPTS_DE_MUNDOS_RAROS = ["mundos_raros.js", "assets/comun.js", "assets/hemiciclo.js", "assets/mundos_posibles.js"]  # mundos_raros.js lo calcula Web/mundos_raros.js (node) en el workflow
SCRIPTS_DE_CURIOSIDADES = ["curiosidades.js", "assets/comun.js", "assets/curiosidades.js", "assets/app_curiosidades.js"]
SCRIPTS_DE_INICIO = ["datos_modelo.js", "datos_votos.js", "datos_mapa_2023.js", "resultados_2023.js", "assets/comun.js", "assets/partidos.js", "motor.js", "assets/hemiciclo.js", "escenario_representativo.js", "assets/app_prevision.js", "assets/mayorias_congreso.js", "assets/app_mapa.js", "assets/carga_diferida.js", "assets/subnav.js", "curiosidades.js", "assets/curiosidades.js"]

# Cinta principal (grupo, texto, página a la que lleva) y segunda cinta de cada grupo (texto, destino; «#...» = sección de la misma página)
MENU_PRINCIPAL = [("prevision", "Congreso", "index.html"), ("territorio", "Territorios", "territorios.html"), ("partido", "Partidos", "partidos.html"), ("simulador", "Simulador", "simulador.html"),
                  ("mundos", "Mundos posibles", "mundos.html"), ("mundos_raros", "Mundos raros", "mundos_raros.html"), ("curiosidades", "Datos curiosos", "curiosidades.html"),
                  ("senado", "Senado", "senado.html"), ("metodologia", "Metodología", "metodologia.html"), ("acerca", "Acerca de", "acerca.html")]
SUBMENUS = {
    "prevision": [("Escaños", "#nacional"), ("Mayorías", "#mayorias"), ("Mapa", "#mapa"), ("Evolución", "#evolucion"), ("Promedio", "#promedio"), ("Sondeos", "#sondeos")],
    "territorio": [("Todos los territorios", "territorios.html"), ("Provincias", "provincias.html"), ("Comunidades", "comunidades.html"), ("Resumen", "resumen.html")],
    "acerca": [("Acerca de", "acerca.html"), ("Enlaces", "enlaces.html"), ("Sobre el autor", "autor.html"), ("Privacidad y cookies", "privacidad.html"), ("Historial de cambios", "changelog.html")],
}
# Páginas que se integraron en Inicio: se conservan como redirecciones para que los enlaces antiguos sigan funcionando
REDIRECCIONES = {"promedio.html": "index.html#promedio", "sondeos.html": "index.html#sondeos", "regionales.html": "index.html#sondeos-subnacionales", "mapa.html": "index.html#mapa"}

# archivo, plantilla, título, descripción, grupo de la cinta principal, scripts de la página
PAGINAS = [
    {"archivo": "index.html", "plantilla": "inicio", "titulo": "Previsión de escaños", "grupo": "prevision", "scripts": SCRIPTS_DE_INICIO, "probabilidades": True,
     "descripcion": "Previsión de escaños de las elecciones generales de España del 29 de noviembre de 2026: promedio de encuestas, mapa por provincia, rangos y probabilidades de mayoría."},
    {"archivo": "senado.html", "plantilla": "senado", "titulo": "Previsión del Senado", "grupo": "senado", "scripts": SCRIPTS_DEL_SENADO, "probabilidades": True,
     "descripcion": "Senadores que elegirán los votantes en las generales de 2026: reparto por partido con rangos, escenarios de pactos y probabilidades en cada circunscripción."},
    {"archivo": "mundos.html", "plantilla": "mundos", "titulo": "Mundos posibles", "grupo": "mundos", "scripts": SCRIPTS_DE_MUNDOS,
     "descripcion": "Diez maneras en las que podría quedar el Congreso en las generales de 2026, desde un resultado muy malo para la derecha hasta uno muy bueno, con más mundos cerca de lo más probable."},
    {"archivo": "mundos_raros.html", "plantilla": "mundos_raros", "titulo": "Mundos raros", "grupo": "mundos_raros", "scripts": SCRIPTS_DE_MUNDOS_RAROS, "probabilidades": True,
     "descripcion": "Sucesos que ocurren en una de cada cien o de cada mil simulaciones del Congreso, cada uno con un mundo en el que pasa: partidos que aparecen, que desaparecen o que suben mucho."},
    {"archivo": "curiosidades.html", "plantilla": "curiosidades", "titulo": "Datos curiosos", "grupo": "curiosidades", "scripts": SCRIPTS_DE_CURIOSIDADES, "probabilidades": True,
     "descripcion": "Listado de los datos curiosos de la previsión: partidos que caen por la barrera, votos que separan de un escaño, provincias inciertas y votos que más pesan."},
    {"archivo": "territorios.html", "plantilla": "territorios", "titulo": "Territorios", "grupo": "territorio", "scripts": [],
     "descripcion": "Una página propia para cada provincia y cada comunidad autónoma: previsión de voto y escaños, probabilidades y promedio de encuestas en las generales de 2026."},
    {"archivo": "partidos.html", "plantilla": "partidos", "titulo": "Partidos", "grupo": "partido", "scripts": [],
     "descripcion": "Una página para cada partido: voto previsto en cada circunscripción con sus rangos del 80 % y del 95 %, y mapa de España con el voto como tono de su color, en las generales de 2026."},
    {"archivo": "provincias.html", "plantilla": "provincias", "titulo": "Previsión por provincia", "grupo": "territorio", "scripts": SCRIPTS_DE_PROVINCIAS, "probabilidades": True,
     "descripcion": "Voto previsto, escaños y probabilidad de cada resultado en las 52 circunscripciones de las generales de 2026."},
    {"archivo": "comunidades.html", "plantilla": "comunidades", "titulo": "Previsión por comunidad", "grupo": "territorio", "scripts": SCRIPTS_DE_COMUNIDADES, "probabilidades": True,
     "descripcion": "Voto previsto, escaños y probabilidad de cada resultado en cada comunidad autónoma de las generales de 2026, con los resultados de 2023."},
    {"archivo": "resumen.html", "plantilla": "resumen", "titulo": "Resumen por provincia", "grupo": "territorio", "scripts": [],
     "descripcion": "Escaños y porcentaje de voto previstos de cada partido en cada provincia, con descarga en CSV y XLSX."},
    {"archivo": "simulador.html", "plantilla": "simulador", "titulo": "Simulador", "grupo": "simulador", "probabilidades": True, "scripts": SCRIPTS_DE_PREVISION + ["encuestas_recientes.js", "assets/promedio_propio.js", "assets/app_mapa.js"],
     "descripcion": "Simulador de escaños: fija el voto de cada partido y mira cómo cambia el reparto en España y en cada provincia."},
    {"archivo": "metodologia.html", "plantilla": "metodologia", "titulo": "Metodología", "grupo": "metodologia", "scripts": [],
     "descripcion": "Cómo se calcula el promedio de encuestas, el reparto por provincia, los escaños y la incertidumbre."},
    {"archivo": "acerca.html", "plantilla": "acerca", "titulo": "Acerca de PONDERA", "grupo": "acerca", "scripts": [],
     "descripcion": "Qué es PONDERA, qué contiene y cómo se mantiene."},
    {"archivo": "autor.html", "plantilla": "autor", "titulo": "Sobre el autor", "grupo": "acerca", "scripts": [],
     "descripcion": "Sobre el autor de PONDERA."},
    {"archivo": "enlaces.html", "plantilla": "enlaces", "titulo": "Enlaces", "grupo": "acerca", "scripts": [],
     "descripcion": "Fuentes de los datos de PONDERA y otros sitios relacionados."},
    {"archivo": "privacidad.html", "plantilla": "privacidad", "titulo": "Privacidad y cookies", "grupo": "acerca", "scripts": [],
     "descripcion": "Qué datos guarda PONDERA y cómo controlar las cookies."},
    {"archivo": "cerveza.html", "plantilla": "cerveza", "titulo": "Invítame a una cerveza", "grupo": "acerca", "scripts": [],
     "descripcion": "Una opción, sin expectativas, para invitar al autor a una cerveza."},
]

ID_DE_MEDICION_DE_GOOGLE_ANALYTICS = "G-EPHEWLQSRW"
# Google Analytics ya no se carga en la cabecera: lo carga assets/cookies.js solo si el visitante acepta (el identificador está en ese fichero).
ETIQUETA_DE_GOOGLE_ANALYTICS = ""

SCRIPT_DE_TEMA_EN_CABECERA = (
    "<script>try{var t=localStorage.getItem('pondera-tema');if(t==='claro'||t==='oscuro'){document.documentElement.setAttribute('data-tema',t);}}catch(e){}</script>"
)

FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="12" fill="#1f4e79"/>
<rect x="12" y="34" width="10" height="18" rx="2" fill="#7fb0dd"/>
<rect x="27" y="22" width="10" height="30" rx="2" fill="#ffffff"/>
<rect x="42" y="12" width="10" height="40" rx="2" fill="#b3261e"/>
</svg>
"""


def escapar(texto):
    return html.escape(texto, quote=True)


def leer_changelog():
    entradas = json.loads(RUTA_CHANGELOG.read_text(encoding="utf-8"))
    return sorted(entradas, key=lambda entrada: entrada["fecha"], reverse=True)


def fecha_larga(fecha_iso):
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    anio, mes, dia = (int(parte) for parte in fecha_iso.split("-"))
    return "%d de %s de %d" % (dia, meses[mes - 1], anio)


def construir_pagina(pagina, contenido, prefijo=""):
    """Envuelve el contenido con cabecera, menú, pie y metaetiquetas. «prefijo» se antepone a las rutas (la 404 usa la URL absoluta)."""
    titulo_completo = "%s · %s" % (pagina["titulo"], NOMBRE_SITIO)
    url_canonica = "%s/%s" % (BASE_URL, "" if pagina["archivo"] == "index.html" else pagina["archivo"])
    enlaces_del_menu = []
    for grupo, rotulo, destino in MENU_PRINCIPAL:
        actual = ' aria-current="page"' if pagina.get("grupo") == grupo else ""
        enlaces_del_menu.append('<a href="%s%s"%s>%s</a>' % (prefijo, destino, actual, escapar(rotulo)))
    segunda_cinta = ""
    if pagina.get("grupo") in SUBMENUS:
        enlaces = []
        for rotulo, destino in SUBMENUS[pagina["grupo"]]:
            enlace = destino if destino.startswith("#") else prefijo + destino
            actual = ' aria-current="page"' if destino == pagina["archivo"] else ""
            enlaces.append('<a href="%s"%s>%s</a>' % (enlace, actual, escapar(rotulo)))
        segunda_cinta = '<nav class="subnav" aria-label="Secciones de esta página"><div class="interior">%s</div></nav>' % "".join(enlaces)
    # Botón global de probabilidades (porcentajes o «x de cada y»): solo en las páginas que enseñan probabilidades
    boton_probabilidades = ('<button id="boton-probabilidades" type="button" aria-label="Mostrar las probabilidades como porcentajes o como x de cada y">Probabilidades: %</button>\n    '
                            if pagina.get("probabilidades") else "")
    scripts = "\n".join('<script src="%s%s?v=%s"></script>' % (prefijo, ruta, VERSION_DE_LA_GENERACION) for ruta in ["assets/tema.js", "assets/probabilidad.js", "assets/veda.js", "assets/cookies.js", "ultima_actualizacion.js", "assets/actualizacion.js"] + pagina["scripts"])

    return """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{etiqueta_base}<title>{titulo_completo}</title>
<meta name="description" content="{descripcion}">
<link rel="canonical" href="{url_canonica}">
<link rel="icon" type="image/svg+xml" href="{prefijo}assets/favicon.svg">
<link rel="alternate" type="application/rss+xml" title="{nombre} · Historial de cambios" href="{prefijo}feed.xml">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="{nombre}">
<meta property="og:title" content="{titulo_completo}">
<meta property="og:description" content="{descripcion}">
<meta property="og:url" content="{url_canonica}">
<meta property="og:image" content="{imagen}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{titulo_completo}">
<meta name="twitter:description" content="{descripcion}">
<meta name="twitter:image" content="{imagen}">
<link rel="stylesheet" href="{prefijo}assets/estilo.css?v={version}">
{script_de_tema}
</head>
<body>
<header class="cabecera-sitio">
  <div class="interior">
    <a class="marca" href="{prefijo}index.html">{nombre}<small>{lema}</small></a>
    <nav class="principal" aria-label="Principal">
      {menu}
    </nav>
    {boton_probabilidades}<button id="boton-tema" type="button" aria-label="Cambiar tema claro, oscuro o automático">Tema: auto</button>
  </div>
</header>
<div class="retroacronimo"><div class="interior"><b>P</b>ronóstico <b>O</b>rdenado de <b>N</b>oticias, <b>D</b>atos y <b>E</b>ncuestas, con <b>R</b>esultados y <b>A</b>nálisis</div></div>
{segunda_cinta}
<main class="contenedor">
{contenido}
</main>
<footer class="pie contenedor">
  <p class="nota" id="actualizacion-pie"></p>
  <p>PONDERA es un proyecto personal, no está asociado a ningún partido, medio ni empresa demoscópica. Es una previsión estadística, no una encuesta. Encuestas: tablas de Wikipedia (CC BY-SA 4.0).</p>
  <nav aria-label="Pie">
    <a href="{prefijo}LICENSE">Licencia</a>
    <a href="{prefijo}privacidad.html">Privacidad y cookies</a>
    <a href="#" id="abrir-cookies">Preferencias de cookies</a>
    <a href="{prefijo}changelog.html">Historial de cambios</a>
    <a href="{prefijo}feed.xml">RSS</a>
    <a href="{prefijo}acerca.html">Acerca de</a>
    <a href="{prefijo}autor.html">Sobre el autor</a>
    <a href="{prefijo}enlaces.html">Enlaces</a>
    <a href="{prefijo}cerveza.html">Invítame a una cerveza</a>
    <a href="{url_repositorio}">GitHub</a>
  </nav>
</footer>
{scripts}
</body>
</html>
""".format(
        titulo_completo=escapar(titulo_completo), descripcion=escapar(pagina["descripcion"]), url_canonica=url_canonica, prefijo=prefijo,
        nombre=NOMBRE_SITIO, lema=escapar(LEMA), base_url=BASE_URL, script_de_tema=SCRIPT_DE_TEMA_EN_CABECERA + ETIQUETA_DE_GOOGLE_ANALYTICS, menu="\n      ".join(enlaces_del_menu),
        contenido=contenido, scripts=scripts, url_repositorio=URL_REPOSITORIO, segunda_cinta=segunda_cinta, boton_probabilidades=boton_probabilidades,
        etiqueta_base=('<base href="%s">\n' % pagina["base"]) if pagina.get("base") else "",
        version=VERSION_DE_LA_GENERACION,
        imagen=pagina.get("imagen") or (BASE_URL + "/assets/og-image.png"))


def contenido_del_changelog(entradas):
    trozos = ['<div class="cabecera-pagina">', "  <h1>Historial de cambios</h1>",
              '  <p class="subtitulo">Registro de las actualizaciones reales del sitio, de la más reciente a la más antigua. Las actualizaciones diarias automáticas del promedio no se anotan aquí. <a href="feed.xml">RSS</a>.</p>',
              "</div>", '<section id="cambios">']
    for entrada in entradas:
        trozos.append('  <article class="entrada-cambio"><time datetime="%s">%s</time><h3>%s</h3><p>%s</p></article>' % (
            entrada["fecha"], fecha_larga(entrada["fecha"]), escapar(entrada["titulo"]), escapar(entrada["texto"])))
    trozos.append("</section>")
    return "\n".join(trozos)


def construir_feed(entradas):
    elementos = []
    for posicion, entrada in enumerate(entradas):
        fecha = datetime.strptime(entrada["fecha"], "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc)
        elementos.append("""  <item>
    <title>{titulo}</title>
    <link>{base}/changelog.html</link>
    <guid isPermaLink="false">{base}/changelog.html#{fecha}-{posicion}</guid>
    <pubDate>{fecha_rss}</pubDate>
    <description>{texto}</description>
  </item>""".format(titulo=escapar(entrada["titulo"]), base=BASE_URL, fecha=entrada["fecha"], posicion=posicion,
                    fecha_rss=fecha.strftime("%a, %d %b %Y %H:%M:%S +0000"), texto=escapar(entrada["texto"])))
    return """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>{nombre} · Historial de cambios</title>
  <link>{base}/changelog.html</link>
  <atom:link href="{base}/feed.xml" rel="self" type="application/rss+xml" />
  <description>Actualizaciones reales de {nombre}: previsión de escaños de las elecciones generales de 2026.</description>
  <language>es-es</language>
{elementos}
</channel>
</rss>
""".format(nombre=NOMBRE_SITIO, base=BASE_URL, elementos="\n".join(elementos))


def construir_mapa_del_sitio(entradas, direcciones_extra=()):
    ultima_modificacion = entradas[0]["fecha"]
    direcciones = ["", "changelog.html"] + [pagina["archivo"] for pagina in PAGINAS if pagina["archivo"] != "index.html"] + list(direcciones_extra)
    lineas = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for direccion in direcciones:
        lineas.append("  <url><loc>%s/%s</loc><lastmod>%s</lastmod></url>" % (BASE_URL, direccion, ultima_modificacion))
    lineas.append("</urlset>")
    return "\n".join(lineas) + "\n"


def leer_nombres_y_colores_de_partidos():
    """(NOMBRES, COLORES) de assets/comun.js, para dibujar los partidos con el mismo nombre y color que la web."""
    texto = (CARPETA_SITIO / "assets" / "comun.js").read_text(encoding="utf-8")

    def leer_objeto(nombre):
        bloque = re.search(r"const %s = \{(.*?)\};" % nombre, texto, flags=re.S).group(1)
        return {clave: valor for clave, valor in re.findall(r'(\w+):\s*"([^"]*)"', bloque)}
    return leer_objeto("NOMBRES"), leer_objeto("COLORES")


def cargar_fuente_de_imagen(tamano, negrita):
    from PIL import ImageFont
    nombres = ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"] if negrita else ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]
    for nombre in nombres:
        try:
            return ImageFont.truetype(nombre, tamano)
        except OSError:
            continue
    return ImageFont.load_default()


def crear_imagen_de_territorio(ruta, nombre, escanos_totales, filas, etiqueta_de_tipo):
    """Tarjeta de 1200x630: nombre del territorio, escaños en juego y, para los partidos con más escaños en la previsión central, barra, escaños y voto previsto.
    filas = [(nombre del partido, color, escaños, % de voto)]. Si Pillow no está disponible, se omite."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return False
    imagen = Image.new("RGB", (1200, 630), "#16171a")
    lienzo = ImageDraw.Draw(imagen)
    lienzo.rectangle([0, 0, 1200, 10], fill="#1f4e79")
    tamano_del_nombre = 84 if len(nombre) <= 14 else 66 if len(nombre) <= 22 else 54
    lienzo.text((60, 40), nombre, font=cargar_fuente_de_imagen(tamano_del_nombre, True), fill="#ececea")
    lienzo.text((62, 150), "%s · %d %s en el Congreso" % (etiqueta_de_tipo, escanos_totales, "escaño" if escanos_totales == 1 else "escaños"), font=cargar_fuente_de_imagen(32, False), fill="#a3a39d")
    lienzo.text((62, 196), "Previsión central, elecciones generales del 29N", font=cargar_fuente_de_imagen(26, False), fill="#7fb0dd")
    maximo = max([fila[2] for fila in filas] + [1])
    alto_de_fila = 52
    arriba = 262
    for posicion, (partido, color, escanos, voto) in enumerate(filas[:6]):
        y = arriba + posicion * (alto_de_fila + 8)
        lienzo.rounded_rectangle([60, y, 78, y + alto_de_fila - 8], radius=4, fill=color)
        lienzo.text((96, y + 2), partido, font=cargar_fuente_de_imagen(30, True), fill="#ececea")
        ancho_de_barra = max(8, int(500 * escanos / maximo)) if escanos else 8
        lienzo.rounded_rectangle([420, y + 6, 420 + ancho_de_barra, y + alto_de_fila - 14], radius=6, fill=color)
        lienzo.text((420 + ancho_de_barra + 16, y), str(escanos), font=cargar_fuente_de_imagen(34, True), fill="#ececea")
        lienzo.text((1040, y + 6), ("%.1f %%" % voto).replace(".", ","), font=cargar_fuente_de_imagen(28, False), fill="#a3a39d")
    lienzo.text((60, 584), "PONDERA · fermanpre.github.io/pondera", font=cargar_fuente_de_imagen(24, False), fill="#7fb0dd")
    imagen.save(ruta, optimize=True)
    return True


def crear_imagen_para_compartir(ruta):
    """Tarjeta de 1200x630 para Twitter y LinkedIn. Si Pillow no está disponible, se omite."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow no está instalado: se omite og-image.png")
        return

    def cargar_fuente(tamano, negrita):
        nombres = ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"] if negrita else ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]
        for nombre in nombres:
            try:
                return ImageFont.truetype(nombre, tamano)
            except OSError:
                continue
        return ImageFont.load_default()

    imagen = Image.new("RGB", (1200, 630), "#16171a")
    lienzo = ImageDraw.Draw(imagen)
    barras = [(120, 170, "#7fb0dd"), (260, 280, "#ffffff"), (400, 390, "#ff8a80")]
    for izquierda, altura, color in barras:
        lienzo.rounded_rectangle([izquierda, 560 - altura, izquierda + 90, 560], radius=10, fill=color)
    lienzo.text((560, 190), NOMBRE_SITIO, font=cargar_fuente(120, True), fill="#ececea")
    lienzo.text((564, 330), "Previsión de las elecciones generales", font=cargar_fuente(40, False), fill="#a3a39d")
    lienzo.text((564, 385), "del 29 de noviembre de 2026", font=cargar_fuente(40, False), fill="#a3a39d")
    lienzo.text((564, 480), "Promedio de encuestas, escaños por provincia y simulador", font=cargar_fuente(28, False), fill="#7fb0dd")
    imagen.save(ruta, optimize=True)


def unir_estilos():
    """Construye assets/estilo.css con las reglas de las secciones de datos y las del marco del sitio."""
    ruta_original = CARPETA_PLANTILLAS / "estilo_original.css"
    ruta_nueva = CARPETA_PLANTILLAS / "estilo_nuevo.css"
    if not (ruta_original.exists() and ruta_nueva.exists()):
        return
    lineas_originales = ruta_original.read_text(encoding="utf-8").split("\n")
    descartadas = ("header, main, footer", "header {", "h1 {", "footer {")
    conservadas = [linea for linea in lineas_originales if not linea.strip().startswith(descartadas)]
    texto = "\n".join(conservadas).rstrip() + "\n" + ruta_nueva.read_text(encoding="utf-8")
    texto = re.sub(r"^  ", "", texto, flags=re.M)
    (CARPETA_SITIO / "assets" / "estilo.css").write_text(texto, encoding="utf-8")


def incluir_fragmentos(contenido):
    """Sustituye cada «<!--INCLUIR nombre-->» por el contenido de plantillas/parciales/nombre.html.
    Admite argumentos: «<!--INCLUIR nombre | texto 1 | texto 2-->» sustituye los marcadores «{{1|valor por defecto}}», «{{2|...}}» del fragmento
    (si falta el argumento, se queda el valor por defecto); así una misma sección se reutiliza en varias páginas con otros rótulos."""
    def leer_fragmento(coincidencia):
        texto = (CARPETA_PLANTILLAS / "parciales" / (coincidencia.group(1) + ".html")).read_text(encoding="utf-8").strip()
        argumentos = [argumento.strip() for argumento in coincidencia.group(2).split(" | ")[1:]] if coincidencia.group(2) else []
        def sustituir(marcador):
            posicion = int(marcador.group(1))
            return argumentos[posicion - 1] if posicion <= len(argumentos) else marcador.group(2)
        return re.sub(r"\{\{(\d)\|([^}]*)\}\}", sustituir, texto)
    return re.sub(r"<!--INCLUIR (\w+)((?: \| .+?)?)-->", leer_fragmento, contenido)


# Direcciones de las subpáginas: nombre del modelo -> nombre en la dirección (provincias/navarra.html, comunidades/madrid.html)
SLUGS_ESPECIALES = {"Araba/Álava": "alava", "Balears (Illes)": "baleares", "Illes Balears": "baleares", "Comunidad de Madrid": "madrid", "Región de Murcia": "murcia",
                    "Coruña (A)": "a-coruna", "Palmas (Las)": "las-palmas", "Rioja (La)": "la-rioja", "La Rioja": "la-rioja"}


def quitar_tildes(texto):
    return "".join(letra for letra in unicodedata.normalize("NFD", texto) if unicodedata.category(letra) != "Mn")


def slug_de(nombre):
    if nombre in SLUGS_ESPECIALES:
        return SLUGS_ESPECIALES[nombre]
    primera_parte = nombre.split("/")[0]
    return re.sub(r"[^a-z0-9]+", "-", quitar_tildes(primera_parte).lower()).strip("-")


def nombre_visible(nombre):
    """«Coruña (A)» -> «A Coruña», «Palmas (Las)» -> «Las Palmas», «Balears (Illes)» -> «Illes Balears»; los demás, tal cual."""
    coincidencia = re.match(r"^(.*) \((.*)\)$", nombre)
    return "%s %s" % (coincidencia.group(2), coincidencia.group(1)) if coincidencia else nombre


def clave_alfabetica(nombre):
    return quitar_tildes(nombre).lower()


def leer_territorios():
    """(provincias, comunidades) del modelo: provincias = [{nombre, comunidad, escanos}], comunidades = {nombre: {escanos, provincias: [nombres]}}."""
    datos = json.loads((CARPETA_SITIO / "datos_modelo.json").read_text(encoding="utf-8"))
    provincias = sorted(({"nombre": p["nombre"], "comunidad": p["comunidad"], "escanos": p["escanos"]} for p in datos["provincias"]), key=lambda p: clave_alfabetica(p["nombre"]))
    comunidades = {}
    for provincia in provincias:
        comunidad = comunidades.setdefault(provincia["comunidad"], {"escanos": 0, "provincias": []})
        comunidad["escanos"] += provincia["escanos"]
        comunidad["provincias"].append(provincia["nombre"])
    return provincias, comunidades


def escribir_nombres_de_territorios(provincias, comunidades):
    """assets/territorios.js: nombre del modelo -> dirección, para que el selector de las páginas lleve a la subpágina del territorio elegido."""
    contenido = {"provincias": {p["nombre"]: slug_de(p["nombre"]) for p in provincias}, "comunidades": {nombre: slug_de(nombre) for nombre in comunidades}}
    (CARPETA_SITIO / "assets" / "territorios.js").write_text("// Direcciones de las subpáginas de cada territorio (las genera Web/generar_sitio.py)\nconst TERRITORIOS = %s;\n" % json.dumps(contenido, ensure_ascii=False), encoding="utf-8")


def lista_de_territorios_en_html(provincias, comunidades):
    """Índice de todos los territorios: cada comunidad con sus provincias, con enlaces a sus subpáginas."""
    partes = ['<div class="territorios-rejilla">']
    for nombre in sorted(comunidades, key=clave_alfabetica):
        comunidad = comunidades[nombre]
        escanos_de = {p["nombre"]: p["escanos"] for p in provincias}
        partes.append('<section class="territorio-comunidad"><h3><a href="comunidades/%s.html">%s</a> <small>%d escaños</small></h3>' % (slug_de(nombre), escapar(nombre_visible(nombre)), comunidad["escanos"]))
        if len(comunidad["provincias"]) > 1 or comunidad["provincias"][0] != nombre:
            partes.append("<ul>")
            for provincia in comunidad["provincias"]:
                partes.append('<li><a href="provincias/%s.html">%s</a> <small>%d</small></li>' % (slug_de(provincia), escapar(nombre_visible(provincia)), escanos_de[provincia]))
            partes.append("</ul>")
        else:
            partes.append('<p class="nota"><a href="provincias/%s.html">Provincia de %s</a> (uniprovincial)</p>' % (slug_de(comunidad["provincias"][0]), escapar(nombre_visible(nombre))))
        partes.append("</section>")
    partes.append("</div>")
    return "\n".join(partes)


def construir_subpaginas(provincias, comunidades):
    """Una página por provincia y por comunidad: la misma de provincias.html o comunidades.html con el territorio ya elegido, su propio título, descripción y dirección. Devuelve las direcciones creadas."""
    direcciones = []
    nombres_de_partido, colores_de_partido = leer_nombres_y_colores_de_partidos()
    datos_del_modelo = json.loads((CARPETA_SITIO / "datos_modelo.json").read_text(encoding="utf-8"))
    escanos_centrales = json.loads((CARPETA_SITIO / "prueba_python.json").read_text(encoding="utf-8"))["escanos"]
    (CARPETA_SITIO / "assets" / "og").mkdir(parents=True, exist_ok=True)
    for tipo, plantilla, carpeta, scripts in (("provincia", "provincias", "provincias", SCRIPTS_DE_PROVINCIAS), ("comunidad", "comunidades", "comunidades", SCRIPTS_DE_COMUNIDADES)):
        (CARPETA_SITIO / carpeta).mkdir(parents=True, exist_ok=True)
        base_de_la_plantilla = incluir_fragmentos((CARPETA_PLANTILLAS / (plantilla + ".html")).read_text(encoding="utf-8").rstrip())
        territorios = provincias if tipo == "provincia" else [{"nombre": n, "comunidad": n, "escanos": c["escanos"]} for n, c in comunidades.items()]
        for territorio in territorios:
            nombre_del_modelo, escanos = territorio["nombre"], territorio["escanos"]
            nombre = nombre_visible(nombre_del_modelo)
            slug = slug_de(nombre_del_modelo)
            etiqueta = "provincia" if tipo == "provincia" else "comunidad autónoma"
            titulo = "%s: previsión por %s" % (nombre, etiqueta)
            if tipo == "provincia":
                subtitulo = "Voto previsto, escaños y probabilidad de cada resultado en %s (%s, %d %s)." % (nombre, territorio["comunidad"], escanos, "escaño" if escanos == 1 else "escaños")
            else:
                subtitulo = "Voto previsto, escaños y probabilidad de cada resultado en %s (%d escaños), sumando sus provincias." % (nombre, escanos)
            descripcion = "Previsión de voto y escaños en %s (%d %s) en las elecciones generales de 2026: probabilidad de cada resultado, promedio de encuestas y escaños en juego." % (nombre, escanos, "escaño" if escanos == 1 else "escaños")
            contenido = re.sub(r"<h1>.*?</h1>", lambda _m: "<h1>%s</h1>" % escapar(titulo), base_de_la_plantilla, count=1, flags=re.S)
            contenido = re.sub(r'<p class="subtitulo">.*?</p>', lambda _m: '<p class="subtitulo">%s</p>' % escapar(subtitulo), contenido, count=1, flags=re.S)
            contenido = ('<script>window.TERRITORIO_INICIAL = %s;</script>\n' % json.dumps({"tipo": tipo, "nombre": nombre_del_modelo}, ensure_ascii=False)) + contenido
            contenido += '\n<p class="nota"><a href="territorios.html">Todos los territorios</a></p>'
            archivo = "%s/%s.html" % (carpeta, slug)
            pagina = {"archivo": archivo, "titulo": titulo, "descripcion": descripcion, "grupo": "territorio", "scripts": scripts, "probabilidades": True, "base": "../"}
            provincias_del_territorio = [nombre_del_modelo] if tipo == "provincia" else comunidades[nombre_del_modelo]["provincias"]
            escanos_por_partido, voto_por_partido, peso_total = {}, {}, 0.0
            for provincia_del_modelo in datos_del_modelo["provincias"]:
                if provincia_del_modelo["nombre"] not in provincias_del_territorio:
                    continue
                peso_total += provincia_del_modelo["peso"]
                for partido, escanos_del_partido in escanos_centrales.get(provincia_del_modelo["nombre"], {}).items():
                    escanos_por_partido[partido] = escanos_por_partido.get(partido, 0) + escanos_del_partido
                for partido, cuota in provincia_del_modelo["cuotas"].items():
                    voto_por_partido[partido] = voto_por_partido.get(partido, 0.0) + cuota * provincia_del_modelo["peso"]
            nombres_de_coalicion = {}
            for coalicion in datos_del_modelo.get("coaliciones", []):
                if coalicion["provincia"] in provincias_del_territorio:   # UPN-PP en Navarra: una sola fila con los escaños de los dos
                    escanos_por_partido[coalicion["columna"]] = escanos_por_partido.get(coalicion["columna"], 0) + escanos_por_partido.pop(coalicion["socio"], 0)
                    nombres_de_coalicion[coalicion["columna"]] = coalicion["nombre"]
            filas_de_imagen = []
            for partido in sorted(escanos_por_partido, key=lambda p: (-escanos_por_partido[p], -voto_por_partido.get(p, 0))):
                filas_de_imagen.append((nombres_de_coalicion.get(partido) or nombres_de_partido.get(partido, partido), colores_de_partido.get(partido, "#7a7a75"), escanos_por_partido[partido], 100 * voto_por_partido.get(partido, 0.0) / peso_total))
            nombre_de_imagen = "%s-%s.png" % (carpeta, slug)
            if crear_imagen_de_territorio(CARPETA_SITIO / "assets" / "og" / nombre_de_imagen, nombre, escanos, filas_de_imagen, "Provincia" if tipo == "provincia" else "Comunidad"):
                pagina["imagen"] = "%s/assets/og/%s" % (BASE_URL, nombre_de_imagen)
            (CARPETA_SITIO / archivo).write_text(construir_pagina(pagina, contenido), encoding="utf-8")
            direcciones.append(archivo)
    return direcciones


SLUGS_DE_PARTIDOS = {
    "PP": "pp", "PSOE": "psoe", "VOX": "vox", "SUMAR": "frente-amplio", "PODEMOS": "podemos", "SALF": "salf", "ADELANTE": "adelante-andalucia", "FV": "front-valencia",
    "UPC": "upc", "ERC": "erc", "JUNTS": "junts", "BILDU": "eh-bildu", "PNV": "pnv", "BNG": "bng", "CC": "coalicion-canaria", "UPN": "upn", "PACMA": "pacma",
    "EXISTE": "coalicion-existe", "GBAI": "geroa-bai",
}
# Nota al pie de la página de cada partido que lo necesita (HTML)
NOTAS_DE_PARTIDO = {
    "PP": 'En Navarra el PP concurre en coalición con UPN (UPN-PP): sus votos y escaños están en la página de <a href="partidos/upn.html">UPN</a>, y por eso Navarra no figura en esta lista.',
    "UPN": 'En Navarra UPN concurre en coalición con el PP (UPN-PP): las cifras son las de la coalición, y sus escaños son los de UPN más los del PP en Navarra.',
    "SUMAR": 'El Frente Amplio es la marca de Sumar en 2026 con sus socios territoriales. No concurre con esa marca en Teruel, Ceuta ni Melilla, y en la Comunitat Valenciana y en Canarias va como <a href="partidos/front-valencia.html">Front Valencià</a> y <a href="partidos/upc.html">Unidad del Pueblo Canario</a>. Su 2023 es el de Sumar.',
    "PODEMOS": 'Podemos tiene cifra propia solo donde el modelo la separa del Frente Amplio; en 2023 su voto iba dentro de Sumar, así que no hay comparación con 2023.',
    "FV": 'Front Valencià reúne a Compromís, IU, Podemos y ERC en la Comunitat Valenciana. Su 2023 es el de Sumar (con Compromís) en esas tres provincias.',
    "UPC": 'Unidad del Pueblo Canario reúne a Podemos, Nueva Canarias e IU. Su 2023 es el de Sumar más Nueva Canarias en las dos provincias canarias.',
    "EXISTE": 'La Coalición Existe (Teruel Existe y Aragón Existe) tiene resultado de 2023 solo en Teruel; en Huesca y en Zaragoza no concurría con esa marca.',
    "GBAI": 'Geroa Bai tiene línea propia en el modelo desde el 22/11/2026 (antes estaba dentro de «Otros»). Su 2023 es el de la candidatura en Navarra.',
}


def leer_datos_de_partidos():
    """sitio/datos_partidos.json (lo escribe Web/datos_partidos.js) o None si aún no existe."""
    ruta = CARPETA_SITIO / "datos_partidos.json"
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else None


def escribir_direcciones_de_partidos():
    """assets/partidos.js: clave del partido en el modelo -> dirección de su página, para los enlaces de la tabla de la previsión nacional."""
    direcciones = {clave: "partidos/%s.html" % slug for clave, slug in SLUGS_DE_PARTIDOS.items()}
    (CARPETA_SITIO / "assets" / "partidos.js").write_text("// Direcciones de las páginas de cada partido (las genera Web/generar_sitio.py)\nconst PARTIDOS_PAGINAS = %s;\n" % json.dumps(direcciones, ensure_ascii=False), encoding="utf-8")


def lista_de_partidos_en_html(datos_de_partidos):
    """Índice de partidos: una tarjeta por partido, de mayor a menor voto nacional previsto."""
    nombres, colores = leer_nombres_y_colores_de_partidos()
    formato = lambda valor: ("%.1f" % valor).replace(".", ",")
    partes = ['<div class="partidos-rejilla">']
    for clave in sorted(datos_de_partidos["partidos"], key=lambda c: -datos_de_partidos["partidos"][c]["objetivo"]):
        datos = datos_de_partidos["partidos"][clave]
        escanos = datos["escanos"]
        rango = "%d-%d" % (escanos["p025"], escanos["p975"]) if escanos["p025"] != escanos["p975"] else "%d" % escanos["p025"]
        partes.append('<a class="partido-tarjeta" href="partidos/%s.html" style="--color:%s"><span class="partido-nombre"><span class="ficha" style="background:%s"></span><b>%s</b></span>'
                      '<span class="partido-cifras">%s %% del voto · %d escaños (%s) · %d %s</span></a>' % (
                          SLUGS_DE_PARTIDOS[clave], colores.get(clave, "#7a7a75"), colores.get(clave, "#7a7a75"), escapar(nombres.get(clave, clave)),
                          formato(datos["objetivo"]), escanos["mediana"], rango, len(datos["provincias"]), "circunscripción" if len(datos["provincias"]) == 1 else "circunscripciones"))
    partes.append("</div>")
    return "\n".join(partes)


def construir_paginas_de_partidos(datos_de_partidos):
    """Una página por partido (partidos/<slug>.html) a partir de plantillas/partido.html y de sitio/datos_partidos.json. Devuelve las direcciones creadas."""
    direcciones = []
    if not datos_de_partidos:
        return direcciones
    nombres, _colores = leer_nombres_y_colores_de_partidos()
    (CARPETA_SITIO / "partidos").mkdir(parents=True, exist_ok=True)
    base_de_la_plantilla = incluir_fragmentos((CARPETA_PLANTILLAS / "partido.html").read_text(encoding="utf-8").rstrip())
    base_de_la_plantilla = base_de_la_plantilla.replace("<!--SVG_PROVINCIAS-->", svg_de_provincias_para_incrustar())
    for clave, datos in datos_de_partidos["partidos"].items():
        nombre = nombres.get(clave, clave)
        slug = SLUGS_DE_PARTIDOS[clave]
        circunscripciones = len(datos["provincias"])
        titulo = "%s: voto previsto por circunscripción" % nombre
        subtitulo = "Voto previsto de %s en %s, con sus rangos del 80 %% y del 95 %%, y su voto en el mapa." % (nombre, "las %d circunscripciones donde concurre" % circunscripciones if circunscripciones > 1 else "la única circunscripción donde concurre")
        descripcion = "Voto previsto de %s en cada circunscripción en las elecciones generales de 2026, con rangos del 80 %% y del 95 %%, escaños y mapa de España." % nombre
        contenido = re.sub(r"<h1>.*?</h1>", lambda _m: "<h1>%s</h1>" % escapar(nombre), base_de_la_plantilla, count=1, flags=re.S)
        contenido = re.sub(r'<p class="subtitulo">.*?</p>', lambda _m: '<p class="subtitulo">%s</p>' % escapar(subtitulo), contenido, count=1, flags=re.S)
        contenido = '<script>window.PARTIDO_INICIAL = %s; window.NOTA_DEL_PARTIDO = %s;</script>\n' % (json.dumps(clave), json.dumps(NOTAS_DE_PARTIDO.get(clave, ""), ensure_ascii=False)) + contenido
        archivo = "partidos/%s.html" % slug
        pagina = {"archivo": archivo, "titulo": titulo, "descripcion": descripcion, "grupo": "partido", "scripts": SCRIPTS_DE_PARTIDOS, "base": "../"}
        (CARPETA_SITIO / archivo).write_text(construir_pagina(pagina, contenido), encoding="utf-8")
        direcciones.append(archivo)
    return direcciones


def pagina_de_redireccion(destino):
    return """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Esta página se ha integrado en Previsión · PONDERA</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="%s/%s">
<meta http-equiv="refresh" content="0; url=%s">
<script>location.replace(%s);</script>
</head>
<body>
<p>Esta página se ha integrado en <a href="%s">la página de Previsión</a>.</p>
</body>
</html>
""" % (BASE_URL, destino, destino, json.dumps(destino), destino)


def svg_de_provincias_para_incrustar():
    """El SVG de provincias sin cabecera XML, sin estilo propio (lo da estilo.css) y sin los textos de título y descripción generales."""
    texto = (CARPETA / "Mapa_provincias" / "provincias_espana.svg").read_text(encoding="utf-8")
    texto = re.sub(r"<\?xml[^>]*\?>\s*", "", texto)
    texto = re.sub(r"<style>.*?</style>\s*", "", texto, flags=re.S)
    texto = re.sub(r"<desc>.*?</desc>\s*", "", texto, flags=re.S)
    texto = re.sub(r"<title>Provincias de España</title>\s*", "", texto)
    return texto.strip()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    entradas = leer_changelog()
    (CARPETA_SITIO / "assets").mkdir(parents=True, exist_ok=True)
    # Hora (UTC) de esta generación del sitio: la enseñan todas las páginas como «última actualización» (assets/actualizacion.js)
    (CARPETA_SITIO / "ultima_actualizacion.js").write_text('const ULTIMA_ACTUALIZACION = "%s";\n' % datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), encoding="utf-8")
    unir_estilos()

    provincias_del_modelo, comunidades_del_modelo = leer_territorios()
    escribir_nombres_de_territorios(provincias_del_modelo, comunidades_del_modelo)
    escribir_direcciones_de_partidos()
    datos_de_partidos = leer_datos_de_partidos()
    for pagina in PAGINAS:
        contenido = (CARPETA_PLANTILLAS / (pagina["plantilla"] + ".html")).read_text(encoding="utf-8").rstrip()
        contenido = incluir_fragmentos(contenido)
        contenido = contenido.replace("<!--LISTA_DE_TERRITORIOS-->", lista_de_territorios_en_html(provincias_del_modelo, comunidades_del_modelo))
        if "<!--LISTA_DE_PARTIDOS-->" in contenido:
            contenido = contenido.replace("<!--LISTA_DE_PARTIDOS-->", lista_de_partidos_en_html(datos_de_partidos) if datos_de_partidos else '<p class="nota">Los datos de los partidos aún no se han calculado.</p>')
        if "<!--SVG_PROVINCIAS-->" in contenido:
            contenido = contenido.replace("<!--SVG_PROVINCIAS-->", svg_de_provincias_para_incrustar())
        (CARPETA_SITIO / pagina["archivo"]).write_text(construir_pagina(pagina, contenido), encoding="utf-8")

    direcciones_de_territorios = construir_subpaginas(provincias_del_modelo, comunidades_del_modelo)
    direcciones_de_territorios += construir_paginas_de_partidos(datos_de_partidos)

    for archivo_antiguo, destino in REDIRECCIONES.items():
        (CARPETA_SITIO / archivo_antiguo).write_text(pagina_de_redireccion(destino), encoding="utf-8")

    pagina_changelog = {"archivo": "changelog.html", "titulo": "Historial de cambios", "grupo": "acerca", "scripts": [],
                        "descripcion": "Registro de las actualizaciones reales de PONDERA."}
    (CARPETA_SITIO / "changelog.html").write_text(construir_pagina(pagina_changelog, contenido_del_changelog(entradas)), encoding="utf-8")

    pagina_404 = {"archivo": "404.html", "titulo": "Página no encontrada", "grupo": None, "scripts": [], "descripcion": "La página que buscas no existe."}
    contenido_404 = '<div class="cabecera-pagina"><h1>Página no encontrada</h1><p class="subtitulo">Esa dirección no existe. <a href="%s/">Vuelve al inicio</a>.</p></div>' % BASE_URL
    (CARPETA_SITIO / "404.html").write_text(construir_pagina(pagina_404, contenido_404, prefijo=BASE_URL + "/"), encoding="utf-8")

    shutil.copyfile(CARPETA / "Mapa_provincias" / "provincias_espana.svg", CARPETA_SITIO / "assets" / "provincias_espana.svg")
    (CARPETA_SITIO / "feed.xml").write_text(construir_feed(entradas), encoding="utf-8")
    (CARPETA_SITIO / "sitemap.xml").write_text(construir_mapa_del_sitio(entradas, direcciones_de_territorios), encoding="utf-8")
    (CARPETA_SITIO / "robots.txt").write_text("User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % BASE_URL, encoding="utf-8")
    (CARPETA_SITIO / "assets" / "favicon.svg").write_text(FAVICON_SVG, encoding="utf-8")
    if not (CARPETA_SITIO / "assets" / "og-image.png").exists():
        crear_imagen_para_compartir(CARPETA_SITIO / "assets" / "og-image.png")
    print("Sitio generado en %s: %d páginas, %d entradas de changelog." % (CARPETA_SITIO, len(PAGINAS) + 2 + len(direcciones_de_territorios), len(entradas)))


if __name__ == "__main__":
    main()
