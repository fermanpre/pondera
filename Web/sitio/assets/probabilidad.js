"use strict";
/*
 * Modo de las probabilidades: porcentajes («95 %») o frecuencias («19 de cada 20»). (22/11/2026)
 * Es global: lo elige el botón «Probabilidades» de la cabecera, se recuerda en el navegador y vale para todas las páginas. Solo afecta a probabilidades (de un suceso, de una mayoría, de que un
 * partido saque escaño...); los porcentajes de voto siguen siendo porcentajes. Cada probabilidad se aproxima a la fracción «bonita» más cercana de una lista fija, con la distancia medida en
 * log-odds (log(p / (1 - p))): fino en los extremos (94 % y 96 % son cosas distintas) y grueso en el centro. En el modo de frecuencias, el porcentaje exacto queda en el texto emergente.
 * Lo usan las demás páginas con PROBABILIDAD.html / plano / enLasSimulaciones, y se repintan con PROBABILIDAD.alCambiar(función).
 */
const PROBABILIDAD = (function () {
  const CLAVE = "pondera-modo-probabilidad";
  const FRACCIONES = [[1, 1000], [1, 500], [1, 200], [1, 100], [1, 50], [1, 40], [1, 30], [1, 20], [1, 15], [1, 10], [1, 8], [1, 7], [1, 6], [1, 5], [1, 4], [1, 3], [2, 5], [1, 2],
    [3, 5], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [9, 10], [14, 15], [19, 20], [29, 30], [39, 40], [49, 50], [99, 100], [199, 200], [499, 500], [999, 1000]];
  const UMBRAL_POR_DEBAJO = 0.0007;   // por debajo, «menos de 1 de cada 1.000»
  const UMBRAL_POR_ENCIMA = 0.9993;   // por encima, «casi todas»
  const formatoMiles = new Intl.NumberFormat("es-ES", { useGrouping: "always", maximumFractionDigits: 0 });
  const oyentes = [];
  let enFrecuencias = false;
  try { enFrecuencias = localStorage.getItem(CLAVE) === "frecuencias"; } catch (error) { /* sin almacenamiento: modo por defecto */ }
  // Clase en <html> para que el CSS adapte las maquetaciones al texto más largo de las frecuencias
  const marcarElModo = () => document.documentElement.classList.toggle("prob-frecuencias", enFrecuencias);
  marcarElModo();

  const logOdds = (p) => Math.log(p / (1 - p));
  const escapar = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // «19 de cada 20» (o «ninguna», «casi todas», «todas», «menos de 1 de cada 1.000» en los extremos)
  function frecuencia(p) {
    if (!(p > 0)) { return "ninguna"; }
    if (p >= 1) { return "todas"; }
    if (p < UMBRAL_POR_DEBAJO) { return "menos de 1 de cada 1.000"; }
    if (p > UMBRAL_POR_ENCIMA) { return "casi todas"; }
    let mejor = FRACCIONES[0];
    let mejorDistancia = Infinity;
    FRACCIONES.forEach(function (fraccion) {
      const distancia = Math.abs(logOdds(p) - logOdds(fraccion[0] / fraccion[1]));
      if (distancia < mejorDistancia) { mejorDistancia = distancia; mejor = fraccion; }
    });
    return formatoMiles.format(mejor[0]) + " de cada " + formatoMiles.format(mejor[1]);
  }

  return {
    activo: function () { return enFrecuencias; },
    frecuencia: frecuencia,
    // Texto para HTML: el porcentaje que se habría mostrado, o la frecuencia con el porcentaje exacto en el texto emergente
    html: function (p, original) {
      return enFrecuencias ? '<span class="prob-frac" title="' + escapar(original) + '">' + frecuencia(p) + "</span>" : original;
    },
    // Texto plano (etiquetas SVG, atributos): sin marcas
    plano: function (p, original) { return enFrecuencias ? frecuencia(p) : original; },
    // «en el 95 % de las simulaciones» / «en 19 de cada 20 simulaciones»
    enLasSimulaciones: function (p, original) {
      if (!enFrecuencias) { return "en el " + original + " de las simulaciones"; }
      const titulo = ' title="' + escapar(original) + '"';
      if (!(p > 0)) { return "en ninguna simulación"; }
      if (p >= 1) { return "en todas las simulaciones"; }
      if (p > UMBRAL_POR_ENCIMA) { return '<span class="prob-frac"' + titulo + ">en casi todas las simulaciones</span>"; }
      if (p < UMBRAL_POR_DEBAJO) { return '<span class="prob-frac"' + titulo + ">en menos de 1 de cada 1.000 simulaciones</span>"; }
      return 'en <span class="prob-frac"' + titulo + ">" + frecuencia(p) + "</span> simulaciones";
    },
    alCambiar: function (funcion) { oyentes.push(funcion); },
    alternar: function () {
      enFrecuencias = !enFrecuencias;
      marcarElModo();
      try { localStorage.setItem(CLAVE, enFrecuencias ? "frecuencias" : "porcentajes"); } catch (error) { /* el cambio vale solo para esta visita */ }
      oyentes.forEach(function (funcion) { funcion(); });
    },
  };
})();

// Botón de la cabecera (solo en las páginas con probabilidades)
(function () {
  const boton = document.getElementById("boton-probabilidades");
  if (!boton) { return; }
  const poner = () => { boton.textContent = PROBABILIDAD.activo() ? "Probabilidades: x de cada y" : "Probabilidades: %"; };
  poner();
  boton.addEventListener("click", function () { PROBABILIDAD.alternar(); poner(); });
})();
