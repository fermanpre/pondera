"use strict";
/*
 * Mundos posibles: once sorteos de la simulación que enseñan cómo podría quedar el Congreso. (22/11/2026)
 *
 * Con las mismas 10.000 simulaciones que ve el visitante (mundos_comun.js), ordena los sorteos por la ventaja de la derecha ampliada (PP, UPN, Vox, CC y SALF) sobre el bloque de investidura de
 * 2023 (en escaños) y toma once percentiles: 0,1, de 10 en 10 hasta el 90, y 100 (25/11/2026); el mundo del centro es el del percentil 50. En cada percentil toma la banda de sorteos que lo
 * rodea (±0,5 puntos de percentil, menos si el percentil está pegado a un extremo) y, dentro de ella, el más parecido a la mediana de cada partido en esa banda. El percentil 100 es el extremo:
 * los sorteos con la mayor ventaja de la derecha de todos.
 * Se calcula aquí, y no en el navegador, para que la página cargue al instante también en el móvil.
 * Escribe sitio/mundos.js (const MUNDOS = {...}) y mundos.json. Uso: node mundos_posibles.js [sorteos]
 */
const comun = require("./mundos_comun.js");

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 50000;   // 50.000 desde el 24/11/2026 (antes 10.000); con la misma semilla, los 10.000 primeros son los del navegador
const PERCENTILES = [0.1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
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
  const semianchura = Math.round(SORTEOS * Math.max(0, Math.min(SEMIANCHURA_DE_LA_BANDA, percentil / 100, 1 - percentil / 100)));
  let banda = ordenados.slice(Math.max(0, centro - semianchura), Math.min(SORTEOS - 1, centro + semianchura) + 1);
  if (percentil === 100) { banda = ordenados.filter(function (sorteo) { return ventajas[sorteo] === ventajas[ordenados[SORTEOS - 1]]; }); }
  const elegido = simulacion.masParecidoALaMediana(banda);
  const mundo = simulacion.describirSorteo(elegido);
  mundo.percentil = percentil;
  mundos.push(mundo);
}

comun.guardar("mundos", { fecha_promedio: simulacion.datos.fecha_promedio, sorteos: SORTEOS, mundos: mundos }, "MUNDOS");
mundos.forEach(function (mundo, i) { console.log("Mundo " + (i + 1) + " (percentil " + mundo.percentil + "): derecha " + mundo.derecha + ", investidura " + mundo.investidura); });
