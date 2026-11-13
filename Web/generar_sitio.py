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
import sys
from datetime import datetime, timezone
from pathlib import Path

CARPETA = Path(__file__).resolve().parent
CARPETA_SITIO = CARPETA / "sitio"
CARPETA_PLANTILLAS = CARPETA / "plantillas"
RUTA_CHANGELOG = CARPETA / "changelog.json"

BASE_URL = "https://fermanpre.github.io/pondera"
NOMBRE_SITIO = "PONDERA"
LEMA = "Elecciones generales 2026"
URL_REPOSITORIO = "https://github.com/fermanpre/pondera"

SCRIPTS_DE_PREVISION = ["datos_modelo.js", "assets/comun.js", "motor.js", "assets/app_prevision.js"]
SCRIPTS_DE_PROVINCIAS = ["datos_modelo.js", "resultados_2023.js", "assets/comun.js", "motor.js", "assets/app_prevision.js"]
SCRIPTS_DE_COMUNIDADES = SCRIPTS_DE_PROVINCIAS
SCRIPTS_DE_PROMEDIO = ["assets/comun.js", "serie_promedio.js", "encuestas_promedio.js", "grafico_promedio.js"]

# archivo, plantilla, título, descripción, texto del menú (None = no aparece en el menú), scripts de la página
PAGINAS = [
    {"archivo": "index.html", "plantilla": "inicio", "titulo": "Previsión de escaños", "menu": "Inicio", "scripts": SCRIPTS_DE_PREVISION,
     "descripcion": "Previsión de escaños de las elecciones generales de España del 29 de noviembre de 2026, con rangos, probabilidades de mayoría y reparto por provincia."},
    {"archivo": "promedio.html", "plantilla": "promedio", "titulo": "Promedio de encuestas", "menu": "Promedio", "scripts": SCRIPTS_DE_PROMEDIO,
     "descripcion": "Promedio diario de encuestas de las generales de 2026, día a día desde las elecciones de julio de 2023."},
    {"archivo": "sondeos.html", "plantilla": "listado", "titulo": "Listado de sondeos", "menu": "Sondeos", "scripts": ["assets/comun.js", "listado_sondeos.js", "assets/listado_sondeos.js"],
     "descripcion": "Listado de todas las encuestas publicadas para las generales de 2026, con enlace al informe o al artículo de prensa de cada una."},
    {"archivo": "provincias.html", "plantilla": "provincias", "titulo": "Previsión por provincia", "menu": "Provincias", "scripts": SCRIPTS_DE_PROVINCIAS,
     "descripcion": "Voto previsto, escaños y probabilidad de cada resultado en las 52 circunscripciones de las generales de 2026."},
    {"archivo": "comunidades.html", "plantilla": "comunidades", "titulo": "Previsión por comunidad", "menu": "Comunidades", "scripts": SCRIPTS_DE_COMUNIDADES,
     "descripcion": "Voto previsto, escaños y probabilidad de cada resultado en cada comunidad autónoma de las generales de 2026, con los resultados de 2023."},
    {"archivo": "resumen.html", "plantilla": "resumen", "titulo": "Resumen por provincia", "menu": "Resumen", "scripts": [],
     "descripcion": "Escaños y porcentaje de voto previstos de cada partido en cada provincia, con descarga en CSV y XLSX."},
    {"archivo": "simulador.html", "plantilla": "simulador", "titulo": "Simulador", "menu": "Simulador", "scripts": SCRIPTS_DE_PREVISION,
     "descripcion": "Simulador de escaños: fija el voto de cada partido y mira cómo cambia el reparto en España y en cada provincia."},
    {"archivo": "metodologia.html", "plantilla": "metodologia", "titulo": "Metodología", "menu": "Metodología", "scripts": [],
     "descripcion": "Cómo se calcula el promedio de encuestas, el reparto por provincia, los escaños y la incertidumbre."},
    {"archivo": "acerca.html", "plantilla": "acerca", "titulo": "Acerca de PONDERA", "menu": "Acerca de", "scripts": [],
     "descripcion": "Qué es PONDERA, qué contiene y cómo se mantiene."},
    {"archivo": "autor.html", "plantilla": "autor", "titulo": "Sobre el autor", "menu": None, "scripts": [],
     "descripcion": "Sobre el autor de PONDERA."},
    {"archivo": "enlaces.html", "plantilla": "enlaces", "titulo": "Enlaces", "menu": "Enlaces", "scripts": [],
     "descripcion": "Fuentes de los datos de PONDERA y otros sitios relacionados."},
    {"archivo": "cerveza.html", "plantilla": "cerveza", "titulo": "Invítame a una cerveza", "menu": None, "scripts": [],
     "descripcion": "Una opción, sin expectativas, para invitar al autor a una cerveza."},
]

