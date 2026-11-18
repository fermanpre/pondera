"use strict";
/*
 * Resume con el motor de la web (sitio/motor.js, el mismo que usa el navegador) la previsión de varios días. (18/11/2026)
 * Entrada: un JSON {"dias": [{"dia": "2026-07-01", "datos": <datos del modelo de ese día, como sitio/datos_modelo.json>}, ...]}
 * Salida: un JSON {"dias": [{"dia", "central", "p10", "mediana", "p90", "mayorias", "bloques", "primera_fuerza", "al_menos_uno", "en_el_aire"}]}
 * Uso: node serie_prevision_simular.js entrada.json salida.json [sorteos]
 * Todos los días usan la misma semilla, así las curvas no tiemblan por azar de un día a otro.
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));
const combinaciones = JSON.parse(fs.readFileSync(path.join(__dirname, "combinaciones_de_mayoria.json"), "utf8"));

const SEMILLA = 20261129;

function sumaPorSorteo(modelo, resultado, partidos) {
  const K = modelo.numeroDePartidos;
  const indices = partidos.filter(function (p) { return p in modelo.indiceDePartido; }).map(function (p) { return modelo.indiceDePartido[p]; });
  const sumas = new Int32Array(resultado.sorteos);
  for (let s = 0; s < resultado.sorteos; s++) {
    let suma = 0;
    for (let i = 0; i < indices.length; i++) suma += resultado.nacionales[s * K + indices[i]];
    sumas[s] = suma;
  }
  return sumas;
}

function resumenDeSumas(sumas) {
  const ordenados = Array.from(sumas).sort(function (a, b) { return a - b; });
  return { mediana: Motor.percentil(ordenados, 0.5), p10: Motor.percentil(ordenados, 0.1), p90: Motor.percentil(ordenados, 0.9) };
}

function resumirDia(datos, sorteos) {
  const modelo = Motor.prepararModelo(datos);
  const K = modelo.numeroDePartidos;
  const P = modelo.numeroDeProvincias;
  const resultado = Motor.simular(modelo, { sorteos: sorteos, semilla: SEMILLA });
  const resumen = Motor.resumirNacional(modelo, resultado);

  // Reparto central (sin ruido), el mismo que la barra de escaños de la web
  const central = {};
  const sinRuido = Motor.repartoSinRuido(modelo, datos.objetivos).escanos;
  modelo.partidos.forEach(function (partido, k) {
    let total = 0;
    for (let p = 0; p < P; p++) total += sinRuido[p * K + k];
    central[partido] = total;
  });

  const salida = { central: central, p10: {}, mediana: {}, p90: {}, mayorias: {}, bloques: {}, al_menos_uno: {} };
  modelo.partidos.forEach(function (partido) {
    salida.p10[partido] = resumen[partido].p10;
    salida.mediana[partido] = resumen[partido].mediana;
    salida.p90[partido] = resumen[partido].p90;
  });

  combinaciones.combinaciones.forEach(function (combinacion) {
    salida.mayorias[combinacion.id] = Motor.probabilidadDeSuma(modelo, resultado, combinacion.partidos, combinaciones.mayoria_absoluta);
  });

  Object.keys(combinaciones.bloques).forEach(function (bloque) {
    const sumas = sumaPorSorteo(modelo, resultado, combinaciones.bloques[bloque]);
    const resumenBloque = resumenDeSumas(sumas);
    let centralBloque = 0;
    combinaciones.bloques[bloque].forEach(function (partido) { if (partido in central) centralBloque += central[partido]; });
    salida.bloques[bloque] = { central: centralBloque, p10: resumenBloque.p10, mediana: resumenBloque.mediana, p90: resumenBloque.p90 };
  });

  // Primera fuerza en escaños: PP (con UPN) frente a PSOE; empate y «otro» (Vox) aparte
  const pp = sumaPorSorteo(modelo, resultado, combinaciones.primera_fuerza.pp);
  const psoe = sumaPorSorteo(modelo, resultado, combinaciones.primera_fuerza.psoe);
  const otros = sumaPorSorteo(modelo, resultado, combinaciones.primera_fuerza.otros);
  const escanos = { PP: 0, PSOE: 0, empate: 0, otro: 0 };
  for (let s = 0; s < sorteos; s++) {
    const mayor = Math.max(pp[s], psoe[s], otros[s]);
    if (otros[s] === mayor && otros[s] > pp[s] && otros[s] > psoe[s]) escanos.otro++;
    else if (pp[s] === mayor && pp[s] > psoe[s]) escanos.PP++;
    else if (psoe[s] === mayor && psoe[s] > pp[s]) escanos.PSOE++;
    else escanos.empate++;
  }
  Object.keys(escanos).forEach(function (clave) { escanos[clave] /= sorteos; });
  // Primera fuerza en voto: el voto nacional simulado de cada sorteo (resultado.objetivos)
  const voto = { PP: 0, PSOE: 0, empate: 0, otro: 0 };
  const indicesPP = combinaciones.primera_fuerza.pp.filter(function (p) { return p in modelo.indiceDePartido; }).map(function (p) { return modelo.indiceDePartido[p]; });
  const indicePSOE = modelo.indiceDePartido.PSOE;
  const indiceVox = modelo.indiceDePartido.VOX;
  for (let s = 0; s < sorteos; s++) {
    let votoPP = 0;
    indicesPP.forEach(function (i) { votoPP += resultado.objetivos[s * K + i]; });
    const votoPSOE = resultado.objetivos[s * K + indicePSOE];
    const votoVox = resultado.objetivos[s * K + indiceVox];
    if (votoVox > votoPP && votoVox > votoPSOE) voto.otro++;
    else if (votoPP > votoPSOE) voto.PP++;
    else if (votoPSOE > votoPP) voto.PSOE++;
    else voto.empate++;
  }
  Object.keys(voto).forEach(function (clave) { voto[clave] /= sorteos; });
  salida.primera_fuerza = { escanos: escanos, voto: voto };

  combinaciones.al_menos_un_escano.forEach(function (partido) {
    if (partido in resumen) salida.al_menos_uno[partido] = resumen[partido].pAlMenos1;
  });

  // Escaños en el aire: el j-ésimo escaño de un partido en una provincia cuenta si su probabilidad está entre los dos umbrales
  const bajo = combinaciones.escanos_en_el_aire.umbral_bajo;
  const alto = combinaciones.escanos_en_el_aire.umbral_alto;
  let enElAire = 0;
  const conteo = new Int32Array(40);
  for (let p = 0; p < P; p++) {
    for (let k = 0; k < K; k++) {
      conteo.fill(0);
      let maximo = 0;
      for (let s = 0; s < sorteos; s++) {
        const cantidad = resultado.provinciales[(s * P + p) * K + k];
        conteo[cantidad]++;
        if (cantidad > maximo) maximo = cantidad;
      }
      let acumulado = sorteos;  // sorteos con al menos j escaños
      for (let j = 1; j <= maximo; j++) {
        acumulado -= conteo[j - 1];
        const probabilidad = acumulado / sorteos;
        if (probabilidad >= bajo && probabilidad <= alto) enElAire++;
      }
    }
  }
  salida.en_el_aire = enElAire;
  return salida;
}

function main() {
  const [, , rutaEntrada, rutaSalida, textoSorteos] = process.argv;
  if (!rutaEntrada || !rutaSalida) { console.error("Uso: node serie_prevision_simular.js entrada.json salida.json [sorteos]"); process.exit(2); }
  const sorteos = textoSorteos ? parseInt(textoSorteos, 10) : 10000;
  const entrada = JSON.parse(fs.readFileSync(rutaEntrada, "utf8"));
  const inicio = Date.now();
  const dias = entrada.dias.map(function (registro, indice) {
    const resumen = resumirDia(registro.datos, sorteos);
    resumen.dia = registro.dia;
    if ((indice + 1) % 10 === 0) console.log("  " + (indice + 1) + "/" + entrada.dias.length + " días (" + ((Date.now() - inicio) / 1000).toFixed(0) + " s)");
    return resumen;
  });
  fs.writeFileSync(rutaSalida, JSON.stringify({ sorteos: sorteos, semilla: SEMILLA, dias: dias }), "utf8");
  console.log(dias.length + " días con " + sorteos + " sorteos en " + ((Date.now() - inicio) / 1000).toFixed(1) + " s");
}

main();
