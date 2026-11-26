"""
Previsión del Senado (senadores elegidos por voto: 208 de 266) a partir del reparto de votos del Congreso de cada sorteo del Monte Carlo.

Método (aprobado el 10/11/2026):
  - Cada elector vota a candidatos concretos (hasta 3 en las provincias de 4 escaños), así que el escaño va a los candidatos más votados de la
    circunscripción, no a la lista más votada.
  - Votos de un candidato en 2026 = sus votos de 2023 × g, donde g = cambio del partido en esa provincia entre la base de 2023 y el sorteo del Congreso.
    Así se conserva la relación propia de cada provincia entre el voto al Senado y al Congreso (Vox ≈ 0,80, Sumar ≈ 0,87, PSOE ≈ 0,97, PP ≈ 0,99 en 2023).
    Cualquier factor común a todas las listas (participación, escala del censo) se cancela, porque el reparto solo depende de votos relativos.
  - Ruido: un error por lista y circunscripción (dispersión de la relación Senado/Congreso entre provincias en 2023), un desplazamiento nacional por partido
    y un error por candidato.
  - Listas locales sin equivalente en el Congreso (La Gomera, El Hierro, Eivissa, Teruel Existe…): g = 1 y más ruido.
  - Adelante Andalucía no concurrió al Congreso en 2023: sus candidatos se calculan directamente desde su cuota de 2026, con la relación y el patrón de Sumar.
  - En la Comunitat Valenciana la lista «SUMAR» del Senado de 2023 pasa a ser FV (Front Valencià).
  - Los senadores designados por los parlamentos autonómicos (58) no se estiman (la página los añade aparte: Web/sitio/senado_designados.js).

Coaliciones y pactos (añadidos el 10/11/2026; todos los escenarios se calculan a la vez con los MISMOS sorteos de ruido):
  - «Senado de Progreso»: lista conjunta de izquierdas (PSOE + Sumar + FV). El candidato n.º j de la lista conjunta suma los votos de los candidatos n.º j
    de las listas miembro, solo para los j que cada elector puede marcar (1 en 1 escaño, 2 en 2 y 3 escaños, 3 en 4 escaños). Parámetro: disciplina.
  - Pacto PP-Vox (EL MUNDO, 26/10/2026): Vox no se presenta en 6 provincias (sus votantes marcan al PP en el mismo puesto), el PP no se presenta
    en 3 (sus votantes marcan a Vox) y Vox presenta un solo candidato en 14 (sus votantes marcan a Vox 1 y a PP 2 y PP 3: variante B).
    Parámetro: seguimiento (fracción de los votantes que sigue el pacto).
  - «Sin pactos» (cada partido por separado, como en 2023) se calcula también, como referencia.
"""

import json
import math
import random
from collections import defaultdict
from pathlib import Path

CARPETA_SENADO = Path(__file__).resolve().parent.parent / "Senado"  # en el repositorio: Senado/senado_2023_candidatos.json (resultados oficiales del Senado de 2023, candidato por candidato)
RUTA_CANDIDATOS = CARPETA_SENADO / "senado_2023_candidatos.json"

IDENTIFICADOR_DE_PARTIDO = {
    "PP": "PP", "PSOE": "PSOE", "VOX": "VOX", "SUMAR": "SUMAR", "ERC": "ERC", "JUNTS": "JUNTS", "EH BILDU": "BILDU", "PNV": "PNV", "BNG": "BNG",
    "CC": "CC", "UPN": "UPN", "ADELANTE ANDALUCÍA": "ADELANTE",
}
PROVINCIAS_FV = ("Alicante/Alacant", "Castellón/Castelló", "Valencia/València")
# Dispersión (logaritmo) de la relación Senado/Congreso entre provincias en 2023 (analizar_desfase_2023.py); para los demás partidos, un valor genérico
SIGMA_LISTA = {"PP": 0.02, "PSOE": 0.045, "VOX": 0.045, "SUMAR": 0.067, "FV": 0.067, "ADELANTE": 0.10}
SIGMA_LISTA_REGIONAL = 0.05
SIGMA_LISTA_LOCAL = 0.15
# Desplazamiento nacional de la relación Senado/Congreso de cada partido. Ampliado el 10/11/2026 tras el retroceso 2019-N a 2023 (validar_senado_2019_a_2023.py):
# la relación cambió entre elecciones (PP 1,16 a 0,99; PSOE 0,98 a 0,96; Vox 0,89 a 0,81; Sumar/UP 0,72 a 0,85) y los valores anteriores (0,01-0,03) no lo cubrían.
SIGMA_NACIONAL_POR_PARTIDO = {"PP": 0.04, "PSOE": 0.03, "VOX": 0.08, "SUMAR": 0.10, "FV": 0.10}
SIGMA_CANDIDATO = 0.015
RELACION_ADELANTE = 0.87  # la de Sumar en 2023
PATRON_ADELANTE = (1.165, 0.964, 0.873)  # candidato 1, 2 y 3 respecto a la media de la lista (patrón de Sumar en 2023)
UMBRAL_DE_LISTA_RELEVANTE = 0.25  # se descartan las listas cuyo mejor candidato no llega al 25 % de los votos del último escaño de 2023
PARTIDOS_SIEMPRE_INCLUIDOS = ("PP", "PSOE", "VOX", "SUMAR")