ID_DE_MEDICION_DE_GOOGLE_ANALYTICS = "G-EPHEWLQSRW"
ETIQUETA_DE_GOOGLE_ANALYTICS = (
    '<script async src="https://www.googletagmanager.com/gtag/js?id=%s"></script>'
    "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','%s');</script>"
) % (ID_DE_MEDICION_DE_GOOGLE_ANALYTICS, ID_DE_MEDICION_DE_GOOGLE_ANALYTICS)

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
    for otra in PAGINAS:
        if not otra["menu"]:
            continue
        actual = ' aria-current="page"' if otra["archivo"] == pagina["archivo"] else ""
        enlaces_del_menu.append('<a href="%s%s"%s>%s</a>' % (prefijo, otra["archivo"], actual, escapar(otra["menu"])))
    scripts = "\n".join('<script src="%s%s"></script>' % (prefijo, ruta) for ruta in ["assets/tema.js"] + pagina["scripts"])

    return """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titulo_completo}</title>
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
<meta property="og:image" content="{base_url}/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{titulo_completo}">
<meta name="twitter:description" content="{descripcion}">
<meta name="twitter:image" content="{base_url}/assets/og-image.png">
<link rel="stylesheet" href="{prefijo}assets/estilo.css">
{script_de_tema}
</head>
<body>
<header class="cabecera-sitio">
  <div class="interior">
    <a class="marca" href="{prefijo}index.html">{nombre}<small>{lema}</small></a>
    <nav class="principal" aria-label="Principal">
      {menu}
    </nav>
    <button id="boton-tema" type="button" aria-label="Cambiar tema claro, oscuro o automático">Tema: auto</button>
  </div>
</header>
<main class="contenedor">
{contenido}
</main>
<footer class="pie contenedor">
  <p>PONDERA es un proyecto personal, no está asociado a ningún partido, medio ni empresa demoscópica. Es una previsión estadística, no una encuesta. Encuestas: tablas de Wikipedia (CC BY-SA 4.0).</p>
  <nav aria-label="Pie">
    <a href="{prefijo}LICENSE">Licencia</a>
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
        contenido=contenido, scripts=scripts, url_repositorio=URL_REPOSITORIO)


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


def construir_mapa_del_sitio(entradas):
    ultima_modificacion = entradas[0]["fecha"]
    direcciones = ["", "changelog.html"] + [pagina["archivo"] for pagina in PAGINAS if pagina["archivo"] != "index.html"]
    lineas = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for direccion in direcciones:
        lineas.append("  <url><loc>%s/%s</loc><lastmod>%s</lastmod></url>" % (BASE_URL, direccion, ultima_modificacion))
    lineas.append("</urlset>")
    return "\n".join(lineas) + "\n"


def crear_imagen_para_compartir(ruta):
    """Tarjeta de 1200x630 para Twitter y LinkedIn. Si Pillow no está disponible, se omite."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow no está instalado: se omite og-image.png")
        return

    def cargar_fuente(tamano, negrita):
        nombres = ["segoeuib.ttf", "arialbd.ttf"] if negrita else ["segoeui.ttf", "arial.ttf"]
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


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    entradas = leer_changelog()
    (CARPETA_SITIO / "assets").mkdir(parents=True, exist_ok=True)
    unir_estilos()

    for pagina in PAGINAS:
        contenido = (CARPETA_PLANTILLAS / (pagina["plantilla"] + ".html")).read_text(encoding="utf-8").rstrip()
        (CARPETA_SITIO / pagina["archivo"]).write_text(construir_pagina(pagina, contenido), encoding="utf-8")

    pagina_changelog = {"archivo": "changelog.html", "titulo": "Historial de cambios", "menu": None, "scripts": [],
                        "descripcion": "Registro de las actualizaciones reales de PONDERA."}
    (CARPETA_SITIO / "changelog.html").write_text(construir_pagina(pagina_changelog, contenido_del_changelog(entradas)), encoding="utf-8")

    pagina_404 = {"archivo": "404.html", "titulo": "Página no encontrada", "menu": None, "scripts": [], "descripcion": "La página que buscas no existe."}
    contenido_404 = '<div class="cabecera-pagina"><h1>Página no encontrada</h1><p class="subtitulo">Esa dirección no existe. <a href="%s/">Vuelve al inicio</a>.</p></div>' % BASE_URL
    (CARPETA_SITIO / "404.html").write_text(construir_pagina(pagina_404, contenido_404, prefijo=BASE_URL + "/"), encoding="utf-8")

    (CARPETA_SITIO / "feed.xml").write_text(construir_feed(entradas), encoding="utf-8")
    (CARPETA_SITIO / "sitemap.xml").write_text(construir_mapa_del_sitio(entradas), encoding="utf-8")
    (CARPETA_SITIO / "robots.txt").write_text("User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % BASE_URL, encoding="utf-8")
    (CARPETA_SITIO / "assets" / "favicon.svg").write_text(FAVICON_SVG, encoding="utf-8")
    crear_imagen_para_compartir(CARPETA_SITIO / "assets" / "og-image.png")
    print("Sitio generado en %s: %d páginas, %d entradas de changelog." % (CARPETA_SITIO, len(PAGINAS) + 2, len(entradas)))


if __name__ == "__main__":
    main()
