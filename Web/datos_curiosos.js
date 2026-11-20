"use strict";
/*
 * Datos curiosos para la página de inicio. (20/11/2026)
 *
 * Con el motor de la web (sitio/motor.js) y las mismas 10.000 simulaciones que ve el visitante (semilla 20261129, sitio/datos_modelo.json), calcula una lista de datos sueltos que la página de
 * inicio enseña al azar, uno por visita. Cada dato es un objeto con su tipo y sus cifras; el texto lo escribe el navegador (assets/curiosidades.js), que ya tiene los nombres de los partidos.
 *   - barrera: probabilidad de que un partido no llegue al mínimo de votos de una provincia (3 % de los votos válidos) y se quede sin escaños aunque tenga votos.
 *   - margen: votos que separan a un partido de un escaño más en el reparto central (el primero que se queda fuera frente al último que entra).
 *   - incierta: provincias donde el reparto central de escaños es el menos probable de las simulaciones.
 *   - nacional: partidos con una probabilidad apreciable de quedarse sin ningún diputado en toda España.
 *   - voto: el voto más valioso de España (sitio/voto_util.json, que genera voto_util_provincias.js: ejecutar antes).
 * Escribe sitio/curiosidades.js (const CURIOSIDADES = {...}) y curiosidades.json. Uso: node datos_curiosos.js [sorteos]
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;
const SEMILLA = 20261129;
const CUOTA_MINIMA_PARA_BARRERA = 0.004;   // un partido con menos de un 0,4 % del voto de la provincia no se cuenta como candidato a quedarse sin escaño
const PROBABILIDAD_BARRERA_MINIMA = 0.15;
const PROBABILIDAD_BARRERA_MAXIMA = 0.97;
const MAXIMO_DE_DATOS_POR_TIPO = { barrera: 8, margen: 6, incierta: 5, nacional: 5, voto: 4 };

const datos = JSON.parse(fs.readFileSync(path.join(__dirname, "sitio", "datos_modelo.json"), "utf8"));
const modelo = Motor.prepararModelo(datos);
const K = modelo.numeroDePartidos;
const P = modelo.numeroDeProvincias;
const sinEscano = {};
(datos.sin_escano || []).forEach(function (partido) { sinEscano[partido] = true; });

const cuotasFinales = new Float64Array(SORTEOS * P * K);
const resultado = Motor.simular(modelo, { sorteos: SORTEOS, semilla: SEMILLA, alRepartir: function (sorteo, final) { cuotasFinales.set(final, sorteo * P * K); } });
const central = Motor.repartoSinRuido(modelo, datos.objetivos);
const curiosidades = [];

// ---- Barrera: partidos con votos que pueden quedarse por debajo del mínimo de la provincia
const candidatosDeBarrera = [];
for (let p = 0; p < P; p++) {
  const provincia = modelo.provincias[p];
  const minimo = datos.barrera * provincia.votos_validos;
  for (let k = 0; k < K; k++) {
    if (sinEscano[modelo.partidos[k]] || !modelo.presente[p * K + k] || central.cuotas[p * K + k] < CUOTA_MINIMA_PARA_BARRERA) continue;
    let debajo = 0, sinEscanos = 0;
    for (let s = 0; s < SORTEOS; s++) {
      if (cuotasFinales[(s * P + p) * K + k] * modelo.peso[p] < minimo) debajo++;
      if (resultado.provinciales[(s * P + p) * K + k] === 0) sinEscanos++;
    }
    const probabilidad = debajo / SORTEOS;
    if (probabilidad < PROBABILIDAD_BARRERA_MINIMA || probabilidad > PROBABILIDAD_BARRERA_MAXIMA) continue;
    candidatosDeBarrera.push({
      tipo: "barrera", partido: modelo.partidos[k], provincia: provincia.nombre, escanos: provincia.escanos, barrera: datos.barrera,
      probabilidad: Math.round(1000 * probabilidad) / 1000, sin_escanos: Math.round(1000 * sinEscanos / SORTEOS) / 1000,
      voto_central: Math.round(10000 * central.cuotas[p * K + k] * modelo.peso[p] / provincia.votos_validos) / 10000,
    });
  }
}
// Los más interesantes: probabilidad más cercana al 50 % y en provincias con más escaños
candidatosDeBarrera.sort(function (a, b) { return (Math.abs(a.probabilidad - 0.5) - 0.02 * a.escanos) - (Math.abs(b.probabilidad - 0.5) - 0.02 * b.escanos); });
candidatosDeBarrera.slice(0, MAXIMO_DE_DATOS_POR_TIPO.barrera).forEach(function (dato) { curiosidades.push(dato); });

// ---- Margen y reparto central por provincia
const margenes = [];
const inciertas = [];
for (let p = 0; p < P; p++) {
  const provincia = modelo.provincias[p];
  const N = provincia.escanos;
  const minimo = datos.barrera * provincia.votos_validos;
  const cocientes = [];
  for (let k = 0; k < K; k++) {
    const votos = central.cuotas[p * K + k] * modelo.peso[p];
    if (sinEscano[modelo.partidos[k]] || !modelo.presente[p * K + k] || votos <= 0 || votos < minimo) continue;
    for (let d = 1; d <= N + 1; d++) cocientes.push({ partido: modelo.partidos[k], divisor: d, votos: votos / d });
  }
  cocientes.sort(function (a, b) { return b.votos - a.votos; });
  if (cocientes.length > N && N >= 2) {
    const ultimo = cocientes[N - 1], fuera = cocientes[N];
    margenes.push({ tipo: "margen", provincia: provincia.nombre, escanos: N, partido_fuera: fuera.partido, partido_dentro: ultimo.partido,
                    votos: Math.round((ultimo.votos - fuera.votos) * fuera.divisor) });
  }
  // Probabilidad de que el reparto de escaños de la provincia sea exactamente el central
  if (N >= 3 && N <= 10) {  // en las grandes provincias cualquier reparto exacto es improbable, y el dato no dice nada
    let iguales = 0;
    for (let s = 0; s < SORTEOS; s++) {
      let igual = true;
      for (let k = 0; k < K && igual; k++) if (resultado.provinciales[(s * P + p) * K + k] !== central.escanos[p * K + k]) igual = false;
      if (igual) iguales++;
    }
    inciertas.push({ tipo: "incierta", provincia: provincia.nombre, escanos: N, probabilidad: Math.round(1000 * iguales / SORTEOS) / 1000 });
  }
}
margenes.sort(function (a, b) { return a.votos - b.votos; });
margenes.slice(0, MAXIMO_DE_DATOS_POR_TIPO.margen).forEach(function (dato) { curiosidades.push(dato); });
inciertas.sort(function (a, b) { return a.probabilidad - b.probabilidad; });
inciertas.slice(0, MAXIMO_DE_DATOS_POR_TIPO.incierta).forEach(function (dato) { curiosidades.push(dato); });

// ---- Nacional: partidos que pueden quedarse sin ningún diputado
const nacionales = [];
for (let k = 0; k < K; k++) {
  if (!sinEscano[modelo.partidos[k]]) {
    let sinNinguno = 0;
    for (let s = 0; s < SORTEOS; s++) if (resultado.nacionales[s * K + k] === 0) sinNinguno++;
    const probabilidad = sinNinguno / SORTEOS;
    if (probabilidad >= 0.05 && probabilidad <= 0.95) nacionales.push({ tipo: "nacional", partido: modelo.partidos[k], probabilidad: Math.round(1000 * probabilidad) / 1000 });
  }
}
nacionales.sort(function (a, b) { return Math.abs(a.probabilidad - 0.5) - Math.abs(b.probabilidad - 0.5); });
nacionales.slice(0, MAXIMO_DE_DATOS_POR_TIPO.nacional).forEach(function (dato) { curiosidades.push(dato); });

// ---- Voto más valioso (de voto_util.json, si existe)
const rutaVotoUtil = path.join(__dirname, "sitio", "voto_util.json");
if (fs.existsSync(rutaVotoUtil)) {
  const votoUtil = JSON.parse(fs.readFileSync(rutaVotoUtil, "utf8"));
  const valiosos = [];
  Object.keys(votoUtil.provincias).forEach(function (nombre) {
    const provincia = votoUtil.provincias[nombre];
    Object.keys(provincia.valor).forEach(function (partido) {
      // Solo partidos con peso real en la provincia (al menos un 1 % del voto central), para no destacar valores de partidos marginales
      if ((provincia.voto[partido] || 0) >= 0.01 && provincia.valor[partido] >= 2) valiosos.push({ tipo: "voto", partido: partido, provincia: nombre, valor: provincia.valor[partido], escanos: provincia.escanos });
    });
  });
  valiosos.sort(function (a, b) { return b.valor - a.valor; });
  valiosos.slice(0, MAXIMO_DE_DATOS_POR_TIPO.voto).forEach(function (dato) { curiosidades.push(dato); });
}

const salida = { fecha_promedio: datos.fecha_promedio, sorteos: SORTEOS, barrera: datos.barrera, datos: curiosidades };
const texto = JSON.stringify(salida);
fs.writeFileSync(path.join(__dirname, "sitio", "curiosidades.json"), texto, "utf8");
fs.writeFileSync(path.join(__dirname, "sitio", "curiosidades.js"), "const CURIOSIDADES = " + texto + ";\n", "utf8");
console.log("curiosidades escritas: " + curiosidades.length + " datos (" + Object.keys(MAXIMO_DE_DATOS_POR_TIPO).map(function (tipo) {
  return tipo + " " + curiosidades.filter(function (c) { return c.tipo === tipo; }).length;
}).join(", ") + ")");
