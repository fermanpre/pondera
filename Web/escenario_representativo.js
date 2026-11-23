"use strict";
/*
 * Escenario que enseñan el hemiciclo, la barra de la portada, las mayorías y las páginas de provincias y comunidades. (23/11/2026)
 *
 * Es el reparto central: en cada provincia, D'Hondt (con la barrera y las coaliciones del modelo) sobre el voto previsto que enseñan las tablas (datos_modelo.json). Así cada fila es coherente con
 * su voto: en Cádiz, con PP 28,0, PSOE 25,5, Vox 19,3 y Adelante 16,1, salen 3-2-2-1, y no el 2-2-2-2 que daba el sorteo más parecido a las medianas. Hasta el 23/11/2026 el escenario era un sorteo
 * de las simulaciones (el más parecido a la mediana de cada partido y de cada partido en cada provincia); ese sorteo siempre se torcía en unas 25-30 de las 1.040 celdas provincia-partido, y una
 * de ellas era visible en una provincia grande. El total nacional de este reparto puede no coincidir con las medianas de las simulaciones (cada mediana sale de sorteos distintos).
 *
 * Se incrusta en sitio/escenario_representativo.js (const ESCENARIO_REPRESENTATIVO = {...}) y .json con el mismo formato de siempre (partidos, objetivos y escaños por provincia x partido), para
 * que lo lean las páginas de partido, de provincia y de comunidad. El navegador no lo necesita para la previsión: calcula el mismo reparto con MotorElectoral.repartoSinRuido y los objetivos que
 * tenga el visitante. Uso: node escenario_representativo.js
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SORTEOS_DE_LA_WEB = 10000;
const SEMILLA = 20261129;

const datos = JSON.parse(fs.readFileSync(path.join(__dirname, "sitio", "datos_modelo.json"), "utf8"));
const modelo = Motor.prepararModelo(datos);
const numeroDePartidos = modelo.numeroDePartidos;
const numeroDeProvincias = modelo.numeroDeProvincias;

const objetivos = {};
modelo.partidos.forEach(function (partido) { objetivos[partido] = datos.objetivos[partido] || 0; });
const central = Motor.repartoSinRuido(modelo, objetivos);
const escanos = Array.from(central.escanos);

const resultado = { sorteos: SORTEOS_DE_LA_WEB, semilla: SEMILLA, metodo: "reparto central por D'Hondt", partidos: modelo.partidos, objetivos: objetivos, escanos: escanos };
const texto = JSON.stringify(resultado);
fs.writeFileSync(path.join(__dirname, "sitio", "escenario_representativo.json"), texto);
fs.writeFileSync(path.join(__dirname, "sitio", "escenario_representativo.js"), "const ESCENARIO_REPRESENTATIVO = " + texto + ";\n");

// Resumen: escaños nacionales del reparto central frente a la mediana de las simulaciones de la web
const simulacion = Motor.simular(modelo, { sorteos: SORTEOS_DE_LA_WEB, semilla: SEMILLA });
const escanosNacionales = {};
const diferenciasConLaMediana = {};
modelo.partidos.forEach(function (partido, k) {
  let total = 0;
  for (let p = 0; p < numeroDeProvincias; p++) { total += escanos[p * numeroDePartidos + k]; }
  escanosNacionales[partido] = total;
  const valores = new Int16Array(SORTEOS_DE_LA_WEB);
  for (let s = 0; s < SORTEOS_DE_LA_WEB; s++) { valores[s] = simulacion.nacionales[s * numeroDePartidos + k]; }
  valores.sort();
  const mediana = valores[Math.floor(SORTEOS_DE_LA_WEB / 2)];
  if (mediana >= 1 && partido !== "OTROS") { diferenciasConLaMediana[partido] = total - mediana; }
});
console.log("Escenario (reparto central por D'Hondt) | escaños " + JSON.stringify(escanosNacionales));
console.log("Diferencia con la mediana de las simulaciones: " + JSON.stringify(diferenciasConLaMediana));
