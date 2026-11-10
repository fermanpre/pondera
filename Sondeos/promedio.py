"""
Promedio de encuestas de las generales, replicando el Excel «Promedios España - alternativo (in progress) - andorranas»
(Generales 2019-N) con estos cambios acordados con el usuario:
  - N (electores) = 39.000.000;
  - los pesos por encuestadora (RatC) no se escriben a mano: se calculan con el error de cada firma en las encuestas de los
    últimos 14 días de las generales de 2023 y las europeas de 2024, con el mismo peso para cada elección;
  - fecha de las elecciones y «hoy» son parámetros (la fecha de las elecciones está pendiente de confirmar).

Método del Excel (hoja «Peso sondeos»):
  peso = RatN × RatC × BF × 0,5^(antigüedad / vida media), solo si la encuesta termina dentro de VENTANA_DIAS y no es posterior a hoy.
  (El Excel original sumaba RatN + RatC; el usuario decidió el 08/11/2026 que RatC multiplique: FORMULA_DE_PESO = "producto".)
  RatC sale de la columna «Peso» de la hoja «Notas» del libro de fiabilidad del usuario; las firmas que no están en «Notas» entran con 0,2.
  RatN: min(1, error de referencia / error de la muestra); sin muestra, error 0,1.  BF: 0,75^(posición de la encuesta en su firma − 1),
  contando desde la más reciente.  Vida media: 7 + 0,2 × días que faltan, bajando hasta días/nº de encuestas con mínimo 7.
  Promedio de un partido: media ponderada solo con las encuestas que lo incluyen.

Uso: python promedio.py            (escribe fiabilidad_firmas.csv y promedio_actual.csv)
"""

import csv
import math
import sys
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

CARPETA = Path(__file__).resolve().parent  # Sondeos/ (en local y en GitHub)
CARPETA_HISTORICO = CARPETA.parent / "Web" / "historico"
ELECTORES_N = 39_000_000
MUESTRA_DE_REFERENCIA = 3000
Z = 1.96
ERROR_SIN_MUESTRA = 0.1
VENTANA_DIAS = 30
SATURACION_POR_FIRMA = 0.75
VIDA_MEDIA_MINIMA = 7.0
RATING_MINIMO = 0.2
# Ajuste manual del peso de una firma (multiplica su peso final; 1,0 = sin ajuste). Clave: nombre normalizado de la firma, p. ej. "electomania", "cis".
AJUSTE_MANUAL_DE_PESO = {}
# Encuestas internas de partidos (Wikipedia las lista como «firma»): excluidas por ahora a petición del usuario (08/11/2026)
FIRMAS_EXCLUIDAS = {"psoe", "vox", "sumar"}
RATING_FIRMA_DESCONOCIDA = 0.2
FORMULA_DE_PESO = "producto"  # "producto" (RatN × RatC) o "suma" (RatN + RatC, como el Excel original)
RUTA_NOTAS = Path(r"P:\Claude Code\Elecciones\Sondeos\Fiabilidad encuestadoras (actualizado 2026-11).xlsx")
ALIAS_NOTAS = {"hamalgama": "hamalgama metrica", "40db/myword": "40db", "myword": "40db", "sigmados": "sigma dos", "em-analytics": "electomania", "electopanel": "electomania"}
DIAS_PREVIOS_PARA_FIABILIDAD = 14
HOY = date.today()
FECHA_ELECCION = date(2026, 11, 29)  # confirmada por la nota del INE (EG2026)

ELECCIONES_DE_FIABILIDAD = {
    "generales_2023": {
        "fecha": date(2023, 7, 23),
        "resultados": "congreso_2023",
        "partidos_encuesta": {"PP": "PP", "PSOE": "PSOE", "Vox": "VOX", "Sumar": "SUMAR", "ERC": "ERC", "Junts": "JUNTS", "PNV": "PNV", "EH Bildu": "BILDU"},
    },
    "europeas_2024": {
        "fecha": date(2024, 6, 9),
        "resultados": "europeas_2024",
        "partidos_encuesta": {"PP": "PP", "PSOE": "PSOE", "Vox": "VOX", "Sumar": "SUMAR", "Unidas Podemos": "PODEMOS", "SALF": "SALF", "AR": "AHORA_REPUBLICAS", "JxCat": "JUNTS"},
    },
}
EQUIVALENCIAS_DE_PARTIDO = {"FA": "Sumar", "Adelante Andalucía (2021)": "Adelante Andalucía"}  # Frente Amplio = Sumar desde mediados de octubre de 2026
EQUIVALENCIAS_DE_FIRMA = {"sigmados": "sigma dos", "electopanel": "electomania", "em-analytics": "electomania", "myword": "40db", "my word": "40db"}


