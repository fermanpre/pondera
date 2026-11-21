"use strict";
/*
 * Parte común de las páginas «Mundos posibles» y «Mundos raros». (22/11/2026)
 * Simula las 10.000 sorteos del motor de la web (semilla 20261129, sitio/datos_modelo.json) guardando, además de los escaños, los votos de cada partido en cada sorteo (cuota final de cada
 * provincia x votos a candidaturas de la provincia, base de 2023 sobre residentes, la del modelo), y ofrece lo necesario para describir un sorteo como «mundo» y para elegir, entre varios
 * sorteos, el más parecido a la mediana de cada partido (distancia en desviaciones robustas: rango intercuartílico / 1,349 de todos los sorteos, con un mínimo de 1 escaño).
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SEMILLA = 20261129;
const PARTIDOS_DE_LA_DERECHA = ["PP", "UPN", "VOX", "CC", "SALF"];
const PARTIDOS_DEL_BLOQUE_DE_INVESTIDURA = ["PSOE", "SUMAR", "FV", "UPC", "PODEMOS", "PNV", "ERC", "BILDU", "BNG", "JUNTS", "ADELANTE"];

function prepararSimulacion(sorteos) {
  const datos = JSON.parse(fs.readFileSync(path.join(__dirname, "sitio", "datos_modelo.json"), "utf8"));
  const modelo = Motor.prepararModelo(datos);
  const numeroDePartidos = modelo.numeroDePartidos;
  const votosPorSorteo = new Float64Array(sorteos * numeroDePartidos);
  const simulacion = Motor.simular(modelo, { sorteos: sorteos, semilla: SEMILLA, alRepartir: function (sorteo, repartoFinal) {
    for (let p = 0; p < modelo.numeroDeProvincias; p++) {
      for (let k = 0; k < numeroDePartidos; k++) { votosPorSorteo[sorteo * numeroDePartidos + k] += repartoFinal[p * numeroDePartidos + k] * modelo.peso[p]; }
    }
  } });
  const nacionales = simulacion.nacionales;

  const columnasDe = function (partidos) {
    return partidos.map(function (partido) { return modelo.partidos.indexOf(partido); }).filter(function (columna) { return columna >= 0; });
  };
  const columnasDeLaDerecha = columnasDe(PARTIDOS_DE_LA_DERECHA);
  const columnasDeLaInvestidura = columnasDe(PARTIDOS_DEL_BLOQUE_DE_INVESTIDURA);
  const sumaDeColumnas = function (sorteo, columnas) {
    let suma = 0;
    columnas.forEach(function (columna) { suma += nacionales[sorteo * numeroDePartidos + columna]; });
    return suma;
  };

  // Escala de cada partido: rango intercuartílico / 1,349 de todos los sorteos, con un mínimo de 1 escaño
  const escalas = [];
  for (let k = 0; k < numeroDePartidos; k++) {
    const valores = new Int16Array(sorteos);
    for (let sorteo = 0; sorteo < sorteos; sorteo++) { valores[sorteo] = nacionales[sorteo * numeroDePartidos + k]; }
    valores.sort();
    escalas.push(Math.max(1, (valores[Math.floor(sorteos * 0.75)] - valores[Math.floor(sorteos * 0.25)]) / 1.349));
  }

  const mediana = function (valores) {
    const copia = Int16Array.from(valores).sort();
    return copia[Math.floor(copia.length / 2)];
  };

  // Entre varios sorteos, el más parecido a la mediana de cada partido en ese grupo
  const masParecidoALaMediana = function (grupo) {
    const medianasDelGrupo = [];
    for (let k = 0; k < numeroDePartidos; k++) {
      medianasDelGrupo.push(mediana(grupo.map(function (sorteo) { return nacionales[sorteo * numeroDePartidos + k]; })));
    }
    let elegido = grupo[0];
    let mejorDistancia = Infinity;
    grupo.forEach(function (sorteo) {
      let distancia = 0;
      for (let k = 0; k < numeroDePartidos; k++) {
        const diferencia = (nacionales[sorteo * numeroDePartidos + k] - medianasDelGrupo[k]) / escalas[k];
        distancia += diferencia * diferencia;
      }
      if (distancia < mejorDistancia) { mejorDistancia = distancia; elegido = sorteo; }
    });
    return elegido;
  };

  // Un sorteo descrito como mundo: escaños, votos y porcentaje de cada partido y escaños de cada bloque
  const describirSorteo = function (sorteo) {
    const escanos = {};
    const votos = {};
    const porcentaje = {};
    modelo.partidos.forEach(function (partido, k) {
      escanos[partido] = nacionales[sorteo * numeroDePartidos + k];
      votos[partido] = Math.round(votosPorSorteo[sorteo * numeroDePartidos + k]);
      porcentaje[partido] = Math.round(1000 * votosPorSorteo[sorteo * numeroDePartidos + k] / modelo.pesoTotal) / 10;
    });
    return { escanos: escanos, votos: votos, porcentaje: porcentaje, derecha: sumaDeColumnas(sorteo, columnasDeLaDerecha), investidura: sumaDeColumnas(sorteo, columnasDeLaInvestidura) };
  };

  return { datos: datos, modelo: modelo, sorteos: sorteos, nacionales: nacionales, provinciales: simulacion.provinciales, sumaDeColumnas: sumaDeColumnas, columnasDeLaDerecha: columnasDeLaDerecha,
           columnasDeLaInvestidura: columnasDeLaInvestidura, masParecidoALaMediana: masParecidoALaMediana, describirSorteo: describirSorteo };
}

function guardar(nombre, contenido, constante) {
  fs.writeFileSync(path.join(__dirname, "sitio", nombre + ".json"), JSON.stringify(contenido));
  fs.writeFileSync(path.join(__dirname, "sitio", nombre + ".js"), "const " + constante + " = " + JSON.stringify(contenido) + ";\n");
}

module.exports = { prepararSimulacion: prepararSimulacion, guardar: guardar };
