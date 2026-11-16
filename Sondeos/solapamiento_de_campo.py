"""
Solapamiento del trabajo de campo entre encuestas de la misma casa (trackings acumulados o móviles, p. ej. SW Demoscopia, 40dB, SocioMétrica, Sigma Dos). (13/11/2026)

Una encuesta cuyo campo ya ha sido medido en parte por una entrega posterior de la misma casa no aporta información nueva en esa parte. Factor de una encuesta A:
  1 - (días de campo de A cubiertos por el campo de alguna entrega posterior de la misma casa) / (días de campo de A)
(0 = la entrega posterior ya contiene todo su campo, como en un acumulado; 0,25 = un tracking de ventana de 4 días con una entrega posterior al día siguiente...).
El factor multiplica el peso de A en el promedio. Solo se tienen en cuenta entregas posteriores con fin de campo anterior o igual a «hoy».
Segunda regla (14/11/2026, tomada de la práctica de otros agregadores): las entregas de la misma casa cuyo campo no se solapa en las fechas pero que terminan con pocos días de diferencia
(por ejemplo, trackings que Wikipedia lista con la fecha de un solo día) se agrupan: un grupo empieza con una entrega y absorbe las que terminan en los DIAS_DE_AGRUPACION días siguientes, y cada una
pesa 1/N del grupo. Solo se agrupan las entregas sin ningún solape; las solapadas ya llevan su factor fraccionario.
Fecha de inicio: se lee de «fecha_texto» (formato de Wikipedia: «26 Oct–12 Nov», «1–14 Oct», «12 Nov»); si no se entiende, se toma el día de fin.
"""

import re
from datetime import date, timedelta

DIAS_DE_AGRUPACION = 4
MESES = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
DOS_MESES = re.compile(r"^\s*(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s*[–-]\s*(\d{1,2})\s+([A-Za-z]{3})")
UN_MES = re.compile(r"^\s*(\d{1,2})\s*[–-]\s*(\d{1,2})\s+([A-Za-z]{3})")


def inicio_de_campo(fecha_texto, fin):
    """Fecha de inicio del campo; si no se puede leer, la de fin."""
    texto = fecha_texto or ""
    coincidencia = DOS_MESES.match(texto)
    try:
        if coincidencia:
            dia, mes = int(coincidencia.group(1)), MESES[coincidencia.group(2).lower()]
            anio = fin.year - 1 if mes > fin.month else fin.year
            return min(date(anio, mes, dia), fin)
        coincidencia = UN_MES.match(texto)
        if coincidencia:
            dia, mes = int(coincidencia.group(1)), MESES[coincidencia.group(3).lower()]
            anio = fin.year - 1 if mes > fin.month else fin.year
            return min(date(anio, mes, dia), fin)
    except (ValueError, KeyError):
        pass
    return fin


def factores_de_solapamiento(encuestas, clave_de_casa):
    """{id(encuesta): factor} para una lista de encuestas ya limitada a las publicadas hasta «hoy»."""
    por_casa = {}
    for encuesta in encuestas:
        por_casa.setdefault(clave_de_casa(encuesta), []).append(encuesta)
    factores = {}
    for lista in por_casa.values():
        lista.sort(key=lambda e: e["fin"])
        for posicion, encuesta in enumerate(lista):
            inicio = inicio_de_campo(encuesta.get("fecha_texto"), encuesta["fin"])
            dias = {inicio + timedelta(days=i) for i in range((encuesta["fin"] - inicio).days + 1)}
            cubiertos = set()
            for posterior in lista[posicion + 1:]:
                if posterior["fin"] <= encuesta["fin"]:
                    continue
                inicio_posterior = inicio_de_campo(posterior.get("fecha_texto"), posterior["fin"])
                for i in range((posterior["fin"] - inicio_posterior).days + 1):
                    dia = inicio_posterior + timedelta(days=i)
                    if dia in dias:
                        cubiertos.add(dia)
            factores[id(encuesta)] = 1.0 - len(cubiertos) / len(dias)
        # Agrupar las entregas sin solape que terminan con pocos días de diferencia
        sin_solape = [e for e in lista if factores[id(e)] >= 0.999]
        grupos, actual = [], []
        for encuesta in sin_solape:
            if actual and (encuesta["fin"] - actual[0]["fin"]).days > DIAS_DE_AGRUPACION:
                grupos.append(actual); actual = []
            actual.append(encuesta)
        if actual:
            grupos.append(actual)
        for grupo in grupos:
            for encuesta in grupo:
                factores[id(encuesta)] = factores[id(encuesta)] / len(grupo)
    return factores
