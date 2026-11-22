"use strict";
/*
 * Evolución del promedio de encuestas de un territorio (comunidad o provincia), con los puntos de cada encuesta. (22/11/2026)
 * Datos: SERIE_TERRITORIAL (serie_territorial.js, generado por Web/serie_promedio_territorial.py). Es el mismo promedio que enseña la tabla de arriba, calculado para cada día desde
 * las generales de 2023, y solo con las encuestas de ese día o anteriores. Los días sin encuestas suficientes cortan la línea; no se interpola.
 * Lo llama pintarPromedioDelTerritorio() de promedio_territorio.js. SVG propio, sin librerías.
 */
function pintarSerieDelTerritorio(config, contenedor) {
  if (typeof SERIE_TERRITORIAL === "undefined") { return; }
  const unidad = SERIE_TERRITORIAL.unidades[config.nombre + " (" + config.tipo + ")"];
  if (!unidad) { return; }
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MARGEN = { izquierda: 40, derecha: 12, arriba: 12, abajo: 28 };
  const MILISEGUNDOS_POR_DIA = 86400000;
  const ELECCIONES_MARCADAS = [{ fecha: "2024-06-09", texto: "Europeas" }];
  const escaparTexto = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const colorDe = (partido) => COLORES[partido] || "#9a9a94";
  const nombreDe = (partido) => NOMBRES[partido] || partido;
  const formato = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const primerDia = Date.parse(SERIE_TERRITORIAL.primer_dia + "T00:00:00Z");
  const totalDias = SERIE_TERRITORIAL.dias;
  const indiceDeFecha = (textoIso) => Math.round((Date.parse(textoIso + "T00:00:00Z") - primerDia) / MILISEGUNDOS_POR_DIA);
  const textoDeFecha = (indice) => {
    const fecha = new Date(primerDia + indice * MILISEGUNDOS_POR_DIA);
    return fecha.getUTCDate() + " " + MESES[fecha.getUTCMonth()] + " " + fecha.getUTCFullYear();
  };
  // Las listas de la serie empiezan en unidad.desde. Series = candidaturas con línea de promedio y las que solo tienen puntos de encuesta (con al menos un 2 %)
  const candidaturas = new Set(Object.keys(unidad.partidos));
  unidad.encuestas.forEach((encuesta) => Object.keys(encuesta.valores).forEach((partido) => candidaturas.add(partido)));
  const series = Array.from(candidaturas)
    .map((partido) => {
      const valores = unidad.partidos[partido] || [];
      const cifras = valores.filter((v) => v !== null).concat(unidad.encuestas.map((e) => e.valores[partido]).filter((v) => v !== undefined));
      return { partido: partido, valores: valores, maximo: cifras.length ? Math.max.apply(null, cifras) : 0 };
    })
    .filter((serie) => serie.maximo >= 2)
    .sort((a, b) => b.maximo - a.maximo);
  if (!series.length) { return; }
  const valorDe = (serie, indiceDeDia) => { const v = serie.valores[indiceDeDia - unidad.desde]; return v === undefined ? null : v; };

  const desde = 0;   // todo el histórico desde las generales de 2023
  const hasta = totalDias - 1;
  const anchura = Math.max(320, contenedor.clientWidth || 640);
  const altura = anchura < 600 ? 280 : 360;
  let maximo = 5;
  series.forEach((serie) => { if (serie.maximo > maximo) { maximo = serie.maximo; } });
  unidad.encuestas.forEach((encuesta) => series.forEach((serie) => { const v = encuesta.valores[serie.partido]; if (v !== undefined && v > maximo) { maximo = v; } }));
  maximo = Math.ceil(maximo / 5) * 5;
  const ancho = anchura - MARGEN.izquierda - MARGEN.derecha;
  const alto = altura - MARGEN.arriba - MARGEN.abajo;
  const x = (indice) => MARGEN.izquierda + ((indice - desde) / Math.max(1, hasta - desde)) * ancho;
  const y = (valor) => MARGEN.arriba + alto - (valor / maximo) * alto;

  let svg = '<svg viewBox="0 0 ' + anchura + " " + altura + '" width="100%" role="img" aria-label="Evolución del promedio de encuestas en ' + escaparTexto(config.nombre) + '">';
  for (let valor = 0; valor <= maximo; valor += 5) {
    svg += '<line x1="' + MARGEN.izquierda + '" x2="' + (anchura - MARGEN.derecha) + '" y1="' + y(valor) + '" y2="' + y(valor) + '" stroke="var(--linea)" />';
    svg += '<text x="' + (MARGEN.izquierda - 6) + '" y="' + (y(valor) + 4) + '" text-anchor="end" font-size="11" fill="var(--suave)">' + valor + "%</text>";
  }
  // Marcas del eje X: un mes de cada tres si el periodo es largo, cada mes si es corto
  const saltoDeMeses = (hasta - desde) > 700 ? 6 : ((hasta - desde) > 300 ? 3 : 1);
  for (let indice = desde; indice <= hasta; indice += 1) {
    const fecha = new Date(primerDia + indice * MILISEGUNDOS_POR_DIA);
    if (fecha.getUTCDate() === 1 && fecha.getUTCMonth() % saltoDeMeses === 0) {
      svg += '<text x="' + x(indice) + '" y="' + (altura - 8) + '" text-anchor="middle" font-size="11" fill="var(--suave)">' + MESES[fecha.getUTCMonth()] + " " + String(fecha.getUTCFullYear()).slice(2) + "</text>";
    }
  }
  ELECCIONES_MARCADAS.forEach((eleccion) => {
    const indice = indiceDeFecha(eleccion.fecha);
    if (indice > desde && indice < hasta) {
      svg += '<line x1="' + x(indice) + '" x2="' + x(indice) + '" y1="' + MARGEN.arriba + '" y2="' + (MARGEN.arriba + alto) + '" stroke="var(--suave)" stroke-dasharray="4 3" />';
      svg += '<text x="' + (x(indice) + 4) + '" y="' + (MARGEN.arriba + 10) + '" font-size="11" fill="var(--suave)">' + eleccion.texto + "</text>";
    }
  });
  // Línea del promedio: una raya por tramo continuo; un tramo de un solo día se dibuja como punto
  series.forEach((serie) => {
    let trazo = "";
    let enTramo = false;
    for (let indice = desde; indice <= hasta; indice += 1) {
      const valor = valorDe(serie, indice);
      if (valor === null) { enTramo = false; continue; }
      trazo += (enTramo ? "L" : "M") + x(indice).toFixed(1) + " " + y(valor).toFixed(1) + " ";
      enTramo = true;
    }
    svg += '<path d="' + trazo + '" fill="none" stroke="' + colorDe(serie.partido) + '" stroke-width="2" stroke-linejoin="round" />';
  });
  // Puntos de cada encuesta (sin relleno): casa, fecha de fin de campo y cifra
  unidad.encuestas.forEach((encuesta) => {
    const indice = indiceDeFecha(encuesta.fin);
    if (indice < desde || indice > hasta) { return; }
    series.forEach((serie) => {
      const valor = encuesta.valores[serie.partido];
      if (valor === undefined) { return; }
      svg += '<circle cx="' + x(indice).toFixed(1) + '" cy="' + y(valor).toFixed(1) + '" r="3.5" fill="var(--fondo, #fff)" stroke="' + colorDe(serie.partido) + '" stroke-width="1.5"><title>' +
        escaparTexto(encuesta.casa) + ", " + textoDeFecha(indice) + ": " + escaparTexto(nombreDe(serie.partido)) + " " + formato.format(valor) + " %</title></circle>";
    });
  });
  svg += "</svg>";

  const leyenda = series.map((serie) => '<span class="ley-ficha"><span class="ficha" style="background:' + colorDe(serie.partido) + '"></span>' + escaparTexto(nombreDe(serie.partido)) + "</span>").join(" ");
  const hayPromedioHoy = unidad.k.length > 0 && unidad.k[unidad.k.length - 1] !== null;
  const bloque = document.createElement("div");
  bloque.className = "serie-territorial";
  bloque.innerHTML =
    '<h3>' + (hayPromedioHoy ? "Evolución del promedio" : "Historial del promedio (hoy sin promedio vigente)") + '</h3>' +
    '<p class="subtitulo">' + unidad.encuestas.length + (unidad.encuestas.length === 1 ? " encuesta" : " encuestas") + ' de ' + escaparTexto(config.nombre) + ' desde las generales de 2023. ' +
    'La línea es el promedio de cada día (ventana de ' + SERIE_TERRITORIAL.ventana_dias + ' días, las mismas reglas que la tabla); los círculos, cada encuesta.</p>' +
    '<div class="grafico-territorio">' + svg + '</div><p class="leyenda-territorio">' + leyenda + '</p>' +
    '<p class="nota">Solo hay línea los días en que el territorio reúne encuestas suficientes (una en los ' + SERIE_TERRITORIAL.ventana_dias +
    ' días anteriores): fuera de esos tramos el promedio no se calcula ni se interpola, y por eso la línea se corta.' + (hayPromedioHoy ? "" : " Hoy no hay ninguna encuesta de los últimos " + SERIE_TERRITORIAL.ventana_dias + " días, así que el promedio no está vigente: la línea acaba donde caducó la última.") + '</p>';
  contenedor.appendChild(bloque);
}
