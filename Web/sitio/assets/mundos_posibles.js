"use strict";
/*
 * Mundos posibles: dibuja los diez mundos que calcula Web/mundos_posibles.js (sitio/mundos.js, const MUNDOS). (22/11/2026)
 * El cálculo (diez percentiles de la ventaja de la derecha ampliada sobre el bloque de investidura de 2023) se hace en el workflow, no en el navegador, para que cargue al instante en el móvil.
 */
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
    '<div class="hemiciclo" id="mundo-' + i + '"></div></figure>').join("");
  MUNDOS.mundos.forEach((mundo, i) => pintarHemiciclo(document.getElementById("mundo-" + i), mundo.escanos));
}
pintarMundosPosibles();
