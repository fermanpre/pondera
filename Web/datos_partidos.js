"use strict";
/*
 * Datos de las páginas de cada partido: voto por circunscripción con sus franjas. (23/11/2026)
 *
 * Con el motor de la web (sitio/motor.js) y las mismas 10.000 simulaciones que ve el visitante (semilla 20261129, sitio/datos_modelo.json), calcula para cada candidatura (todas menos «Otros» y
 * Nueva Canarias) y cada provincia donde concurre:
 *   - voto previsto (el de datos_modelo.json, reparto central del modelo tras el blend regional), en % de los votos a candidaturas;
 *   - rangos del 80 % (percentiles 10 y 90) y del 95 % (2,5 y 97,5) del voto por sorteo, con el mismo criterio de índices que la tabla de la web (assets/app_prevision.js);
 *   - voto y escaños de 2023 en la provincia (con la misma correspondencia de claves que la tabla: Front Valencià = Sumar 2023 en las provincias valencianas, Unidad del Pueblo Canario = Sumar
 *     más Nueva Canarias en Canarias, Geroa Bai = X:GBAI; Podemos y SALF no tienen 2023 propio);
 *   - escaños del escenario representativo (sitio/escenario_representativo.json) y probabilidad de sacar al menos uno (para las futuras campanitas de la página: seguros, probables y rivales).
 * Y, por partido, el objetivo nacional, los escaños (mediana, rango del 95 % y escenario) y el voto y los escaños de 2023 en las circunscripciones donde concurre.
 * Escribe sitio/datos_partidos.js (const DATOS_PARTIDOS = {...}) y datos_partidos.json. Uso: node datos_partidos.js [sorteos]
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;
const SEMILLA = 20261129;
const PARTIDOS_QUE_NO_TIENEN_PAGINA = ["OTROS", "NC"];
const PROVINCIAS_VALENCIANAS = ["Alicante/Alacant", "Castellón/Castelló", "Valencia/València"];
const PROVINCIAS_CANARIAS = ["Palmas (Las)", "Santa Cruz de Tenerife"];

const carpetaSitio = path.join(__dirname, "sitio");
const datos = JSON.parse(fs.readFileSync(path.join(carpetaSitio, "datos_modelo.json"), "utf8"));
const resultados2023 = JSON.parse(fs.readFileSync(path.join(carpetaSitio, "resultados_2023.json"), "utf8")).provincias;
const escenario = JSON.parse(fs.readFileSync(path.join(carpetaSitio, "escenario_representativo.json"), "utf8"));
const modelo = Motor.prepararModelo(datos);
const K = modelo.numeroDePartidos;
const P = modelo.numeroDeProvincias;
const simulacion = Motor.simular(modelo, { sorteos: SORTEOS, semilla: SEMILLA, guardarCuotas: true });

const redondear = (valor, decimales) => Math.round(valor * Math.pow(10, decimales)) / Math.pow(10, decimales);
// Mismos índices que textoDeRangoDeVoto de assets/app_prevision.js: el inferior con floor y el superior con ceil
const percentilInferior = (ordenados, fraccion) => ordenados[Math.floor(fraccion * (ordenados.length - 1))];
const percentilSuperior = (ordenados, fraccion) => ordenados[Math.ceil(fraccion * (ordenados.length - 1))];

// Voto y escaños de un partido en una provincia en 2023, o null si ese partido no tiene 2023 propio allí
function resultadoDe2023(partido, nombreDeProvincia) {
  const provincia = resultados2023[nombreDeProvincia];
  if (!provincia) { return null; }
  const totalDeVotos = provincia.candidaturas.reduce((suma, candidatura) => suma + candidatura.votos, 0);
  const buscar = (clave) => provincia.candidaturas.find((candidatura) => candidatura.clave === clave);
  let votos = 0, escanos = 0, encontrado = false;
  const sumar = (candidatura) => { if (candidatura) { votos += candidatura.votos; escanos += candidatura.escanos; encontrado = true; } };
  if (partido === "FV") { if (PROVINCIAS_VALENCIANAS.indexOf(nombreDeProvincia) >= 0) { sumar(buscar("SUMAR")); } }
  else if (partido === "UPC") { if (PROVINCIAS_CANARIAS.indexOf(nombreDeProvincia) >= 0) { sumar(buscar("SUMAR")); sumar(buscar("X:NC- bc")); } }
  else if (partido === "GBAI") { sumar(buscar("X:GBAI")); }
  else if (partido === "PODEMOS" || partido === "SALF") { /* sin 2023 propio */ }
  else { sumar(buscar(partido)); }
  if (!encontrado) { return null; }
  return { voto: 100 * votos / totalDeVotos, escanos: escanos };
}

