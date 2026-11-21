"use strict";
/*
 * Mundos posibles: diez sorteos de la simulación que enseñan cómo podría quedar el Congreso. (22/11/2026)
 *
 * Con las mismas 10.000 simulaciones que ve el visitante (mundos_comun.js), ordena los sorteos por la ventaja de la derecha ampliada (PP, UPN, Vox, CC y SALF) sobre el bloque de investidura de
 * 2023 (en escaños) y elige diez percentiles a pasos iguales entre el 1 y el 99: como cada paso reúne la misma probabilidad, hay más mundos cerca del centro de la distribución, en proporción
 * a lo probables que son. En cada percentil toma la banda de sorteos que lo rodea (±0,5 puntos de percentil) y, dentro de ella, el más parecido a la mediana de cada partido en esa banda.
 * Se calcula aquí, y no en el navegador, para que la página cargue al instante también en el móvil.
 * Escribe sitio/mundos.js (const MUNDOS = {...}) y mundos.json. Uso: node mundos_posibles.js [sorteos]
 */
const comun = require("./mundos_comun.js");

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;
const MUNDOS_QUE_SE_MUESTRAN = 10;
const PERCENTIL_MINIMO = 1;
const PERCENTIL_MAXIMO = 99;
const SEMIANCHURA_DE_LA_BANDA = 0.005;   // fracción de sorteos a cada lado del percentil

const simulacion = comun.prepararSimulacion(SORTEOS);
const ventajas = new Int16Array(SORTEOS);
for (let sorteo = 0; sorteo < SORTEOS; sorteo++) {
  ventajas[sorteo] = simulacion.sumaDeColumnas(sorteo, simulacion.columnasDeLaDerecha) - simulacion.sumaDeColumnas(sorteo, simulacion.columnasDeLaInvestidura);
}
const ordenados = Array.from({ length: SORTEOS }, function (_, sorteo) { return sorteo; }).sort(function (a, b) { return ventajas[a] - ventajas[b] || a - b; });

const mundos = [];
for (let i = 0; i < MUNDOS_QUE_SE_MUESTRAN; i++) {
  const percentil = PERCENTIL_MINIMO + (PERCENTIL_MAXIMO - PERCENTIL_MINIMO) * i / (MUNDOS_QUE_SE_MUESTRAN - 1);
  const centro = Math.round(SORTEOS * percentil / 100);
  const desde = Math.max(0, centro - Math.round(SORTEOS * SEMIANCHURA_DE_LA_BANDA));
  const hasta = Math.min(SORTEOS - 1, centro + Math.round(SORTEOS * SEMIANCHURA_DE_LA_BANDA));
  const elegido = simulacion.masParecidoALaMediana(ordenados.slice(desde, hasta + 1));
  const mundo = simulacion.describirSorteo(elegido);
  mundo.percentil = Math.round(percentil * 10) / 10;
  mundos.push(mundo);
}

comun.guardar("mundos", { fecha_promedio: simulacion.datos.fecha_promedio, sorteos: SORTEOS, mundos: mundos }, "MUNDOS");
mundos.forEach(function (mundo, i) { console.log("Mundo " + (i + 1) + " (percentil " + mundo.percentil + "): derecha " + mundo.derecha + ", investidura " + mundo.investidura); });
