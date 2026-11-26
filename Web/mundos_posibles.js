"use strict";
/*
 * Mundos posibles: quince sorteos de la simulación que enseñan cómo podría quedar el Congreso. (22/11/2026)
 *
 * Con las mismas 10.000 simulaciones que ve el visitante (mundos_comun.js), ordena los sorteos por la ventaja de la derecha ampliada (PP, UPN, Vox, CC y SALF) sobre el bloque de investidura de
 * 2023 (en escaños) y toma quince percentiles, de 7 en 7 desde el 50 hasta el 1 y el 99 (26/11/2026), ordenados del centro a los extremos. En cada percentil toma la banda de sorteos que lo
 * rodea (±0,5 puntos de percentil) y, dentro de ella, el más parecido a la mediana de cada partido en esa banda.
 * Se calcula aquí, y no en el navegador, para que la página cargue al instante también en el móvil.
 * Escribe sitio/mundos.js (const MUNDOS = {...}) y mundos.json. Uso: node mundos_posibles.js [sorteos]
 */
const comun = require("./mundos_comun.js");

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 50000;   // 50.000 desde el 24/11/2026 (antes 10.000); con la misma semilla, los 10.000 primeros son los del navegador
const PERCENTILES = [50, 43, 57, 36, 64, 29, 71, 22, 78, 15, 85, 8, 92, 1, 99];   // del más centrado al más extremo (26/11/2026): primero lo esperable
const SEMIANCHURA_DE_LA_BANDA = 0.005;   // fracción de sorteos a cada lado del percentil

const simulacion = comun.prepararSimulacion(SORTEOS);
const ventajas = new Int16Array(SORTEOS);
for (let sorteo = 0; sorteo < SORTEOS; sorteo++) {
  ventajas[sorteo] = simulacion.sumaDeColumnas(sorteo, simulacion.columnasDeLaDerecha) - simulacion.sumaDeColumnas(sorteo, simulacion.columnasDeLaInvestidura);
}
const ordenados = Array.from({ length: SORTEOS }, function (_, sorteo) { return sorteo; }).sort(function (a, b) { return ventajas[a] - ventajas[b] || a - b; });

const mundos = [];
for (const percentil of PERCENTILES) {
  const centro = Math.min(SORTEOS - 1, Math.round(SORTEOS * percentil / 100));
  const semianchura = Math.round(SORTEOS * SEMIANCHURA_DE_LA_BANDA);
  const banda = ordenados.slice(Math.max(0, centro - semianchura), Math.min(SORTEOS - 1, centro + semianchura) + 1);
  const elegido = simulacion.masParecidoALaMediana(banda);
  const mundo = simulacion.describirSorteo(elegido);
  mundo.percentil = percentil;
  mundos.push(mundo);
}

comun.guardar("mundos", { fecha_promedio: simulacion.datos.fecha_promedio, sorteos: SORTEOS, mundos: mundos }, "MUNDOS");
mundos.forEach(function (mundo, i) { console.log("Mundo " + (i + 1) + " (percentil " + mundo.percentil + "): derecha " + mundo.derecha + ", investidura " + mundo.investidura); });