def normalizar_firma(nombre):
    sin_tildes = unicodedata.normalize("NFD", nombre)
    sin_tildes = "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn").lower().strip()
    if sin_tildes.startswith("cis"):
        return "cis"
    return EQUIVALENCIAS_DE_FIRMA.get(sin_tildes, sin_tildes)


def leer_encuestas(convocatoria, fusionar_frente_amplio_en_sumar=True):
    """Devuelve {clave de encuesta: {'firma', 'fin', 'muestra', 'valores': {partido: valor}}} de una convocatoria."""
    encuestas = {}
    with open(CARPETA / "sondeos_wikipedia_largo.csv", encoding="utf-8-sig") as fichero:
        for fila in csv.DictReader(fichero, delimiter=";"):
            if fila["convocatoria"] != convocatoria or not fila["fin_campo"] or not fila["valor"] or fila["firma"] == "2024 EP election":
                continue
            clave = (fila["tabla"], fila["firma"], fila["cliente"], fila["fin_campo"], fila["muestra"])
            encuesta = encuestas.setdefault(clave, {
                "firma": normalizar_firma(fila["firma"]),
                "firma_original": fila["firma"],
                "fin": datetime.strptime(fila["fin_campo"], "%Y-%m-%d").date(),
                "muestra": int(float(fila["muestra"])) if fila["muestra"] else None,
                "clave": clave, "cliente": fila["cliente"], "fecha_texto": fila["fecha_texto"],
                "valores": {},
            })
            nombre_del_partido = fila["partido"]
            if fusionar_frente_amplio_en_sumar or nombre_del_partido != "FA":
                nombre_del_partido = EQUIVALENCIAS_DE_PARTIDO.get(nombre_del_partido, nombre_del_partido)
            encuesta["valores"][nombre_del_partido] = float(fila["valor"])
    # Front Valencià (FV) es la candidatura de la izquierda alternativa en la Comunitat Valenciana (Compromís, IU, Podemos y ERC): las firmas que la
    # separan publican el Frente Amplio sin la Comunitat Valenciana, así que «Sumar» pasa a ser el total (Frente Amplio + FV) para que todas las encuestas midan lo mismo.
    # Para poder mostrar FV por separado se guardan, solo en las encuestas que la publican, FV y «Sumar_con_FV» (el mismo total): la proporción
    # promedio(FV) / promedio(Sumar_con_FV) es la parte de FV dentro del total, y se aplica al promedio de «Sumar» (ver calcular_prevision_base.py).
    if not fusionar_frente_amplio_en_sumar:
        # Serie histórica: «Sumar» y «FA» (Frente Amplio) son líneas distintas. Frente Amplio incluye FV cuando la encuesta los separa, para que todas midan lo mismo.
        for encuesta in encuestas.values():
            if "FV" in encuesta["valores"] and "FA" in encuesta["valores"]:
                encuesta["valores"]["FA"] += encuesta["valores"]["FV"]
        return list(encuestas.values())
    for encuesta in encuestas.values():
        if "FV" in encuesta["valores"]:
            total = encuesta["valores"].get("Sumar", 0.0) + encuesta["valores"]["FV"]
            encuesta["valores"]["Sumar"] = total
            encuesta["valores"]["Sumar_con_FV"] = total
    return list(encuestas.values())


