# PONDERA

**P**romedio **O**rdenado de **N**oticias, **D**atos y **E**ncuestas con **R**esultados y **A**nálisis.

Web de una página con la previsión de las elecciones generales de España del 29/11/2026: promedio diario de encuestas desde el 24/07/2023 y simulador de votos y escaños por provincia (motor en JavaScript, sin servidor).

## Cómo se actualiza

El workflow `.github/workflows/actualizar.yml` se ejecuta cada día (06:30 UTC) y a mano desde la pestaña Actions:

1. Baja de Wikipedia las encuestas de la próxima elección (`Sondeos/extraer_sondeos_wikipedia.py --solo-proxima`).
2. Recalcula toda la serie del promedio (`Sondeos/serie_promedio_diaria.py`).
3. Guarda los cambios y publica `Web/sitio` en GitHub Pages.

Los pesos de cada firma están en `Sondeos/pesos_firmas.csv`.

## Datos y licencias

Las encuestas proceden de las tablas de Wikipedia «Opinion polling for the next Spanish general election» (CC BY-SA 4.0). Elaboración propia.

## Páginas del sitio

Las páginas se generan con `python Web/generar_sitio.py` a partir de `Web/plantillas/` y de `Web/changelog.json` (historial de cambios, que también produce `feed.xml` y `sitemap.xml`). Para añadir una entrada al historial, se edita `changelog.json` y se vuelve a generar.