# Votos que puede marcar cada elector según los escaños de la circunscripción (inferido de los resultados de 2023, no de la ley)
VOTOS_POR_ELECTOR_SEGUN_ESCANOS = {1: 1, 2: 2, 3: 2, 4: 3}

CLAVE_LISTA_CONJUNTA = "SDP"  # «Senado de Progreso»
LISTAS_DE_LA_LISTA_CONJUNTA = ("PSOE", "SUMAR", "FV")
PROVINCIAS_SIN_VOX = ("Palmas (Las)", "Santa Cruz de Tenerife", "Cádiz", "Valencia/València", "Castellón/Castelló", "Balears (Illes)")
PROVINCIAS_SIN_PP = ("Lleida", "Tarragona", "Gipuzkoa")
PROVINCIAS_VOX_UN_CANDIDATO = (
    "Sevilla", "Huelva", "Asturias", "Badajoz", "Araba/Álava", "Navarra", "Cáceres",
    "Huesca", "Zaragoza", "Alicante/Alacant", "Granada", "Cuenca", "Pontevedra", "Jaén",
)

# Escenarios: disciplina de la lista conjunta de izquierdas (None = sin lista conjunta) y seguimiento del pacto PP-Vox (None = sin pacto)
ESCENARIOS = {
    "sin_pactos": {"disciplina_izquierda": None, "seguimiento_pp_vox": None, "titulo": "Sin pactos (cada partido por separado)"},
    # Principal desde el 26/11/2026 (decisión de Fernando): a mitad de camino entre «sin pactos» y los pactos completos. 73 % de disciplina de la izquierda (la Entesa catalana recibió el 65 % del voto del Congreso de sus socios, que ya incluye la pérdida normal del Senado, en torno al 89 %:
    # 0,65 / 0,89 = 0,73; con ese valor sale casi lo de GAD3: PP 122, izquierda 70) y 40 % de seguimiento del pacto PP-Vox (el precedente de UPyD en 2011 sugiere entre el 25 y el 50 %). Con una disciplina
    # inferior a un 82 % la lista conjunta rinde menos que ir cada partido por separado. Los pactos al 100 y al 75 % se quedan como el extremo optimista.
    "intermedio": {"disciplina_izquierda": 0.73, "seguimiento_pp_vox": 0.40, "titulo": "Intermedio: lista de izquierdas al 73 % y pacto PP-Vox al 40 %"},
    "solo_lista_izquierda": {"disciplina_izquierda": 1.0, "seguimiento_pp_vox": None, "titulo": "Solo lista conjunta de izquierdas"},
    "pactos_50": {"disciplina_izquierda": 1.0, "seguimiento_pp_vox": 0.50, "titulo": "Lista de izquierdas y pacto PP-Vox (seguimiento 50 %)"},
    "pactos_75": {"disciplina_izquierda": 1.0, "seguimiento_pp_vox": 0.75, "titulo": "Lista de izquierdas y pacto PP-Vox (seguimiento 75 %)"},
    "pactos_100": {"disciplina_izquierda": 1.0, "seguimiento_pp_vox": 1.00, "titulo": "Lista de izquierdas y pacto PP-Vox (seguimiento 100 %)"},
}
ESCENARIO_PRINCIPAL = "intermedio"   # hasta el 25/11/2026, «pactos_75»


