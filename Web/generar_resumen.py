"""
Página «Resumen»: dos tablas sencillas (escaños y % de voto de cada partido en cada provincia) y sus descargas en CSV y XLSX.

Entrada: sitio/prueba_python.json (reparto central sin ruido, calculado por exportar_datos_web.py con el motor Python, idéntico al de la web)
         y sitio/datos_modelo.json (provincias, comunidades, escaños y objetivos nacionales).
Salida:  plantillas/resumen.html (la página, que luego envuelve generar_sitio.py),
         sitio/resumen_provincias.csv (formato largo: una fila por provincia y partido) y sitio/resumen_provincias.xlsx (dos hojas, como las tablas).

Uso: python exportar_datos_web.py && python generar_resumen.py && python generar_sitio.py
"""

import csv
import html
import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

CARPETA_WEB = Path(__file__).resolve().parent
CARPETA_SITIO = CARPETA_WEB / "sitio"
RUTA_PLANTILLA = CARPETA_WEB / "plantillas" / "resumen.html"
RUTA_CSV = CARPETA_SITIO / "resumen_provincias.csv"
RUTA_XLSX = CARPETA_SITIO / "resumen_provincias.xlsx"

NOMBRES_DE_PARTIDO = {
    "PP": "PP", "PSOE": "PSOE", "VOX": "Vox", "SUMAR": "Frente Amplio", "PODEMOS": "Podemos", "SALF": "SALF", "ADELANTE": "Adelante Andalucía",
    "FV": "Front Valencià", "ERC": "ERC", "JUNTS": "Junts", "BILDU": "EH Bildu", "PNV": "PNV", "BNG": "BNG", "CC": "Coalición Canaria",
    "UPN": "UPN (en Navarra, UPN-PP)", "PACMA": "PACMA", "EXISTE": "Coalición Existe", "OTROS": "Otros",
}
GUION = "–"


def cargar_datos():
    prueba = json.loads((CARPETA_SITIO / "prueba_python.json").read_text(encoding="utf-8"))
    modelo = json.loads((CARPETA_SITIO / "datos_modelo.json").read_text(encoding="utf-8"))
    return prueba, modelo


def ordenar_partidos(prueba, modelo):
    """Partidos que concurren en alguna provincia, de mayor a menor voto nacional; «Otros» al final."""
    presentes = set()
    for cuotas in prueba["cuotas"].values():
        for partido, cuota in cuotas.items():
            if cuota > 0:
                presentes.add(partido)
    ordenados = sorted((p for p in presentes if p != "OTROS"), key=lambda partido: -modelo["objetivos"].get(partido, 0.0))
    if "OTROS" in presentes:
        ordenados.append("OTROS")
    return ordenados


def construir_filas(prueba, modelo, partidos):
    """Una fila por provincia con su comunidad, escaños en juego, % de voto por partido (1 decimal) y escaños por partido (None si no concurre)."""
    filas = []
    for provincia in modelo["provincias"]:
        nombre = provincia["nombre"]
        cuotas = prueba["cuotas"][nombre]
        escanos_de_la_provincia = prueba["escanos"][nombre]
        voto_por_partido = {}
        escanos_por_partido = {}
        for partido in partidos:
            cuota = cuotas.get(partido, 0.0)
            if cuota > 0:
                voto_por_partido[partido] = round(100.0 * cuota, 1)
                escanos_por_partido[partido] = 0 if partido == "OTROS" else escanos_de_la_provincia.get(partido, 0)
        # Navarra: los escaños de la coalición se reparten por orden de lista entre UPN y PP; el PP no tiene fila de voto propia, pero sí escaños
        for partido, cantidad in escanos_de_la_provincia.items():
            if cantidad and partido not in escanos_por_partido and partido in partidos:
                escanos_por_partido[partido] = cantidad
        filas.append({
            "provincia": nombre, "comunidad": provincia["comunidad"], "escanos_en_juego": provincia["escanos"],
            "voto": voto_por_partido, "escanos": escanos_por_partido,
        })
    return filas


def formato_decimal(valor):
    return ("%.1f" % valor).replace(".", ",")


