"use strict";
/*
 * Probabilidad de mayoría en el Congreso: histogramas de los escaños que suman la derecha y el bloque de investidura de 2023 en las simulaciones, con las líneas de la mayoría absoluta (176) y de
 * los tres quintos (210, los que exige la Constitución al Congreso, por ejemplo, para proponer cuatro de los doce magistrados del Tribunal Constitucional o reformar la Constitución por esa vía),
 * y un resumen de la probabilidad de cada combinación de partidos en cada umbral. (21/11/2026)
 * Lo llama pintarMayorias() de app_prevision.js; usa `modelo`, `ultimoResultado` y COMBINACIONES_DE_MAYORIA de ese fichero.
 */
function pintarHistogramasDeMayoria() {
  const contenedor = document.getElementById("mayorias-congreso");
  if (!contenedor || typeof ultimoResultado === "undefined" || typeof COMBINACIONES_DE_MAYORIA === "undefined") { return; }
  const ESCANOS = 350, ABSOLUTA = 176, TRES_QUINTOS = 210;
  const sorteos = ultimoResultado.sorteos;
  const K = modelo.numeroDePartidos;
  const porcentajeEntero = (probabilidad) => PROBABILIDAD.html(probabilidad, Math.round(100 * probabilidad) + " %");

  // Suma de escaños de un grupo de partidos en cada sorteo
  function sumasDe(partidos) {
    const columnas = partidos.map((partido) => modelo.partidos.indexOf(partido)).filter((k) => k >= 0);
    const sumas = new Int16Array(sorteos);
    for (let s = 0; s < sorteos; s++) {
      let suma = 0;
      columnas.forEach((k) => { suma += ultimoResultado.simulacion.nacionales[s * K + k]; });
      sumas[s] = suma;
    }
    return sumas;
  }
  const combinacionPorId = (nombre) => COMBINACIONES_DE_MAYORIA.find((combinacion) => combinacion.nombre === nombre || (combinacion.id && combinacion.id === nombre));
  const buscarPorPartidos = (partidos) => COMBINACIONES_DE_MAYORIA.find((combinacion) => combinacion.partidos.length === partidos.length && partidos.every((p) => combinacion.partidos.indexOf(p) >= 0));

  function histograma(sumas) {
    const cuentas = {};
    for (let s = 0; s < sorteos; s++) { cuentas[sumas[s]] = (cuentas[sumas[s]] || 0) + 1; }
    return cuentas;
  }

  function graficoSvg(sumas) {
    const cuentas = histograma(sumas);
    const totales = Object.keys(cuentas).map(Number);
    const minimo = Math.max(0, Math.min(Math.min.apply(null, totales), ABSOLUTA) - 10);
    const maximo = Math.min(ESCANOS, Math.max(Math.max.apply(null, totales), TRES_QUINTOS) + 10);
    const pico = Math.max.apply(null, totales.map((total) => cuentas[total])) / sorteos;
    const ancho = 560, alto = 250, margen = { izquierda: 8, derecha: 8, arriba: 26, abajo: 26 };
    const anchoUtil = ancho - margen.izquierda - margen.derecha, altoUtil = alto - margen.arriba - margen.abajo;
    const x = (valor) => margen.izquierda + anchoUtil * (valor - minimo) / (maximo - minimo + 1);
    const y = (p) => margen.arriba + altoUtil * (1 - p / (pico * 1.08));
    const anchoDeBarra = anchoUtil / (maximo - minimo + 1);
    let svg = '<svg class="mg-svg" viewBox="0 0 ' + ancho + " " + alto + '" role="img" aria-label="Distribución de escaños del bloque en las simulaciones">';
    for (let total = minimo; total <= maximo; total += 1) {
      if (!cuentas[total]) { continue; }
      const p = cuentas[total] / sorteos;
      const clase = total >= TRES_QUINTOS ? "mg-barra-tres" : (total >= ABSOLUTA ? "mg-barra-absoluta" : "mg-barra-baja");
      svg += '<rect class="' + clase + '" x="' + x(total).toFixed(1) + '" y="' + y(p).toFixed(1) + '" width="' + Math.max(1, anchoDeBarra - 0.6).toFixed(1) + '" height="' + (margen.arriba + altoUtil - y(p)).toFixed(1) +
        '"><title>' + escanosEnTexto(total) + ": " + (100 * p).toFixed(1).replace(".", ",") + " %</title></rect>";
    }
    svg += '<line x1="' + margen.izquierda + '" x2="' + (ancho - margen.derecha) + '" y1="' + (margen.arriba + altoUtil) + '" y2="' + (margen.arriba + altoUtil) + '" stroke="var(--linea)" />';
    for (let marca = Math.ceil(minimo / 10) * 10; marca <= maximo; marca += 10) {
      svg += '<text class="mg-eje" x="' + (x(marca) + anchoDeBarra / 2).toFixed(1) + '" y="' + (alto - 8) + '" text-anchor="middle">' + marca + "</text>";
    }
    [[ABSOLUTA, "absoluta " + ABSOLUTA], [TRES_QUINTOS, "tres quintos " + TRES_QUINTOS]].forEach(([umbral, rotulo], i) => {
      if (umbral < minimo || umbral > maximo) { return; }
      const posicion = x(umbral);
      svg += '<line class="mg-umbral" x1="' + posicion.toFixed(1) + '" x2="' + posicion.toFixed(1) + '" y1="' + (margen.arriba - 4) + '" y2="' + (margen.arriba + altoUtil) + '" />';
      const alFinal = i === 0 || posicion > ancho - 110;   // la etiqueta va a la izquierda de la línea; la de tres quintos, a la derecha salvo que no quepa
      svg += '<text class="mg-etiqueta" x="' + (posicion + (alFinal ? -4 : 4)).toFixed(1) + '" y="' + (12 + 11 * i) + '" text-anchor="' + (alFinal ? "end" : "start") + '">' + rotulo + "</text>";
    });
    return svg + "</svg>";
  }

  const probabilidadDe = (sumas, umbral) => { let cuenta = 0; for (let s = 0; s < sorteos; s++) { if (sumas[s] >= umbral) { cuenta += 1; } } return cuenta / sorteos; };

  const derecha = buscarPorPartidos(["PP", "UPN", "VOX", "CC", "SALF"]);
  const investidura = buscarPorPartidos(["PSOE", "SUMAR", "FV", "UPC", "PODEMOS", "PNV", "ERC", "BILDU", "BNG", "JUNTS", "ADELANTE"]);
  if (!derecha || !investidura) { contenedor.innerHTML = ""; return; }
  const sumasDerecha = sumasDe(derecha.partidos), sumasInvestidura = sumasDe(investidura.partidos);
  const resumen = [
    buscarPorPartidos(["PP", "UPN"]), buscarPorPartidos(["PP", "UPN", "VOX"]), derecha,
    buscarPorPartidos(["PSOE", "SUMAR", "FV", "UPC", "PODEMOS"]), buscarPorPartidos(["PSOE", "SUMAR", "FV", "UPC", "PODEMOS", "ERC", "BILDU", "BNG", "ADELANTE"]), investidura,
    buscarPorPartidos(["PP", "UPN", "PSOE"]),
  ].filter(Boolean).map((combinacion) => {
    const sumas = sumasDe(combinacion.partidos);
    return { combinacion: combinacion, absoluta: probabilidadDe(sumas, ABSOLUTA), tres: probabilidadDe(sumas, TRES_QUINTOS) };
  });
  const pDerecha = { absoluta: probabilidadDe(sumasDerecha, ABSOLUTA), tres: probabilidadDe(sumasDerecha, TRES_QUINTOS) };
  const pInvestidura = { absoluta: probabilidadDe(sumasInvestidura, ABSOLUTA), tres: probabilidadDe(sumasInvestidura, TRES_QUINTOS) };

  contenedor.innerHTML =
    '<h2>Probabilidad de mayoría en el Congreso</h2>' +
    (PROBABILIDAD.activo()
      ? '<p class="subtitulo">La derecha ampliada logra la mayoría absoluta (' + ABSOLUTA + ') ' + PROBABILIDAD.enLasSimulaciones(pDerecha.absoluta, Math.round(100 * pDerecha.absoluta) + " %") + ' y los tres quintos (' + TRES_QUINTOS +
        ') ' + PROBABILIDAD.enLasSimulaciones(pDerecha.tres, Math.round(100 * pDerecha.tres) + " %") + '; el bloque de investidura de 2023 con Podemos y Adelante, ' + PROBABILIDAD.enLasSimulaciones(pInvestidura.absoluta, Math.round(100 * pInvestidura.absoluta) + " %") +
        ' y ' + PROBABILIDAD.enLasSimulaciones(pInvestidura.tres, Math.round(100 * pInvestidura.tres) + " %") + '.</p>'
      : '<p class="subtitulo">La derecha ampliada tiene un ' + porcentajeEntero(pDerecha.absoluta) + ' de probabilidad de mayoría absoluta (' + ABSOLUTA + ') y un ' + porcentajeEntero(pDerecha.tres) + ' de tres quintos (' + TRES_QUINTOS +
        '); el bloque de investidura de 2023 con Podemos y Adelante, un ' + porcentajeEntero(pInvestidura.absoluta) + ' y un ' + porcentajeEntero(pInvestidura.tres) + '.</p>') +
    '<div class="mayorias-rejilla">' +
    '<figure class="mayorias-grafico"><figcaption>' + escaparTexto(derecha.nombre) + '</figcaption>' + graficoSvg(sumasDerecha) + '</figure>' +
    '<figure class="mayorias-grafico"><figcaption>' + escaparTexto(investidura.nombre) + '</figcaption>' + graficoSvg(sumasInvestidura) + '</figure></div>' +
    '<h3 class="mayorias-subtitulo">Probabilidad de llegar a cada umbral</h3>' +
    resumen.map((elemento) =>
      '<div class="mr-fila"><div class="mr-nombre">' + escaparTexto(elemento.combinacion.nombre) + '</div><div class="mr-barras">' +
      '<div class="mr-linea"><span class="mr-pista"><span class="mr-relleno absoluta" style="width:' + (100 * elemento.absoluta).toFixed(1) + '%"></span></span><span class="mr-valor">' + porcentajeEntero(elemento.absoluta) + '</span></div>' +
      '<div class="mr-linea"><span class="mr-pista"><span class="mr-relleno tres" style="width:' + (100 * elemento.tres).toFixed(1) + '%"></span></span><span class="mr-valor">' + porcentajeEntero(elemento.tres) + '</span></div>' +
      '</div></div>').join("") +
    '<p class="mg-leyenda"><span><span class="ficha" style="background:#1d6fb8"></span>mayoría absoluta (' + ABSOLUTA + ' de ' + ESCANOS + ')</span><span><span class="ficha" style="background:#e08a1e"></span>tres quintos (' + TRES_QUINTOS + ' de ' + ESCANOS + ')</span></p>' +
    '<p class="nota">Cada barra de los histogramas es el número de escaños que suma el bloque en las ' + entero(sorteos) + ' simulaciones, sin contar pactos ni abstenciones. La mayoría absoluta decide las leyes orgánicas y la investidura en primera votación; ' +
    'los tres quintos son los que exige la Constitución al Congreso para proponer cuatro de los doce magistrados del Tribunal Constitucional y para otros nombramientos. Con ' + entero(sorteos) + ' simulaciones, cada probabilidad tiene un error de hasta ±1 punto.</p>';
}

function escaparTexto(texto) { return String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
