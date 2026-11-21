"use strict";
/*
 * Mundos posibles: dibuja los diez mundos que calcula Web/mundos_posibles.js (sitio/mundos.js, const MUNDOS). (22/11/2026)
 * El cálculo (diez percentiles de la ventaja de la derecha ampliada sobre el bloque de investidura de 2023) se hace en el workflow, no en el navegador, para que cargue al instante en el móvil.
 */
// Tabla de un mundo: votos, porcentaje y escaños de cada partido que saca escaño o al menos un 1 % del voto, de más a menos votos
function tablaDelMundo(mundo) {
  const entero = (numero) => numero.toLocaleString("es-ES", { useGrouping: "always" });
  const partidos = Object.keys(mundo.votos).filter((partido) => mundo.escanos[partido] > 0 || mundo.porcentaje[partido] >= 1).sort((a, b) => mundo.votos[b] - mundo.votos[a]);
  const filas = partidos.map((partido) =>
    '<tr><td class="col-partido"><span class="ficha" style="background:' + (COLORES[partido] || "#9a9a94") + '"></span>' + (NOMBRES[partido] || partido) + '</td><td>' + entero(mundo.votos[partido]) +
    '</td><td>' + String(mundo.porcentaje[partido].toFixed(1)).replace(".", ",") + '%</td><td>' + mundo.escanos[partido] + '</td></tr>').join("");
  return '<div class="tabla-ancha"><table class="mundo-tabla"><thead><tr><th>Partido</th><th>Votos</th><th>Voto</th><th>Escaños</th></tr></thead><tbody>' + filas + '</tbody></table></div>';
}

function pintarMundosPosibles() {
  const contenedor = document.getElementById("mundos-posibles");
  if (!contenedor || typeof MUNDOS === "undefined") { return; }
  const escritura = (numero) => String(numero).replace(".", ",");
  const veredicto = (mundo) => {
    if (mundo.derecha >= 176) { return "La derecha ampliada tiene mayoría absoluta"; }
    if (mundo.investidura >= 176) { return "El bloque de investidura de 2023 tiene mayoría absoluta"; }
    return "Ningún bloque llega a 176";
  };
  contenedor.innerHTML = MUNDOS.mundos.map((mundo, i) =>
    '<figure class="mundo"><figcaption><span class="mundo-numero">Mundo ' + (i + 1) + '</span><span class="mundo-percentil">percentil ' + escritura(mundo.percentil) + '</span></figcaption>' +
    '<p class="mundo-veredicto">' + veredicto(mundo) + '</p>' +
    '<p class="nota">Derecha ampliada ' + mundo.derecha + ' · bloque de investidura ' + mundo.investidura + '</p>' +
    '<div class="mundo-cuerpo"><div class="hemiciclo" id="mundo-' + i + '"></div>' + tablaDelMundo(mundo) + '</div></figure>').join("");
  MUNDOS.mundos.forEach((mundo, i) => pintarHemiciclo(document.getElementById("mundo-" + i), mundo.escanos));
}
pintarMundosPosibles();