def tabla_html(titulo_id, partidos, filas, clave, formato, columna_extra, fila_total):
    cabecera = "<th>Provincia</th>"
    if columna_extra:
        cabecera += "<th>Escaños en juego</th>"
    for partido in partidos:
        cabecera += "<th>%s</th>" % html.escape(NOMBRES_DE_PARTIDO[partido])
    cuerpo = ""
    for fila in filas:
        celdas = "<td>%s</td>" % html.escape(fila["provincia"])
        if columna_extra:
            celdas += "<td>%d</td>" % fila["escanos_en_juego"]
        for partido in partidos:
            valor = fila[clave].get(partido)
            celdas += "<td>%s</td>" % (GUION if valor is None else formato(valor))
        cuerpo += "<tr>%s</tr>\n" % celdas
    pie = ""
    if fila_total:
        celdas = "<th>Total</th>"
        celdas += "<th>%d</th>" % sum(fila["escanos_en_juego"] for fila in filas)
        for partido in partidos:
            celdas += "<th>%d</th>" % sum(fila[clave].get(partido, 0) for fila in filas)
        pie = "<tfoot><tr>%s</tr></tfoot>" % celdas
    return '<div class="tabla-ancha tabla-resumen"><table id="%s"><thead><tr>%s</tr></thead>\n<tbody>\n%s</tbody>%s</table></div>' % (titulo_id, cabecera, cuerpo, pie)


def etiqueta_de_sesgo(valor):
    if abs(valor) < 0.5:
        return "0"
    return ("I+%d" % round(valor)) if valor > 0 else ("D+%d" % round(-valor))


def tabla_de_sesgos():
    """Tabla del diagnóstico de sesgos provinciales (calcular_sesgos_provinciales.py); cadena vacía si no existe el fichero."""
    ruta = CARPETA_WEB / "sesgos_provinciales.json"
    if not ruta.exists():
        return ""
    sesgos = json.loads(ruta.read_text(encoding="utf-8"))
    cuerpo = ""
    for fila in sesgos["provincias"]:
        marca = ' class="suave"' if not fila["revisar"] else ""
        cuerpo += "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td%s>%s</td><td>%s</td><td>%s</td></tr>\n" % (
            html.escape(fila["provincia"]), etiqueta_de_sesgo(fila["izquierda_derecha_base"]), etiqueta_de_sesgo(fila["izquierda_derecha_esperado"]),
            etiqueta_de_sesgo(fila["izquierda_derecha_proyeccion"]), marca, ("%+.1f" % fila["desviacion"]).replace(".", ","),
            formato_decimal(fila["periferico_base"]), formato_decimal(fila["periferico_proyeccion"]))
    return """  <h2>Sesgo de cada provincia</h2>
  <div class="controles"><a class="boton" href="sesgos_provinciales.csv" download>Descargar CSV</a>
    <span class="nota">Diagnóstico, no previsión. I+x: x puntos más a la izquierda que España; D+x: más a la derecha.</span></div>
  <div class="tabla-ancha tabla-resumen"><table id="tabla-sesgos"><thead><tr><th>Provincia</th><th>Base</th><th>Esperado</th><th>Proyección</th><th>Desviación</th><th>Periférico base (%%)</th><th>Periférico proyección (%%)</th></tr></thead>
<tbody>
%s</tbody></table></div>
  <p class="nota">Eje izquierda/derecha: voto de izquierda menos voto de derecha en la provincia, menos el mismo dato de España (los partidos periféricos cuentan en su lado: ERC, EH Bildu, BNG y Adelante Andalucía en la izquierda; Junts, PNV y Coalición Canaria en la derecha). «Base» es el patrón de fondo (75 %% de 2023 y 25 %% de 2019); «Esperado», lo que saldría si cada bloque cambiara igual en toda España; «Proyección», el reparto central. La desviación (proyección menos esperado) se resalta a partir de %s puntos. «Periférico» es el peso conjunto de los partidos de ámbito no estatal.</p>
""" % (cuerpo, formato_decimal(sesgos["umbral_de_revision"]).replace(",0", ""))


def escribir_pagina(partidos, filas):
    tabla_escanos = tabla_html("tabla-escanos", partidos[:-1], filas, "escanos", lambda valor: "%d" % valor, True, True)
    tabla_voto = tabla_html("tabla-voto", partidos, filas, "voto", formato_decimal, False, False)
    texto = """<div class="cabecera-pagina">
  <h1>Resumen por provincia</h1>
  <p class="subtitulo">Escaños y porcentaje de voto previstos de cada partido en cada provincia, en dos tablas sencillas.</p>
</div>

<section id="resumen">
  <div class="controles">
    <a class="boton" href="resumen_provincias.csv" download>Descargar CSV</a>
    <a class="boton" href="resumen_provincias.xlsx" download>Descargar XLSX</a>
    <span class="nota">El CSV trae una fila por provincia y partido; el XLSX trae las dos tablas, una por hoja.</span>
  </div>
  <h2>Escaños</h2>
  %s
  <h2>Porcentaje de voto</h2>
  %s
MARCA_DE_SESGOS</section>

<p class="nota">Es el reparto central, sin ruido: el mismo de la barra de escaños de la portada. Pueden diferir en uno de la mediana que muestra la página de provincias. El porcentaje es sobre los votos a candidaturas y va redondeado a un decimal, así que cada fila puede no sumar exactamente 100 %%. Un guion indica que el partido no concurre en esa provincia. Frente Amplio no presenta lista en Teruel, Ceuta ni Melilla.</p>
<p class="nota">En Navarra, UPN y PP concurren en coalición: el porcentaje de la coalición figura en la columna de UPN y el PP no tiene porcentaje propio; los escaños de la coalición se reparten por orden de lista (UPN, PP, PP, UPN), así que ambos partidos tienen escaños.</p>
""" % (tabla_escanos, tabla_voto)
    texto = texto.replace("MARCA_DE_SESGOS", tabla_de_sesgos())
    RUTA_PLANTILLA.write_text(texto, encoding="utf-8")


