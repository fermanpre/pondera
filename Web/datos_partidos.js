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
 *   - escaños: mediana, escaño más probable, rangos del 80 % y del 95 % (con los índices de textoDeRangoDeEscanos de assets/app_prevision.js) y distribución de probabilidad de cada número de escaños
 *     (para la vista de escaños de la página, como en las tablas de provincia y comunidad);
 *   - escaños del escenario representativo (sitio/escenario_representativo.json) y probabilidad de sacar al menos uno (para las futuras campanitas de la página: seguros, probables y rivales).
 *   - votos (25/11/2026): central, rangos del 80 % y del 95 %, por provincia y en toda España. En cada sorteo, la participación de cada provincia es la prevista (datos_modelo.json, bloque
 *     «participacion») más un choque nacional, uno de su comunidad y uno propio, y los votos son electores x participación x fracción a candidaturas x cuota del sorteo. Sin voto desde el extranjero;
 * Y, por partido, el objetivo nacional, los escaños (mediana, rango del 95 % y escenario) y el voto y los escaños de 2023 en las circunscripciones donde concurre.
 * Escribe sitio/datos_partidos.js (const DATOS_PARTIDOS = {...}) y datos_partidos.json. Uso: node datos_partidos.js [sorteos]
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 50000;   // 50.000 desde el 24/11/2026 (antes 10.000); con la misma semilla, los 10.000 primeros son los del navegador
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

// Participación simulada: un generador propio (no altera los sorteos de voto y escaños) y la misma semilla en cada ejecución
function generadorNormal(semilla) {
  let estado = semilla >>> 0;
  const uniforme = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(1 - uniforme())) * Math.cos(2 * Math.PI * uniforme());
}
const participacion = datos.participacion || null;
let votosACandidaturas = null;   // [sorteo * P + provincia]: votos a candidaturas de la provincia en ese sorteo
let votosCentrales = null;       // [provincia]
if (participacion) {
  const normal = generadorNormal(SEMILLA + 7);
  const porProvincia = datos.provincias.map((provincia) => participacion.provincias[provincia.nombre]);
  const comunidades = Array.from(new Set(porProvincia.map((dato) => dato.comunidad)));
  const indiceDeComunidad = porProvincia.map((dato) => comunidades.indexOf(dato.comunidad));
  votosCentrales = porProvincia.map((dato) => dato.electores * (dato.participacion / 100) * dato.a_candidaturas);
  votosACandidaturas = new Float64Array(SORTEOS * P);
  const choqueDeComunidad = new Float64Array(comunidades.length);
  const choqueLocal = new Float64Array(P);
  for (let s = 0; s < SORTEOS; s++) {
    const choqueNacional = normal() * participacion.sigma_nacional;
    for (let c = 0; c < comunidades.length; c++) { choqueDeComunidad[c] = normal(); }
    // Los choques de comunidad y de provincia se centran (media ponderada por censo igual a cero) para que la desviación nacional sea exactamente la del choque nacional
    let sumaLocal = 0, sumaDeElectores = 0;
    for (let p = 0; p < P; p++) {
      const dato = porProvincia[p];
      choqueLocal[p] = choqueDeComunidad[indiceDeComunidad[p]] * dato.sigma_comunidad + normal() * dato.sigma_provincia;
      sumaLocal += dato.electores * choqueLocal[p];
      sumaDeElectores += dato.electores;
    }
    for (let p = 0; p < P; p++) {
      const dato = porProvincia[p];
      const tasa = dato.participacion + choqueNacional + choqueLocal[p] - sumaLocal / sumaDeElectores;
      votosACandidaturas[s * P + p] = dato.electores * (Math.min(95, Math.max(30, tasa)) / 100) * dato.a_candidaturas;
    }
  }
}
// {central, p025, p10, p50, p90, p975} de una muestra de votos (la ordena)
function resumenDeVotos(valores, central) {
  valores.sort();
  return { central: Math.round(central), p025: Math.round(percentilInferior(valores, 0.025)), p10: Math.round(percentilInferior(valores, 0.1)), p50: Math.round(valores[Math.floor(valores.length / 2)]),
    p90: Math.round(percentilSuperior(valores, 0.9)), p975: Math.round(percentilSuperior(valores, 0.975)) };
}

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
// Rangos de votos para las tablas de la portada, las provincias y las comunidades (datos_votos.js): [central, p10, p90, p2,5, p97,5]
const rangosDeVotos = { nacional: {}, provincias: {}, comunidades: {} };
const compacto = (resumen) => [resumen.central, resumen.p10, resumen.p90, resumen.p025, resumen.p975];
const salida = { fecha_promedio: datos.fecha_promedio, sorteos: SORTEOS, semilla: SEMILLA, partidos: {} };
if (participacion) {
  const electores = datos.provincias.reduce((suma, provincia) => suma + participacion.provincias[provincia.nombre].electores, 0);
  salida.participacion = { nacional: participacion.nacional, sigma_nacional: participacion.sigma_nacional, electores: electores };
}