def leer_resultados_nacionales(etiqueta, claves_de_partido):
    """Cuota nacional (sobre votos válidos) de cada clave del histórico, sumando provincias."""
    sys.path.insert(0, str(CARPETA_HISTORICO.parent))
    from normalizar_historico import clave_de
    votos = defaultdict(float)
    with open(CARPETA_HISTORICO / (etiqueta + "_candidaturas.csv"), encoding="utf-8") as fichero:
        for fila in csv.DictReader(fichero):
            if fila["tipo"] == "votos" and fila["provincia"] != "Total estatal" and fila["candidatura"] != "__TOTAL_ESCANOS__":
                clave = clave_de(fila["candidatura"])
                if clave in claves_de_partido:
                    votos[clave] += int(fila["valor"])
    total_validos = 0
    with open(CARPETA_HISTORICO / (etiqueta + "_participacion.csv"), encoding="utf-8") as fichero:
        for fila in csv.DictReader(fichero):
            if fila["provincia"] != "Total estatal":
                total_validos += int(fila["votos_validos"])
    return {clave: 100.0 * v / total_validos for clave, v in votos.items()}


def calcular_fiabilidad():
    """Error medio absoluto (puntos) de cada firma en las encuestas de los últimos días de cada elección, y su rating."""
    errores_por_firma = defaultdict(list)
    for convocatoria, datos in ELECCIONES_DE_FIABILIDAD.items():
        reales = leer_resultados_nacionales(datos["resultados"], set(datos["partidos_encuesta"].values()))
        errores_de_esta_eleccion = defaultdict(list)
        for encuesta in leer_encuestas(convocatoria):
            dias_antes = (datos["fecha"] - encuesta["fin"]).days
            if not 0 <= dias_antes <= DIAS_PREVIOS_PARA_FIABILIDAD:
                continue
            for partido_encuesta, clave in datos["partidos_encuesta"].items():
                if partido_encuesta in encuesta["valores"] and clave in reales:
                    errores_de_esta_eleccion[encuesta["firma"]].append(abs(encuesta["valores"][partido_encuesta] - reales[clave]))
        for firma, errores in errores_de_esta_eleccion.items():
            errores_por_firma[firma].append((convocatoria, sum(errores) / len(errores), len(errores)))
    error_medio = {firma: sum(e for _c, e, _n in lista) / len(lista) for firma, lista in errores_por_firma.items()}
    mejor_error = min(error_medio.values())
    rating = {firma: max(RATING_MINIMO, min(1.0, mejor_error / error)) for firma, error in error_medio.items()}
    with open(CARPETA / "fiabilidad_firmas.csv", "w", newline="", encoding="utf-8") as fichero:
        escritor = csv.writer(fichero, delimiter=";")
        escritor.writerow(["firma", "elecciones_con_datos", "error_medio_puntos", "rating"])
        for firma in sorted(rating, key=lambda f: -rating[f]):
            escritor.writerow([firma, len(errores_por_firma[firma]), round(error_medio[firma], 3), round(rating[firma], 3)])
    return rating, error_medio


def error_de_muestra(n):
    if not n or n < 2:
        return ERROR_SIN_MUESTRA
    return math.sqrt(Z ** 2 * 0.5 * 0.5 * (ELECTORES_N - n) / (n * (ELECTORES_N - 1)))


def leer_pesos_de_notas(ruta=RUTA_NOTAS):
    """{firma normalizada: Peso} desde la columna «Peso» (AK) de la hoja «Notas». Ignora las firmas con error (sin datos en la ventana de fiabilidad)."""
    import openpyxl
    hoja = openpyxl.load_workbook(ruta, data_only=True, read_only=True)["Notas"]
    cabecera = [celda.value for celda in next(hoja.iter_rows(min_row=1, max_row=1))]
    columna_peso = cabecera.index("Peso")
    pesos = {}
    for fila in hoja.iter_rows(min_row=2, values_only=True):
        nombre, peso = fila[0], fila[columna_peso]
        if nombre and isinstance(peso, (int, float)):
            clave = normalizar_firma(nombre)
            pesos[ALIAS_NOTAS.get(clave, clave)] = float(peso)
    return pesos