def construir_modelo_senado(ruta_candidatos=RUTA_CANDIDATOS, identificador_de_partido=None):
    """Circunscripciones con sus listas: [{nombre, provincia, escanos, listas: [{partido, id, votos: [mayor a menor]}]}]."""
    if identificador_de_partido is None:
        identificador_de_partido = IDENTIFICADOR_DE_PARTIDO
    candidatos = json.loads(Path(ruta_candidatos).read_text(encoding="utf-8"))
    por_circunscripcion = defaultdict(list)
    for candidato in candidatos:
        por_circunscripcion[candidato["circunscripcion"]].append(candidato)
    circunscripciones = []
    for nombre in sorted(por_circunscripcion):
        filas = por_circunscripcion[nombre]
        escanos = sum(1 for fila in filas if fila["electo"] == "Sí")
        votos_ordenados = sorted((fila["votos"] for fila in filas), reverse=True)
        votos_del_ultimo_escano = votos_ordenados[escanos - 1]
        listas_por_partido = defaultdict(list)
        for fila in filas:
            listas_por_partido[fila["partido_normalizado"]].append(fila["votos"])
        listas = []
        for partido, votos in listas_por_partido.items():
            votos.sort(reverse=True)
            # Las listas de los partidos que intervienen en los pactos nunca se descartan: aunque sean pequeñas, suman a la lista conjunta o al pacto
            if votos[0] < UMBRAL_DE_LISTA_RELEVANTE * votos_del_ultimo_escano and partido not in PARTIDOS_SIEMPRE_INCLUIDOS:
                continue
            listas.append({"partido": partido, "id": identificador_de_partido.get(partido), "votos": votos})
        if filas[0]["provincia_ambito"] == "Navarra":
            listas = fusionar_upn_y_pp(listas)
        circunscripciones.append({"nombre": nombre, "provincia": filas[0]["provincia_ambito"], "escanos": escanos, "listas": listas})
    return circunscripciones


# Coalición UPN-PP en Navarra (2026): una sola lista con UPN en los puestos 1 y 3 y el PP en el 2 (corregido por el usuario el 11/11/2026). Sus votos por puesto son los de las listas de UPN y del PP de 2023
# sumados puesto a puesto (como la lista conjunta de izquierdas), con el cambio de la columna UPN del Congreso (que ya es la coalición). Con n senadores de la coalición, se reparten por orden de lista.
ORDEN_DE_LA_COALICION_NAVARRA = ("UPN", "PP", "UPN")


def fusionar_upn_y_pp(listas):
    """Sustituye las listas de UPN y del PP por la de la coalición (clave UPN); si falta una de las dos, deja la otra tal cual."""
    upn = next((lista for lista in listas if lista["partido"] == "UPN"), None)
    pp = next((lista for lista in listas if lista["partido"] == "PP"), None)
    if upn is None or pp is None:
        return listas
    puestos = max(len(upn["votos"]), len(pp["votos"]))
    votos = [valor_en_puesto(upn["votos"], puesto) + valor_en_puesto(pp["votos"], puesto) for puesto in range(puestos)]
    resto = [lista for lista in listas if lista["partido"] not in ("UPN", "PP")]
    return resto + [{"partido": "UPN-PP", "id": upn["id"], "votos": votos}]


def repartir_senadores_de_la_coalicion(reparto):
    """Con n senadores de la coalición UPN-PP, los puestos de su lista (UPN, PP, UPN) deciden cuántos son de cada uno."""
    coalicion = reparto.get("UPN", 0)
    if not coalicion:
        return reparto
    nuevo = defaultdict(int, {clave: cantidad for clave, cantidad in reparto.items() if clave != "UPN"})
    for partido in ORDEN_DE_LA_COALICION_NAVARRA[:coalicion]:
        nuevo[partido] += 1
    return nuevo


def valor_en_puesto(votos_de_la_lista, puesto):
    return votos_de_la_lista[puesto] if puesto < len(votos_de_la_lista) else 0.0