partidosDelModelo.forEach(function (partido) {
  const k = modelo.partidos.indexOf(partido);
  const filas = [];
  let votos2023 = 0, escanos2023 = 0, totalDeVotos2023 = 0;
  const votosNacionales = new Float64Array(SORTEOS);
  const votosPorComunidad = {};   // comunidad -> {muestra por sorteo, central}
  let votosNacionalesCentrales = 0;
  for (let p = 0; p < P; p++) {
    const provinciaDelModelo = datos.provincias[p];
    const cuotaCentral = provinciaDelModelo.cuotas[partido] || 0;
    if (!modelo.presente[p * K + k] || cuotaCentral < 0.0005) { continue; }
    const valores = new Float64Array(SORTEOS);
    const escanosPorSorteoEnLaProvincia = new Uint8Array(SORTEOS);
    const cuentasDeEscanos = new Uint32Array(64);
    let conEscano = 0;
    for (let s = 0; s < SORTEOS; s++) {
      valores[s] = 100 * simulacion.cuotas[(s * P + p) * K + k] / 65535;
      const escanosDelSorteo = simulacion.provinciales[(s * P + p) * K + k];
      escanosPorSorteoEnLaProvincia[s] = escanosDelSorteo;
      cuentasDeEscanos[escanosDelSorteo] += 1;
      if (escanosDelSorteo >= 1) { conEscano += 1; }
    }
    let votosDeLaProvincia = null;
    if (votosACandidaturas) {
      const muestra = new Float64Array(SORTEOS);
      for (let s = 0; s < SORTEOS; s++) {
        muestra[s] = votosACandidaturas[s * P + p] * valores[s] / 100;
        votosNacionales[s] += muestra[s];
      }
      votosNacionalesCentrales += votosCentrales[p] * cuotaCentral;
      const comunidad = datos.provincias[p].comunidad;
      if (!votosPorComunidad[comunidad]) { votosPorComunidad[comunidad] = { muestra: new Float64Array(SORTEOS), central: 0 }; }
      for (let s = 0; s < SORTEOS; s++) { votosPorComunidad[comunidad].muestra[s] += muestra[s]; }
      votosPorComunidad[comunidad].central += votosCentrales[p] * cuotaCentral;
      votosDeLaProvincia = resumenDeVotos(muestra, votosCentrales[p] * cuotaCentral);
      (rangosDeVotos.provincias[provinciaDelModelo.nombre] = rangosDeVotos.provincias[provinciaDelModelo.nombre] || {})[partido] = compacto(votosDeLaProvincia);
    }
    valores.sort();
    escanosPorSorteoEnLaProvincia.sort();
    // Distribución de probabilidad de cada número de escaños, hasta el último con un 0,05 % o más, y escaño más probable (el menor en caso de empate)
    let ultimoConProbabilidad = 0, masProbable = 0;
    for (let n = 0; n < cuentasDeEscanos.length; n++) {
      if (cuentasDeEscanos[n] / SORTEOS >= 0.0005) { ultimoConProbabilidad = n; }
      if (cuentasDeEscanos[n] > cuentasDeEscanos[masProbable]) { masProbable = n; }
    }
    const distribucionDeEscanos = [];
    for (let n = 0; n <= ultimoConProbabilidad; n++) { distribucionDeEscanos.push(redondear(cuentasDeEscanos[n] / SORTEOS, 3)); }
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
      voto: redondear(100 * cuotaCentral, 2), votos: votosDeLaProvincia,
      p025: redondear(percentilInferior(valores, 0.025), 2), p10: redondear(percentilInferior(valores, 0.1), 2), p50: redondear(valores[Math.floor(SORTEOS / 2)], 2),
      p90: redondear(percentilSuperior(valores, 0.9), 2), p975: redondear(percentilSuperior(valores, 0.975), 2),
      voto2023: de2023 ? redondear(de2023.voto, 2) : null, escanos2023: de2023 ? de2023.escanos : null,
      escanos: {
        mediana: escanosPorSorteoEnLaProvincia[Math.floor(SORTEOS / 2)], mas_probable: masProbable,
        p10: percentilInferior(escanosPorSorteoEnLaProvincia, 0.1), p90: percentilSuperior(escanosPorSorteoEnLaProvincia, 0.9),
        p025: percentilInferior(escanosPorSorteoEnLaProvincia, 0.025), p975: percentilSuperior(escanosPorSorteoEnLaProvincia, 0.975),
      },
      distribucion_de_escanos: distribucionDeEscanos,
      escanos_escenario: escanosDelEscenarioEnLaProvincia, probabilidad_de_escano: redondear(conEscano / SORTEOS, 3),
    });
  }
  filas.sort(function (a, b) { return b.voto - a.voto; });
  Object.keys(votosPorComunidad).forEach(function (comunidad) {
    (rangosDeVotos.comunidades[comunidad] = rangosDeVotos.comunidades[comunidad] || {})[partido] = compacto(resumenDeVotos(votosPorComunidad[comunidad].muestra, votosPorComunidad[comunidad].central));
  });
  // Escaños nacionales por sorteo
  const escanosPorSorteo = new Int16Array(SORTEOS);
  for (let s = 0; s < SORTEOS; s++) { escanosPorSorteo[s] = simulacion.nacionales[s * K + k]; }
  escanosPorSorteo.sort();
  let escanosDelEscenarioNacional = 0;
  for (let p = 0; p < P; p++) { escanosDelEscenarioNacional += escanosDelEscenario(p, k); }
  salida.partidos[partido] = {
    objetivo: redondear(100 * (datos.objetivos[partido] || 0), 2),
    votos: votosACandidaturas ? resumenDeVotos(votosNacionales, votosNacionalesCentrales) : null,
    escanos: { mediana: escanosPorSorteo[Math.floor(SORTEOS / 2)], p025: percentilInferior(escanosPorSorteo, 0.025), p975: percentilSuperior(escanosPorSorteo, 0.975), escenario: escanosDelEscenarioNacional },
    voto2023_donde_concurre: totalDeVotos2023 > 0 ? redondear(100 * votos2023 / totalDeVotos2023, 2) : null,
    escanos2023_donde_concurre: totalDeVotos2023 > 0 ? escanos2023 : null,
    provincias: filas,
  };
});

if (votosACandidaturas) {
  Object.keys(salida.partidos).forEach(function (partido) { rangosDeVotos.nacional[partido] = compacto(salida.partidos[partido].votos); });
  fs.writeFileSync(path.join(carpetaSitio, "datos_votos.js"), "const DATOS_VOTOS = " + JSON.stringify(rangosDeVotos) + ";\n");
}
const texto = JSON.stringify(salida);
fs.writeFileSync(path.join(carpetaSitio, "datos_partidos.json"), texto);
fs.writeFileSync(path.join(carpetaSitio, "datos_partidos.js"), "const DATOS_PARTIDOS = " + texto + ";\n");
partidosDelModelo.forEach(function (partido) {
  const d = salida.partidos[partido];
  console.log(partido.padEnd(9), "provincias:", String(d.provincias.length).padStart(2), "| voto nacional", d.objetivo + " %", "| escaños mediana", d.escanos.mediana, "(" + d.escanos.p025 + "-" + d.escanos.p975 + ") escenario", d.escanos.escenario);
});
console.log("datos_partidos escrito:", (texto.length / 1024).toFixed(0), "kB");
