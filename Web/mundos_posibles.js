"use strict";
/*
 * Mundos posibles: diez sorteos de la simulación que enseñan cómo podría quedar el Congreso. (22/11/2026)
 *
 * Con el motor de la web (sitio/motor.js) y las mismas 10.000 simulaciones que ve el visitante (semilla 20261129, sitio/datos_modelo.json), ordena los sorteos por la ventaja de la derecha ampliada
 * (PP, UPN, Vox, CC y SALF) sobre el bloque de investidura de 2023 (en escaños) y elige diez percentiles a pasos iguales entre el 1 y el 99: como cada paso reúne la misma probabilidad, hay más
 * mundos cerca del centro de la distribución, en proporción a lo probables que son. En cada percentil toma la banda de sorteos que lo rodea (±0,5 puntos de percentil) y, dentro de ella, el más
 * parecido a la mediana de cada partido en esa banda (distancia en desviaciones robustas: rango intercuartílico / 1,349 de todos los sorteos, con un mínimo de 1 escaño).
 * Se calcula aquí, y no en el navegador, para que la página cargue al instante también en el móvil.
 * Escribe sitio/mundos.js (const MUNDOS = {...}) y mundos.json. Uso: node mundos_posibles.js [sorteos]
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;
const SEMILLA = 20261129;
const MUNDOS_QUE_SE_MUESTRAN = 10;
const PERCENTIL_MINIMO = 1;
const PERCENTIL_MAXIMO = 99;
const SEMIANCHURA_DE_LA_BANDA = 0.005;   // fracción de sorteos a cada lado del percentil
const PARTIDOS_DE_LA_DERECHA = ["PP", "UPN", "VOX", "CC", "SALF"];
const PARTIDOS_DEL_BLOQUE_DE_INVESTIDURA = ["PSOE", "SUMAR", "FV", "UPC", "PODEMOS", "PNV", "ERC", "BILDU", "BNG", "JUNTS", "ADELANTE"];

const datos = JSON.parse(fs.readFileSync(path.join(__dirname, "sitio", "datos_modelo.json"), "utf8"));
const modelo = Motor.prepararModelo(datos);
const numeroDePartidos = modelo.numeroDePartidos;
const simulacion = Motor.simular(modelo, { sorteos: SORTEOS, semilla: SEMILLA });
const nacionales = simulacion.nacionales;

function columnasDe(partidos) {
  return partidos.map(function (partido) { return modelo.partidos.indexOf(partido); }).filter(function (columna) { return columna >= 0; });
}
const columnasDeLaDerecha = columnasDe(PARTIDOS_DE_LA_DERECHA);
const columnasDeLaInvestidura = columnasDe(PARTIDOS_DEL_BLOQUE_DE_INVESTIDURA);

function sumaDeColumnas(sorteo, columnas) {
  let suma = 0;
  columnas.forEach(function (columna) { suma += nacionales[sorteo * numeroDePartidos + columna]; });
  return suma;
}

function mediana(valores) {
  const copia = Int16Array.from(valores).sort();
  return copia[Math.floor(copia.length / 2)];
}

// Escala de cada partido: rango intercuartílico / 1,349 de todos los sorteos, con un mínimo de 1 escaño
const escalas = [];
for (let k = 0; k < numeroDePartidos; k++) {
  const valores = new Int16Array(SORTEOS);
  for (let sorteo = 0; sorteo < SORTEOS; sorteo++) { valores[sorteo] = nacionales[sorteo * numeroDePartidos + k]; }
  valores.sort();
  escalas.push(Math.max(1, (valores[Math.floor(SORTEOS * 0.75)] - valores[Math.floor(SORTEOS * 0.25)]) / 1.349));
}

const ventajas = new Int16Array(SORTEOS);
for (let sorteo = 0; sorteo < SORTEOS; sorteo++) { ventajas[sorteo] = sumaDeColumnas(sorteo, columnasDeLaDerecha) - sumaDeColumnas(sorteo, columnasDeLaInvestidura); }
const ordenados = Array.from({ length: SORTEOS }, function (_, sorteo) { return sorteo; }).sort(function (a, b) { return ventajas[a] - ventajas[b] || a - b; });

const mundos = [];
for (let i = 0; i < MUNDOS_QUE_SE_MUESTRAN; i++) {
  const percentil = PERCENTIL_MINIMO + (PERCENTIL_MAXIMO - PERCENTIL_MINIMO) * i / (MUNDOS_QUE_SE_MUESTRAN - 1);
  const centro = Math.round(SORTEOS * percentil / 100);
  const desde = Math.max(0, centro - Math.round(SORTEOS * SEMIANCHURA_DE_LA_BANDA));
  const hasta = Math.min(SORTEOS - 1, centro + Math.round(SORTEOS * SEMIANCHURA_DE_LA_BANDA));
  const banda = ordenados.slice(desde, hasta + 1);
  const medianasDeLaBanda = [];
  for (let k = 0; k < numeroDePartidos; k++) {
    medianasDeLaBanda.push(mediana(banda.map(function (sorteo) { return nacionales[sorteo * numeroDePartidos + k]; })));
  }
  let elegido = banda[0];
  let mejorDistancia = Infinity;
  banda.forEach(function (sorteo) {
    let distancia = 0;
    for (let k = 0; k < numeroDePartidos; k++) {
      const diferencia = (nacionales[sorteo * numeroDePartidos + k] - medianasDeLaBanda[k]) / escalas[k];
      distancia += diferencia * diferencia;
    }
    if (distancia < mejorDistancia) { mejorDistancia = distancia; elegido = sorteo; }
  });
  const escanos = {};
  modelo.partidos.forEach(function (partido, k) { escanos[partido] = nacionales[elegido * numeroDePartidos + k]; });
  mundos.push({ percentil: Math.round(percentil * 10) / 10, escanos: escanos, derecha: sumaDeColumnas(elegido, columnasDeLaDerecha), investidura: sumaDeColumnas(elegido, columnasDeLaInvestidura) });
}

const salida = { fecha_promedio: datos.fecha_promedio, sorteos: SORTEOS, mundos: mundos };
fs.writeFileSync(path.join(__dirname, "sitio", "mundos.json"), JSON.stringify(salida));
fs.writeFileSync(path.join(__dirname, "sitio", "mundos.js"), "const MUNDOS = " + JSON.stringify(salida) + ";\n");
mundos.forEach(function (mundo, i) { console.log("Mundo " + (i + 1) + " (percentil " + mundo.percentil + "): derecha " + mundo.derecha + ", investidura " + mundo.investidura); });
