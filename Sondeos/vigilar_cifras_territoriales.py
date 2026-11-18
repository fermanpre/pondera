"""
Vigilancia diaria de cifras de UPC, Ara Més y CHA en las fuentes de las encuestas nuevas. (18/11/2026)

Ninguna tabla de Wikipedia trae estos partidos por separado, pero algunas casas los publican en sus informes o en la prensa (una nota al pie, una tabla). Este script recorre las fuentes de las
encuestas de los últimos DIAS_DE_VENTANA días (Web/sitio/listado_sondeos.json), las descarga una sola vez, busca esos partidos con una cifra cerca y deja los hallazgos en
Sondeos/vigilancia_territorial_hallazgos.csv; las fuentes ya revisadas se anotan en Sondeos/vigilancia_territorial_estado.json. No añade nada a los modelos: solo avisa de lo que hay que mirar
(el informe en Markdown, con --informe, es el cuerpo del aviso que abre el workflow). UPC ya registrada en Sondeos/upc_en_encuestas.csv no se vuelve a avisar.
Uso: python Sondeos/vigilar_cifras_territoriales.py [--informe ruta.md] [--dias 7]
"""
import argparse
import csv
import io
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUTA_LISTADO = RAIZ / "Web" / "sitio" / "listado_sondeos.json"
RUTA_ESTADO = RAIZ / "Sondeos" / "vigilancia_territorial_estado.json"
RUTA_HALLAZGOS = RAIZ / "Sondeos" / "vigilancia_territorial_hallazgos.csv"
RUTA_UPC_REGISTRADA = RAIZ / "Sondeos" / "upc_en_encuestas.csv"
DIAS_DE_VENTANA = 7
MAXIMO_DE_REINTENTOS = 3
MAXIMO_DE_BYTES = 25 * 1024 * 1024
DOMINIOS_QUE_SE_SALTAN = ("x.com", "twitter.com", "wikipedia.org", "facebook.com", "instagram.com")
CLIENTE = "Mozilla/5.0 (compatible; revisor-de-encuestas)"
TEMAS = {
    "UPC": re.compile(r"\bUPC\b|UPCan|Unidad del Pueblo Canario|Uni[oó]n del Pueblo Canario", re.IGNORECASE),
    "Ara Més": re.compile(r"Ara\s?M[eé]s|Ara-M[eé]s", re.IGNORECASE),
    "CHA": re.compile(r"\bCHA\b|Chunta", re.IGNORECASE),
}
CIFRA = re.compile(r"\d+[.,]\d+\s*%|\b\d+[.,]\d+\b|\b\d\s*(?:esca[ñn]os?|diputad)")
# «FA + FV + UPC 6,9 %» o «Frente Amplio (incl. Compromís-FV y UPC)»: suma de varios partidos, no desagrega
AGREGADO = re.compile(r"\+\s*$|incl\.?[^)]{0,40}$|\by\s*$", re.IGNORECASE)


def sin_tildes(texto):
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii").lower().strip()


def descargar(url):
    peticion = urllib.request.Request(url, headers={"User-Agent": CLIENTE, "Accept-Language": "es-ES,es;q=0.9"})
    with urllib.request.urlopen(peticion, timeout=25) as respuesta:
        contenido = respuesta.read(MAXIMO_DE_BYTES + 1)
        tipo = respuesta.headers.get("Content-Type", "")
    if len(contenido) > MAXIMO_DE_BYTES:
        raise ValueError("fichero demasiado grande")
    return contenido, tipo


def texto_de(contenido, tipo, url):
    if "pdf" in tipo.lower() or contenido[:4] == b"%PDF" or url.lower().split("?")[0].endswith(".pdf"):
        import pypdf
        lector = pypdf.PdfReader(io.BytesIO(contenido))
        return "\n".join((pagina.extract_text() or "") for pagina in lector.pages)
    html = contenido.decode("utf-8", errors="replace")
    html = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", html)
    return re.sub(r"\s+", " ", re.sub(r"(?s)<[^>]+>", " ", html))


def hallazgos_en(texto):
    """[(tema, extracto, huella)] con cada mención de UPC, Ara Més o CHA que tenga una cifra a menos de 40 caracteres; la huella (el entorno inmediato) evita repetir el mismo aviso."""
    resultado = []
    for tema, patron in TEMAS.items():
        vistos = set()
        for coincidencia in patron.finditer(texto):
            antes = texto[max(0, coincidencia.start() - 14): coincidencia.start()]
            if tema == "UPC" and AGREGADO.search(antes):
                continue
            cerca = texto[max(0, coincidencia.start() - 30): coincidencia.end() + 40]
            if not CIFRA.search(cerca):
                continue
            # La huella son las cifras pegadas al nombre: el mismo dato repetido cada día en una nota al pie no avisa dos veces, y un dato distinto (0,3 que pasa a 0,4) sí
            cifras_pegadas = re.findall(r"\d+(?:[.,]\d+)?", texto[max(0, coincidencia.start() - 25): coincidencia.end() + 15])
            huella = tema + ":" + ",".join(cifras_pegadas)
            if not cifras_pegadas or huella in vistos:
                continue
            vistos.add(huella)
            extracto = re.sub(r"\s+", " ", texto[max(0, coincidencia.start() - 90): coincidencia.end() + 90]).strip()
            resultado.append((tema, extracto, huella))
    return resultado