def escribir_csv(partidos, filas):
    with open(RUTA_CSV, "w", encoding="utf-8-sig", newline="") as fichero:
        escritor = csv.writer(fichero, delimiter=";")
        escritor.writerow(["provincia", "comunidad", "partido", "voto_pct", "escanos"])
        for fila in filas:
            for partido in partidos:
                voto = fila["voto"].get(partido)
                escanos = fila["escanos"].get(partido)
                if voto is None and escanos is None:
                    continue
                escritor.writerow([
                    fila["provincia"], fila["comunidad"], NOMBRES_DE_PARTIDO[partido],
                    "" if voto is None else formato_decimal(voto), "" if escanos is None else escanos,
                ])


def escribir_xlsx(partidos, filas):
    libro = Workbook()
    hoja_escanos = libro.active
    hoja_escanos.title = "Escaños"
    hoja_voto = libro.create_sheet("Voto (%)")
    negrita = Font(bold=True)

    partidos_con_escanos = [partido for partido in partidos if partido != "OTROS"]
    cabecera_escanos = ["Provincia", "Comunidad", "Escaños en juego"] + [NOMBRES_DE_PARTIDO[partido] for partido in partidos_con_escanos]
    hoja_escanos.append(cabecera_escanos)
    for fila in filas:
        valores = [fila["provincia"], fila["comunidad"], fila["escanos_en_juego"]]
        for partido in partidos_con_escanos:
            valores.append(fila["escanos"].get(partido))
        hoja_escanos.append(valores)
    ultima_fila = len(filas) + 1
    fila_total = ultima_fila + 1
    hoja_escanos.cell(row=fila_total, column=1, value="Total").font = negrita
    for columna in range(3, len(cabecera_escanos) + 1):
        letra = get_column_letter(columna)
        celda = hoja_escanos.cell(row=fila_total, column=columna, value="=SUM(%s2:%s%d)" % (letra, letra, ultima_fila))
        celda.font = negrita

    cabecera_voto = ["Provincia", "Comunidad"] + [NOMBRES_DE_PARTIDO[partido] for partido in partidos]
    hoja_voto.append(cabecera_voto)
    for fila in filas:
        valores = [fila["provincia"], fila["comunidad"]]
        for partido in partidos:
            valores.append(fila["voto"].get(partido))
        hoja_voto.append(valores)
    for fila_excel in range(2, len(filas) + 2):
        for columna in range(3, len(cabecera_voto) + 1):
            hoja_voto.cell(row=fila_excel, column=columna).number_format = "0.0"

    for hoja in (hoja_escanos, hoja_voto):
        for celda in hoja[1]:
            celda.font = negrita
            celda.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
        hoja.freeze_panes = "A2"  # solo la fila de cabecera
        hoja.column_dimensions["A"].width = 26
        hoja.column_dimensions["B"].width = 22
        for columna in range(3, hoja.max_column + 1):
            hoja.column_dimensions[get_column_letter(columna)].width = 14
        hoja.row_dimensions[1].height = 45
    libro.save(RUTA_XLSX)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    prueba, modelo = cargar_datos()
    partidos = ordenar_partidos(prueba, modelo)
    filas = construir_filas(prueba, modelo, partidos)
    escribir_pagina(partidos, filas)
    escribir_csv(partidos, filas)
    escribir_xlsx(partidos, filas)
    total_escanos = sum(sum(fila["escanos"].values()) for fila in filas)
    print("Provincias: %d | partidos: %d | escaños repartidos: %d" % (len(filas), len(partidos), total_escanos))
    print("Escritos:", RUTA_PLANTILLA.name, RUTA_CSV.name, RUTA_XLSX.name)


if __name__ == "__main__":
    main()
