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
 * Elección (23/11/2026): el escenario se elige entre un fondo de FONDO_DE_SORTEOS sorteos (100.000; los SORTEOS primeros, los de la web, son los mismos porque la semilla es la misma). Las medianas
 * (nacionales y provinciales) y las escalas son las de los SORTEOS de la web, para que el escenario se parezca a lo que enseñan las tablas. Antes de medir la distancia hay un filtro por
 * escalera de tolerancias: PP, PSOE y Vox a ±2 de su mediana y todos los demás partidos con mediana de 1 o más a ±1; si quedan menos de MINIMO_DE_CANDIDATOS sorteos, el resto a ±2; luego grandes ±3
 * y resto ±2; luego ±3 en todos; si aun así no hay candidatos, sin filtro. Con 10.000 sorteos y solo los grandes a ±2 quedaban unos 40 candidatos y Adelante Andalucía (mediana 4) salía con 2 o 3.
 * Escribe sitio/escenario_representativo.js (const ESCENARIO_REPRESENTATIVO = {...}) y .json. Uso: node escenario_representativo.js [sorteos_de_la_web] [fondo_de_sorteos]
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SEMILLA = 20261129;
const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;
const FONDO_DE_SORTEOS = Math.max(SORTEOS, process.argv[3] ? parseInt(process.argv[3], 10) : 100000);
const MINIMO_DE_CANDIDATOS = 30;
const GRANDES = ["PP", "PSOE", "VOX"];
const ESCALERA_DE_TOLERANCIAS = [[2, 1], [2, 2], [3, 2], [3, 3]];   // [grandes, resto]

const datos = JSON.parse(fs.readFileSync(path.join(__dirname, "sitio", "datos_modelo.json"), "utf8"));
const modelo = Motor.prepararModelo(datos);
const numeroDePartidos = modelo.numeroDePartidos;
const numeroDeProvincias = modelo.numeroDeProvincias;
const porProvincia = numeroDeProvincias * numeroDePartidos;
// El fondo empieza por los SORTEOS de la web: con la misma semilla, el motor produce los mismos primeros sorteos
const simulacion = Motor.simular(modelo, { sorteos: FONDO_DE_SORTEOS, semilla: SEMILLA });

// Medianas y escalas con los sorteos de la web (los SORTEOS primeros del fondo)
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

// Filtro previo por escalera de tolerancias
const columnasDeLosGrandes = GRANDES.map(function (partido) { return modelo.partidos.indexOf(partido); }).filter(function (k) { return k >= 0; });
const columnasDelResto = modelo.partidos.map(function (partido, k) { return k; }).filter(function (k) {
  return columnasDeLosGrandes.indexOf(k) < 0 && modelo.partidos[k] !== "OTROS" && medianas[k] >= 1;
});
function dentroDeLaTolerancia(sorteo, toleranciaDeLosGrandes, toleranciaDelResto) {
  const base = sorteo * numeroDePartidos;
  for (let i = 0; i < columnasDeLosGrandes.length; i++) {
    if (Math.abs(simulacion.nacionales[base + columnasDeLosGrandes[i]] - medianas[columnasDeLosGrandes[i]]) > toleranciaDeLosGrandes) return false;
  }
  for (let i = 0; i < columnasDelResto.length; i++) {
    if (Math.abs(simulacion.nacionales[base + columnasDelResto[i]] - medianas[columnasDelResto[i]]) > toleranciaDelResto) return false;
  }
  return true;
}
let toleranciaElegida = null;
let numeroDeCandidatos = FONDO_DE_SORTEOS;
for (let i = 0; i < ESCALERA_DE_TOLERANCIAS.length && toleranciaElegida === null; i++) {
  let candidatos = 0;
  for (let s = 0; s < FONDO_DE_SORTEOS; s++) { if (dentroDeLaTolerancia(s, ESCALERA_DE_TOLERANCIAS[i][0], ESCALERA_DE_TOLERANCIAS[i][1])) candidatos++; }
  if (candidatos >= MINIMO_DE_CANDIDATOS) { toleranciaElegida = ESCALERA_DE_TOLERANCIAS[i]; numeroDeCandidatos = candidatos; }
}

let mejorSorteo = 0;
let mejorDistancia = Infinity;
for (let s = 0; s < FONDO_DE_SORTEOS; s++) {
  if (toleranciaElegida && !dentroDeLaTolerancia(s, toleranciaElegida[0], toleranciaElegida[1])) continue;
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
const resultado = {
  sorteos: SORTEOS, semilla: SEMILLA, sorteo_elegido: mejorSorteo, fondo_de_sorteos: FONDO_DE_SORTEOS, candidatos: numeroDeCandidatos,
  tolerancia_de_los_grandes: toleranciaElegida ? toleranciaElegida[0] : null, tolerancia_del_resto: toleranciaElegida ? toleranciaElegida[1] : null,
  partidos: modelo.partidos, objetivos: objetivos, escanos: escanos,
};
const texto = JSON.stringify(resultado);
fs.writeFileSync(path.join(__dirname, "sitio", "escenario_representativo.json"), texto);
fs.writeFileSync(path.join(__dirname, "sitio", "escenario_representativo.js"), "const ESCENARIO_REPRESENTATIVO = " + texto + ";\n");
const nacionales = {};
const desviaciones = {};
modelo.partidos.forEach(function (partido, k) {
  nacionales[partido] = simulacion.nacionales[mejorSorteo * numeroDePartidos + k];
  if (medianas[k] >= 1 && partido !== "OTROS") desviaciones[partido] = nacionales[partido] - medianas[k];
});
console.log("Escenario representativo: sorteo " + mejorSorteo + " de un fondo de " + FONDO_DE_SORTEOS + " (" + numeroDeCandidatos + " candidatos, tolerancia " + (toleranciaElegida ? "grandes ±" + toleranciaElegida[0] + ", resto ±" + toleranciaElegida[1] : "sin filtro") +
  "), distancia " + mejorDistancia.toFixed(1) + " | escaños " + JSON.stringify(nacionales));
console.log("Desviación respecto de la mediana de la web: " + JSON.stringify(desviaciones));