def aplicar_lista_conjunta(listas, votos_por_elector, disciplina):
    """Suma por puesto los votos de las listas miembro en la lista conjunta; con disciplina < 1 el resto de cada miembro se queda en su lista."""
    miembros = [clave for clave in LISTAS_DE_LA_LISTA_CONJUNTA if clave in listas]
    if not miembros:
        return
    conjunta = []
    for puesto in range(votos_por_elector):
        conjunta.append(disciplina * sum(valor_en_puesto(listas[clave], puesto) for clave in miembros))
    for clave in miembros:
        if disciplina >= 1.0:
            del listas[clave]
        else:
            listas[clave] = [(1.0 - disciplina) * voto for voto in listas[clave]]
    listas[CLAVE_LISTA_CONJUNTA] = [voto for voto in conjunta if voto > 0]


def aplicar_pacto_pp_vox(listas, provincia, votos_por_elector, seguimiento):
    """Pacto PP-Vox del 26/10/2026 (variante B en las provincias con un solo candidato de Vox: sus votantes marcan a PP 2 y PP 3)."""
    clave_pp = "UPN" if provincia == "Navarra" else "PP"  # en Navarra el PP va en la lista de la coalición UPN-PP
    pp = listas.get(clave_pp, [])
    vox = listas.get("VOX", [])
    pp_final = list(pp)
    if provincia in PROVINCIAS_SIN_VOX and vox:
        for puesto in range(min(votos_por_elector, len(pp_final))):
            pp_final[puesto] += seguimiento * valor_en_puesto(vox, puesto)
        listas["PP"] = pp_final
        del listas["VOX"]
    elif provincia in PROVINCIAS_SIN_PP and pp:
        vox_final = list(vox)
        for puesto in range(min(votos_por_elector, len(vox_final))):
            vox_final[puesto] += seguimiento * valor_en_puesto(pp, puesto)
        listas["VOX"] = vox_final
        del listas["PP"]
    elif provincia in PROVINCIAS_VOX_UN_CANDIDATO and vox:
        for puesto_pp, puesto_vox in ((1, 1), (2, 2)):
            if puesto_pp < len(pp_final):
                pp_final[puesto_pp] += seguimiento * valor_en_puesto(vox, puesto_vox)
        listas[clave_pp] = pp_final
        listas["VOX"] = vox[:1]


def repartir_escanos(listas, escanos, provincia, escenario):
    """Escaños de una circunscripción en un escenario: {clave: senadores}. `listas` es {clave: [votos]} y no se modifica."""
    votos_por_elector = VOTOS_POR_ELECTOR_SEGUN_ESCANOS[escanos]
    copia = {clave: sorted(votos, reverse=True) for clave, votos in listas.items()}
    if escenario["disciplina_izquierda"] is not None:
        aplicar_lista_conjunta(copia, votos_por_elector, escenario["disciplina_izquierda"])
    if escenario["seguimiento_pp_vox"] is not None:
        aplicar_pacto_pp_vox(copia, provincia, votos_por_elector, escenario["seguimiento_pp_vox"])
    aspirantes = [(voto, clave) for clave, votos in copia.items() for voto in votos]
    aspirantes.sort(reverse=True)
    reparto = defaultdict(int)
    for _voto, clave in aspirantes[:escanos]:
        reparto[clave] += 1
    if provincia == "Navarra":
        reparto = repartir_senadores_de_la_coalicion(reparto)
    return reparto


class ResultadosDeEscenario:
    def __init__(self):
        self.nacionales = []  # por sorteo: {clave de partido: senadores}
        self.por_circunscripcion = []  # por sorteo: {(circunscripción, clave de partido): senadores}


