"use strict";
/*
 * Mundos posibles y Mundos raros: dibujan los mundos que calculan Web/mundos_posibles.js (sitio/mundos.js, const MUNDOS) y Web/mundos_raros.js (sitio/mundos_raros.js, const MUNDOS_RAROS). (22/11/2026)
 * El cálculo se hace en el workflow, no en el navegador, para que las páginas carguen al instante en el móvil.
 */
const escritura = (numero) => String(numero).replace(".", ",");

// Tabla de un mundo: votos, porcentaje y escaños de cada partido que saca escaño o al menos un 1 % del voto (y el partido destacado, si lo hay), de más a menos votos
function tablaDelMundo(mundo) {
  const entero = (numero) => numero.toLocaleString("es-ES", { useGrouping: "always" });
  const partidos = Object.keys(mundo.votos).filter((partido) => mundo.escanos[partido] > 0 || mundo.porcentaje[partido] >= 1 || partido === mundo.destacado || partido === mundo.partido)
    .sort((a, b) => mundo.votos[b] - mundo.votos[a]);
  const filas = partidos.map((partido) =>
    '<tr' + (partido === (mundo.destacado || mundo.partido) ? ' class="mundo-destacado"' : '') + '><td class="col-partido"><span class="ficha" style="background:' + (COLORES[partido] || "#9a9a94") + '"></span>' +
    (NOMBRES[partido] || partido) + '</td><td>' + entero(mundo.votos[partido]) + '</td><td>' + escritura(mundo.porcentaje[partido].toFixed(1)) + '%</td><td>' + mundo.escanos[partido] + '</td></tr>').join("");
  return '<div class="tabla-ancha"><table class="mundo-tabla"><thead><tr><th>Partido</th><th>Votos</th><th>Voto</th><th>Escaños</th></tr></thead><tbody>' + filas + '</tbody></table></div>';
}

function veredictoDelMundo(mundo) {
  if (mundo.derecha >= 176) { return "La derecha ampliada tiene mayoría absoluta"; }
  if (mundo.investidura >= 176) { return "El bloque de investidura de 2023 tiene mayoría absoluta"; }
  return "Ningún bloque llega a 176";
}

// Titular de un mundo raro: «Vox saca 101 diputados o más», «El PNV se queda sin ningún diputado»…
function titularDelMundoRaro(mundo) {
  if (mundo.titulo) { return mundo.titulo; }
  const nombre = NOMBRES[mundo.partido] || mundo.partido;
  if (mundo.sentido === "mas") { return nombre + " saca " + mundo.umbral + " diputados o más"; }
  if (mundo.umbral === 0) { return nombre + " se queda sin ningún diputado"; }
  return nombre + " saca " + (mundo.umbral === 1 ? "un diputado" : mundo.umbral + " diputados") + " o menos";
}

// Dibuja una lista de mundos en un contenedor: cabecera (según el tipo de página), veredicto, escaños de cada bloque, hemiciclo y tabla
function pintarListaDeMundos(idDelContenedor, mundos, cabecera) {
  const contenedor = document.getElementById(idDelContenedor);
  if (!contenedor) { return; }
  contenedor.innerHTML = mundos.map((mundo, i) =>
    '<figure class="mundo">' + cabecera(mundo, i) +
    '<p class="mundo-veredicto">' + veredictoDelMundo(mundo) + '</p>' +
    '<p class="nota">Derecha ampliada ' + mundo.derecha + ' · bloque de investidura ' + mundo.investidura + '</p>' +
    '<div class="mundo-cuerpo"><div class="hemiciclo" id="' + idDelContenedor + '-' + i + '"></div>' + tablaDelMundo(mundo) + '</div></figure>').join("");
  mundos.forEach((mundo, i) => pintarHemiciclo(document.getElementById(idDelContenedor + "-" + i), mundo.escanos));
}

if (typeof MUNDOS !== "undefined") {
  pintarListaDeMundos("mundos-posibles", MUNDOS.mundos, (mundo, i) =>
    '<figcaption><span class="mundo-numero">Mundo ' + (i + 1) + '</span><span class="mundo-percentil">percentil ' + escritura(mundo.percentil) + '</span></figcaption>');
}
if (typeof MUNDOS_RAROS !== "undefined") {
  pintarListaDeMundos("mundos-raros", MUNDOS_RAROS.mundos, (mundo) =>
    '<figcaption><span class="mundo-numero">' + titularDelMundoRaro(mundo) + '</span><span class="mundo-percentil">' + escritura(mundo.probabilidad) + ' % de las simulaciones (' + mundo.simulaciones + ' de ' +
    MUNDOS_RAROS.sorteos.toLocaleString("es-ES", { useGrouping: "always" }) + ')</span></figcaption>');
}
