"""
Proyección de la tendencia del promedio nacional hasta el día de la votación. (24/11/2026)

Desde el último día publicable (6 días antes de las elecciones, por la veda de sondeos) hasta la votación, la previsión no usa el promedio de ese último día tal cual: lo
desplaza con la tendencia reciente de cada partido. La pendiente es la de mínimos cuadrados del promedio diario de los últimos VENTANA_DIAS días (el día de corte incluido) y se
aplica entera durante los días que faltan. No se reescala: según se acercan las elecciones la gente pasa de indecisión, blancos y minoritarios a concentrar el voto en los partidos
conocidos, así que la suma de lo proyectado puede subir y «otros» absorbe la diferencia (decisión del usuario, 24/11/2026).

Respaldo (Web/retro_tendencia.py, retro_tendencia_placebo.py y retro_tendencia_escanos.py, informes en Informes/): en las generales de 2004 a 2023, con las notas de cada época, la
tendencia de 7 días reduce el error medio del promedio nacional (1,53 frente a 1,71 puntos con 8 elecciones; 1,39 frente a 1,59 sin 2004 y 2008) y los escaños que cambian de manos,
y los placebos (pendiente de otra ventana, invertida o de otro partido) la empeoran. Solo se probó con un horizonte de 6 días, así que no se aplica con más.
"""

from datetime import timedelta

VENTANA_DIAS = 7
HORIZONTE_MAXIMO_DIAS = 6


def pendiente_por_dia(puntos):
    """Pendiente de mínimos cuadrados de [(día, valor)] en puntos por día; 0 si hay menos de 3 puntos o todos caen el mismo día."""
    cantidad = len(puntos)
    if cantidad < 3:
        return 0.0
    media_x = sum(x for x, _y in puntos) / cantidad
    media_y = sum(y for _x, y in puntos) / cantidad
    denominador = sum((x - media_x) ** 2 for x, _y in puntos)
    if not denominador:
        return 0.0
    return sum((x - media_x) * (y - media_y) for x, y in puntos) / denominador


def dias_de_la_ventana(dia_de_corte):
    return [dia_de_corte - timedelta(days=atras) for atras in range(VENTANA_DIAS - 1, -1, -1)]


def horizonte_aplicable(dia_de_corte, fecha_eleccion):
    """Días que hay que proyectar, o 0 si hoy no se proyecta (lejos de las elecciones o ya pasadas)."""
    dias = (fecha_eleccion - dia_de_corte).days
    return dias if 1 <= dias <= HORIZONTE_MAXIMO_DIAS else 0


def proyectar(medias_por_dia, dia_de_corte, horizonte):
    """(promedio proyectado, detalle). medias_por_dia: {día: {partido: %}} de los días de dias_de_la_ventana(dia_de_corte). Cada partido se proyecta con su propia pendiente;
    un partido ausente de alguno de esos días usa los que tenga. El valor nunca baja de 0."""
    base = medias_por_dia[dia_de_corte]
    proyectado, pendientes = {}, {}
    for partido, valor in base.items():
        puntos = [((dia - dia_de_corte).days, medias[partido]) for dia, medias in medias_por_dia.items() if partido in medias]
        pendiente = pendiente_por_dia(puntos)
        pendientes[partido] = pendiente
        proyectado[partido] = max(0.0, valor + pendiente * horizonte)
    detalle = {
        "ventana_dias": VENTANA_DIAS, "horizonte_dias": horizonte, "dia_de_corte": dia_de_corte.isoformat(),
        "pendiente_por_dia": {partido: round(valor, 4) for partido, valor in pendientes.items()},
        "sin_proyectar": {partido: round(valor, 3) for partido, valor in base.items()},
    }
    return proyectado, detalle