class RecolectorSenado:
    """Se engancha al Monte Carlo del Congreso: en cada sorteo recibe el reparto final y calcula los senadores elegidos por voto en todos los escenarios."""

    def __init__(self, circunscripciones, cuotas_base, semilla, escenarios=None, con_ruido=True, provincias_fv=PROVINCIAS_FV,
                 base_adicional=None):
        self.circunscripciones = circunscripciones
        self.cuotas_base = cuotas_base  # {(provincia, id): cuota} de la base de partida
        self.generador = random.Random(semilla)
        self.escenarios = escenarios if escenarios is not None else ESCENARIOS
        self.con_ruido = con_ruido
        self.provincias_fv = provincias_fv
        # Claves cuya base se compara además con otras (Sumar se compara con Sumar + Podemos: iban juntos en el Senado de 2023)
        self.base_adicional = {"SUMAR": ("PODEMOS",), "FV": ("PODEMOS",)} if base_adicional is None else base_adicional
        self.resultados = {nombre: ResultadosDeEscenario() for nombre in self.escenarios}

    @property
    def nacionales(self):
        return self.resultados[ESCENARIO_PRINCIPAL].nacionales

    @property
    def por_circunscripcion(self):
        return self.resultados[ESCENARIO_PRINCIPAL].por_circunscripcion

    def _identificador_efectivo(self, lista, provincia):
        if lista["partido"] == "SUMAR" and provincia in self.provincias_fv:
            return "FV"
        return lista["id"]

    def _cambio_del_partido(self, identificador, provincia, cuotas_finales):
        """g = cuota del sorteo / cuota de la base."""
        numerador = cuotas_finales.get((provincia, identificador), 0.0)
        denominador = self.cuotas_base.get((provincia, identificador), 0.0)
        for otra_clave in self.base_adicional.get(identificador, ()):
            denominador += self.cuotas_base.get((provincia, otra_clave), 0.0)
        if numerador <= 0 or denominador <= 0:
            return 0.0
        return numerador / denominador

    def _listas_de_la_circunscripcion(self, circunscripcion, cuotas_finales, desplazamiento_nacional):
        """{clave: [votos de cada candidato con ruido]} de una circunscripción en este sorteo."""
        generador = self.generador
        provincia = circunscripcion["provincia"]
        listas = defaultdict(list)
        media_pp = None
        for lista in circunscripcion["listas"]:
            if lista["partido"] == "PP":
                media_pp = sum(lista["votos"]) / len(lista["votos"])
        for lista in circunscripcion["listas"]:
            identificador = self._identificador_efectivo(lista, provincia)
            if lista["id"] == "ADELANTE":
                cuota_pp_base = self.cuotas_base.get((provincia, "PP"), 0.0)
                cuota_adelante = cuotas_finales.get((provincia, "ADELANTE"), 0.0)
                if not media_pp or cuota_pp_base <= 0 or cuota_adelante <= 0:
                    continue
                fuerza = cuota_adelante / cuota_pp_base * media_pp * RELACION_ADELANTE
                votos = [fuerza * PATRON_ADELANTE[posicion] for posicion in range(min(len(lista["votos"]), len(PATRON_ADELANTE)))]
                sigma_lista, clave = SIGMA_LISTA["ADELANTE"], "ADELANTE"
            elif identificador is None:
                votos = list(lista["votos"])
                sigma_lista, clave = SIGMA_LISTA_LOCAL, "LOCALES"
            else:
                cambio = self._cambio_del_partido(identificador, provincia, cuotas_finales)
                if cambio <= 0:
                    continue
                votos = [voto * cambio for voto in lista["votos"]]
                sigma_lista = SIGMA_LISTA.get(identificador, SIGMA_LISTA_REGIONAL)
                clave = identificador
            if self.con_ruido:
                factor_de_lista = math.exp(generador.gauss(0.0, sigma_lista) + desplazamiento_nacional.get(clave, 0.0))
                votos = [voto * factor_de_lista * math.exp(generador.gauss(0.0, SIGMA_CANDIDATO)) for voto in votos]
            listas[clave].extend(votos)
        return listas

    def registrar(self, cuotas_finales):
        if self.con_ruido:
            desplazamiento_nacional = {clave: self.generador.gauss(0.0, sigma) for clave, sigma in SIGMA_NACIONAL_POR_PARTIDO.items()}
        else:
            desplazamiento_nacional = {}
        total = {nombre: defaultdict(int) for nombre in self.escenarios}
        detalle = {nombre: {} for nombre in self.escenarios}
        for circunscripcion in self.circunscripciones:
            listas = self._listas_de_la_circunscripcion(circunscripcion, cuotas_finales, desplazamiento_nacional)
            for nombre, escenario in self.escenarios.items():
                reparto = repartir_escanos(listas, circunscripcion["escanos"], circunscripcion["provincia"], escenario)
                for clave, cantidad in reparto.items():
                    total[nombre][clave] += cantidad
                    detalle[nombre][(circunscripcion["nombre"], clave)] = cantidad
        for nombre in self.escenarios:
            self.resultados[nombre].nacionales.append(dict(total[nombre]))
            self.resultados[nombre].por_circunscripcion.append(detalle[nombre])