def calcular_promedio(rating, convocatoria="generales_proxima", hoy=None, fecha_eleccion=None, escribir=True, encuestas_leidas=None, pesos_por_encuesta=None):
    """Promedio a la fecha «hoy» (por defecto HOY) para unas elecciones en «fecha_eleccion». Con escribir=False no toca promedio_actual.csv.
    Con encuestas_leidas (resultado de leer_encuestas) no se vuelve a leer el CSV: sirve para calcular muchos días seguidos.
    Si se pasa una lista en pesos_por_encuesta, se le añade (encuesta, peso) de cada encuesta que entra en el promedio."""
    hoy = hoy or HOY
    fecha_eleccion = fecha_eleccion or FECHA_ELECCION
    if encuestas_leidas is None:
        encuestas_leidas = leer_encuestas(convocatoria)
    encuestas = [e for e in encuestas_leidas if e["fin"] <= hoy and e["firma"] not in FIRMAS_EXCLUIDAS]
    encuestas.sort(key=lambda e: e["fin"], reverse=True)
    dias_hasta_eleccion = (fecha_eleccion - hoy).days
    ventana = 7 + 0.2 * dias_hasta_eleccion
    numero_recientes = sum(1 for e in encuestas if (hoy - e["fin"]).days < ventana)
    vida_media = 7.0
    if numero_recientes > 0:
        vida_media = max(VIDA_MEDIA_MINIMA, min(ventana, dias_hasta_eleccion / numero_recientes))
    error_de_referencia = error_de_muestra(MUESTRA_DE_REFERENCIA)
    posicion_en_firma = defaultdict(int)
    suma_ponderada = defaultdict(float)
    suma_de_pesos = defaultdict(float)
    cuenta = defaultdict(int)
    usadas = 0
    for encuesta in encuestas:
        posicion_en_firma[encuesta["firma"]] += 1
        antiguedad = (hoy - encuesta["fin"]).days
        if antiguedad > VENTANA_DIAS:
            continue
        rating_n = min(1.0, error_de_referencia / error_de_muestra(encuesta["muestra"]))
        rating_c = rating.get(encuesta["firma"], RATING_FIRMA_DESCONOCIDA)
        saturacion = SATURACION_POR_FIRMA ** (posicion_en_firma[encuesta["firma"]] - 1)
        nota = rating_n * rating_c if FORMULA_DE_PESO == "producto" else rating_n + rating_c
        peso = nota * saturacion * 0.5 ** (antiguedad / vida_media) * AJUSTE_MANUAL_DE_PESO.get(encuesta["firma"], 1.0)
        usadas += 1
        if pesos_por_encuesta is not None:
            pesos_por_encuesta.append((encuesta, peso))
        for partido, valor in encuesta["valores"].items():
            suma_ponderada[partido] += peso * valor
            suma_de_pesos[partido] += peso
            cuenta[partido] += 1
    promedio = {partido: suma_ponderada[partido] / suma_de_pesos[partido] for partido in suma_ponderada}
    if escribir:
        with open(CARPETA / "promedio_actual.csv", "w", newline="", encoding="utf-8") as fichero:
            escritor = csv.writer(fichero, delimiter=";")
            escritor.writerow(["partido", "promedio_pct", "encuestas", "peso_total"])
            for partido in sorted(promedio, key=lambda p: -promedio[p]):
                escritor.writerow([partido, round(promedio[partido], 2), cuenta[partido], round(suma_de_pesos[partido], 3)])
    return promedio, cuenta, usadas, vida_media, numero_recientes


def main():
    rating_del_script, error_medio = calcular_fiabilidad()
    rating = rating_del_script
    try:
        rating = leer_pesos_de_notas()
        print("Pesos por firma leídos de «Notas»: %d firmas (las que no estén, %.1f). Fórmula: %s." % (len(rating), RATING_FIRMA_DESCONOCIDA, FORMULA_DE_PESO))
    except Exception as error:
        print("No se pudo leer «Notas» (%s): se usan los ratings calculados por el script." % error)
    print("Referencia: fiabilidad calculada por el script (error medio en puntos → rating), ordenada de mejor a peor:")
    for firma in sorted(rating_del_script, key=lambda f: -rating_del_script[f]):
        print("  %-20s error %.2f  rating %.2f" % (firma, error_medio[firma], rating_del_script[firma]))
    promedio, cuenta, usadas, vida_media, recientes = calcular_promedio(rating)
    print("\nHoy %s | elecciones %s | encuestas en ventana %d | vida media %.1f días | encuestas usadas %d" % (HOY, FECHA_ELECCION, recientes, vida_media, usadas))
    print("Promedio por partido (% de voto válido):")
    for partido in sorted(promedio, key=lambda p: -promedio[p]):
        print("  %-26s %5.2f %%  (%d encuestas)" % (partido, promedio[partido], cuenta[partido]))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
