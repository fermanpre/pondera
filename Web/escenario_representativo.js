"use strict";
/*
 * Escenario representativo precalculado. (22/11/2026)
 *
 * El navegador calcula en dos pasadas (2.000 sorteos para pintar enseguida y 10.000 después), y el sorteo «representativo» (el más parecido a la mediana de cada partido, y de cada partido en
 * cada provincia) puede ser distinto en cada una: un partido con una distribución ancha de escaños, como Adelante Andalucía (mediana 3 o 4, rango intercuartílico de 3 a 6), enseñaba
 * 4 diputados al entrar y 2 al terminar el cálculo. Aquí se elige una sola vez con los 10.000 sorteos de la semilla de la web y los escaños de ese sorteo (provincia x partido) se
 * incrustan en sitio/escenario_representativo.js; la web los usa mientras los objetivos sean los del modelo y el número de sorteos el de por defecto, y si el visitante cambia los
 * objetivos o el número de sorteos lo calcula en el navegador, como antes.
 *
 * Misma distancia que assets/app_prevision.js (escenarioRepresentativo): desviaciones robustas por partido a nivel nacional (rango intercuartílico / 1,349, mínimo de un escaño) más la
 * suma de diferencias al cuadrado con la mediana de cada provincia y partido (peso 1).
 * Escribe sitio/escenario_representativo.js (const ESCENARIO_REPRESENTATIVO = {...}) y .json. Uso: node escenario_representativo.js [sorteos]
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SEMILLA = 20261129;
const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;

const datos = JSON.parse(fs.readFileSync(path.join(__dirname, "sitio", "datos_modelo.json"), "utf8"));
const modelo = Motor.prepararModelo(datos);
const numeroDePartidos = modelo.numeroDePartidos;
const numeroDeProvincias = modelo.numeroDeProvincias;
const porProvincia = numeroDeProvincias * numeroDePartidos;
const simulacion = Motor.simular(modelo, { sorteos: SORTEOS, semilla: SEMILLA });

const medianas = [];
const escalas = [];
for (let k = 0; k < numeroDePartidos; k++) {
  const valores = new Int16Array(SORTEOS);
  for (let s = 0; s < SORTEOS; s++) valores[s] = simulacion.nacionales[s * numeroDePartidos + k];
  valores.sort();
  medianas.push(valores[Math.floor(SORTEOS / 2)]);
  escalas.push(Math.max(1, (valores[Math.floor(SORTEOS * 0.75)] - valores[Math.floor(SORTEOS * 0.25)]) / 1.349));
}
const medianasProvinciales = new Uint8Array(porProvincia);
const histograma = new Uint32Array(64);
for (let celda = 0; celda < porProvincia; celda++) {
  histograma.fill(0);
  for (let s = 0; s < SORTEOS; s++) histograma[simulacion.provinciales[s * porProvincia + celda]]++;
  let acumulado = 0;
  let escanos = 0;
  while (acumulado + histograma[escanos] <= Math.floor(SORTEOS / 2)) { acumulado += histograma[escanos]; escanos++; }
  medianasProvinciales[celda] = escanos;
}
// Filtro previo (23/11/2026): solo compiten los sorteos en los que PP, PSOE y Vox quedan a menos de «tolerancia» escaños de su mediana nacional. La tolerancia es la menor (1, 2, 3...) que deja al menos
// el 0,3 % de los sorteos como candidatos (30 de 10.000); si ni con 6 hay suficientes, no se filtra. Mismo código que toleranciaDelEscenario de assets/app_prevision.js.
const columnasDelFiltro = ["PP", "PSOE", "VOX"].map(function (partido) { return modelo.partidos.indexOf(partido); }).filter(function (k) { return k >= 0; });
const minimoDeCandidatos = Math.max(1, Math.ceil(0.003 * SORTEOS));
let tolerancia = Infinity;
for (let candidata = 1; candidata <= 6 && tolerancia === Infinity; candidata++) {
  let candidatos = 0;
  for (let s = 0; s < SORTEOS; s++) {
    let dentro = true;
    for (let i = 0; i < columnasDelFiltro.length; i++) {
      if (Math.abs(simulacion.nacionales[s * numeroDePartidos + columnasDelFiltro[i]] - medianas[columnasDelFiltro[i]]) > candidata) { dentro = false; break; }
    }
    if (dentro) candidatos++;
  }
  if (candidatos >= minimoDeCandidatos) tolerancia = candidata;
}
let mejorSorteo = 0;
let mejorDistancia = Infinity;
for (let s = 0; s < SORTEOS; s++) {
  let fueraDelFiltro = false;
  for (let i = 0; i < columnasDelFiltro.length; i++) {
    if (Math.abs(simulacion.nacionales[s * numeroDePartidos + columnasDelFiltro[i]] - medianas[columnasDelFiltro[i]]) > tolerancia) { fueraDelFiltro = true; break; }
  }
  if (fueraDelFiltro) continue;
  let distancia = 0;
  for (let k = 0; k < numeroDePartidos; k++) {
    const diferencia = (simulacion.nacionales[s * numeroDePartidos + k] - medianas[k]) / escalas[k];
    distancia += diferencia * diferencia;
  }
  for (let celda = 0; celda < porProvincia; celda++) {
    const diferencia = simulacion.provinciales[s * porProvincia + celda] - medianasProvinciales[celda];
    distancia += diferencia * diferencia;
  }
  if (distancia < mejorDistancia) { mejorDistancia = distancia; mejorSorteo = s; }
}

const escanos = Array.from(simulacion.provinciales.subarray(mejorSorteo * porProvincia, (mejorSorteo + 1) * porProvincia));
const objetivos = {};
modelo.partidos.forEach(function (partido) { objetivos[partido] = datos.objetivos[partido] || 0; });
const resultado = { sorteos: SORTEOS, semilla: SEMILLA, sorteo_elegido: mejorSorteo, partidos: modelo.partidos, objetivos: objetivos, escanos: escanos };
const texto = JSON.stringify(resultado);
fs.writeFileSync(path.join(__dirname, "sitio", "escenario_representativo.json"), texto);
fs.writeFileSync(path.join(__dirname, "sitio", "escenario_representativo.js"), "const ESCENARIO_REPRESENTATIVO = " + texto + ";\n");
const nacionales = {};
modelo.partidos.forEach(function (partido, k) { nacionales[partido] = simulacion.nacionales[mejorSorteo * numeroDePartidos + k]; });
console.log("Escenario representativo: sorteo " + mejorSorteo + " de " + SORTEOS + ", tolerancia ±" + tolerancia + " en PP, PSOE y Vox, distancia " + mejorDistancia.toFixed(1) + " | escaños " + JSON.stringify(nacionales));