def upc_ya_registrada():
    if not RUTA_UPC_REGISTRADA.exists():
        return set()
    with open(RUTA_UPC_REGISTRADA, encoding="utf-8-sig") as fichero:
        return {(sin_tildes(f["casa"]), f["fin_campo"]) for f in csv.DictReader(fichero, delimiter=";")}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--informe", default=None)
    parser.add_argument("--dias", type=int, default=DIAS_DE_VENTANA)
    argumentos = parser.parse_args()
    listado = json.loads(RUTA_LISTADO.read_text(encoding="utf-8"))["sondeos"]
    estado = json.loads(RUTA_ESTADO.read_text(encoding="utf-8")) if RUTA_ESTADO.exists() else {}
    limite = (date.today() - timedelta(days=argumentos.dias)).isoformat()
    registradas = upc_ya_registrada()
    conocidos = set()
    if RUTA_HALLAZGOS.exists():
        with open(RUTA_HALLAZGOS, encoding="utf-8-sig") as fichero:
            conocidos = {(sin_tildes(f["casa"]), f["tema"], f["huella"]) for f in csv.DictReader(fichero, delimiter=";")}
    nuevos = []
    revisadas = errores = 0
    for sondeo in listado:
        if sondeo["fin"] < limite:
            continue
        for fuente in sondeo.get("fuentes", []):
            url = fuente["url"]
            previo = estado.get(url, {})
            if previo.get("estado") == "revisada" or previo.get("intentos", 0) >= MAXIMO_DE_REINTENTOS:
                continue
            if any(dominio in url for dominio in DOMINIOS_QUE_SE_SALTAN):
                estado[url] = {"estado": "revisada", "nota": "dominio omitido", "fecha": date.today().isoformat()}
                continue
            try:
                contenido, tipo = descargar(url)
                texto = texto_de(contenido, tipo, url)
            except Exception as error:  # una fuente caída no debe parar la vigilancia
                errores += 1
                estado[url] = {"estado": "error", "intentos": previo.get("intentos", 0) + 1, "error": "%s: %s" % (type(error).__name__, str(error)[:80]), "fecha": date.today().isoformat()}
                continue
            revisadas += 1
            encontrados = hallazgos_en(texto)
            if (sin_tildes(sondeo["firma"]), sondeo["fin"]) in registradas:
                encontrados = [h for h in encontrados if h[0] != "UPC"]
            encontrados = [h for h in encontrados if (sin_tildes(sondeo["firma"]), h[0], h[2]) not in conocidos]
            conocidos.update((sin_tildes(sondeo["firma"]), h[0], h[2]) for h in encontrados)
            estado[url] = {"estado": "revisada", "hallazgos": len(encontrados), "fecha": date.today().isoformat()}
            for tema, extracto, huella in encontrados:
                nuevos.append((date.today().isoformat(), sondeo["firma"], sondeo["fin"], url, tema, extracto, huella))
    RUTA_ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    if nuevos:
        existe = RUTA_HALLAZGOS.exists()
        with open(RUTA_HALLAZGOS, "a", encoding="utf-8-sig", newline="") as fichero:
            escritor = csv.writer(fichero, delimiter=";")
            if not existe:
                escritor.writerow(["fecha_revision", "casa", "fin_campo", "url", "tema", "extracto", "huella"])
            escritor.writerows(nuevos)
    print("Fuentes revisadas: %d | con error: %d | hallazgos nuevos: %d" % (revisadas, errores, len(nuevos)))
    if argumentos.informe and nuevos:
        lineas = ["Hay %d menciones nuevas de UPC, Ara Més o CHA con cifra en las fuentes de encuestas recientes. Mirar si alguna publica el partido por separado y, si es así, añadir una fila a `Sondeos/upc_en_encuestas.csv` (UPC) o a `Sondeos/indicios_territoriales.csv` (CHA-FA en Aragón u otros territorios).\n" % len(nuevos)]
        for _fecha, casa, fin, url, tema, extracto, _huella in nuevos:
            lineas.append("- **%s** (fin de campo %s, %s): «…%s…»\n  %s" % (casa, fin, tema, extracto, url))
        Path(argumentos.informe).write_text("\n".join(lineas) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