const escanosDelEscenario = (p, k) => escenario.escanos[p * K + k];
const partidosDelModelo = modelo.partidos.filter((partido) => PARTIDOS_QUE_NO_TIENEN_PAGINA.indexOf(partido) < 0);
const salida = { fecha_promedio: datos.fecha_promedio, sorteos: SORTEOS, semilla: SEMILLA, partidos: {} };

partidosDelModelo.forEach(function (partido) {
  const k = modelo.partidos.indexOf(partido);
  const filas = [];
  let votos2023 = 0, escanos2023 = 0, totalDeVotos2023 = 0;
  for (let p = 0; p < P; p++) {
    const provinciaDelModelo = datos.provincias[p];
    const cuotaCentral = provinciaDelModelo.cuotas[partido] || 0;
    if (!modelo.presente[p * K + k] || cuotaCentral < 0.0005) { continue; }
    const valores = new Float64Array(SORTEOS);
    let conEscano = 0;
    for (let s = 0; s < SORTEOS; s++) {
      valores[s] = 100 * simulacion.cuotas[(s * P + p) * K + k] / 65535;
      if (simulacion.provinciales[(s * P + p) * K + k] >= 1) { conEscano += 1; }
    }
    valores.sort();
    // En Navarra la columna UPN lleva la coalición UPN-PP: sus escaños son los de UPN más los de PP en esa provincia
    const coalicion = modelo.coaliciones.find((c) => c.provincia === p && c.columna === k);
    const escanosDelEscenarioEnLaProvincia = escanosDelEscenario(p, k) + (coalicion ? escanosDelEscenario(p, coalicion.socio) : 0);
    const de2023 = resultadoDe2023(partido, provinciaDelModelo.nombre);
    if (de2023) {
      const total = resultados2023[provinciaDelModelo.nombre].candidaturas.reduce((suma, candidatura) => suma + candidatura.votos, 0);
      votos2023 += de2023.voto * total / 100;
      totalDeVotos2023 += total;
      escanos2023 += de2023.escanos;
    }
    filas.push({
      nombre: provinciaDelModelo.nombre, comunidad: provinciaDelModelo.comunidad, escanos_de_la_provincia: provinciaDelModelo.escanos,
      voto: redondear(100 * cuotaCentral, 2),
      p025: redondear(percentilInferior(valores, 0.025), 2), p10: redondear(percentilInferior(valores, 0.1), 2), p50: redondear(valores[Math.floor(SORTEOS / 2)], 2),
      p90: redondear(percentilSuperior(valores, 0.9), 2), p975: redondear(percentilSuperior(valores, 0.975), 2),
      voto2023: de2023 ? redondear(de2023.voto, 2) : null, escanos2023: de2023 ? de2023.escanos : null,
      escanos_escenario: escanosDelEscenarioEnLaProvincia, probabilidad_de_escano: redondear(conEscano / SORTEOS, 3),
    });
  }
  filas.sort(function (a, b) { return b.voto - a.voto; });
  // Escaños nacionales por sorteo
  const escanosPorSorteo = new Int16Array(SORTEOS);
  for (let s = 0; s < SORTEOS; s++) { escanosPorSorteo[s] = simulacion.nacionales[s * K + k]; }
  escanosPorSorteo.sort();
  let escanosDelEscenarioNacional = 0;
  for (let p = 0; p < P; p++) { escanosDelEscenarioNacional += escanosDelEscenario(p, k); }
  salida.partidos[partido] = {
    objetivo: redondear(100 * (datos.objetivos[partido] || 0), 2),
    escanos: { mediana: escanosPorSorteo[Math.floor(SORTEOS / 2)], p025: percentilInferior(escanosPorSorteo, 0.025), p975: percentilSuperior(escanosPorSorteo, 0.975), escenario: escanosDelEscenarioNacional },
    voto2023_donde_concurre: totalDeVotos2023 > 0 ? redondear(100 * votos2023 / totalDeVotos2023, 2) : null,
    escanos2023_donde_concurre: totalDeVotos2023 > 0 ? escanos2023 : null,
    provincias: filas,
  };
});

const texto = JSON.stringify(salida);
fs.writeFileSync(path.join(carpetaSitio, "datos_partidos.json"), texto);
fs.writeFileSync(path.join(carpetaSitio, "datos_partidos.js"), "const DATOS_PARTIDOS = " + texto + ";\n");
partidosDelModelo.forEach(function (partido) {
  const d = salida.partidos[partido];
  console.log(partido.padEnd(9), "provincias:", String(d.provincias.length).padStart(2), "| voto nacional", d.objetivo + " %", "| escaños mediana", d.escanos.mediana, "(" + d.escanos.p025 + "-" + d.escanos.p975 + ") escenario", d.escanos.escenario);
});
console.log("datos_partidos escrito:", (texto.length / 1024).toFixed(0), "kB");
