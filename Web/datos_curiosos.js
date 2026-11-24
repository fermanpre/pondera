"use strict";
/*
 * Datos curiosos para la página de inicio. (20/11/2026)
 *
 * Con el motor de la web (sitio/motor.js) y las mismas 10.000 simulaciones que ve el visitante (semilla 20261129, sitio/datos_modelo.json), calcula una lista de datos sueltos que la página de
 * inicio enseña al azar, uno por visita. Cada dato es un objeto con su tipo y sus cifras; el texto lo escribe el navegador (assets/curiosidades.js), que ya tiene los nombres de los partidos.
 *   - barrera: probabilidad de que un partido se quede sin escaños POR LA BARRERA: en la simulación se queda por debajo del mínimo de votos de la provincia (3 % de los votos válidos) y, sin barrera,
 *     el reparto D'Hondt le habría dado al menos un escaño (por eso solo cuentan las simulaciones en las que por cociente le «tocaba»). También se guarda el voto que cuesta el último escaño en el reparto central.
 *     Solo en las provincias donde el último escaño cuesta menos que la barrera (en el resto, la barrera de facto es la del propio reparto y el 3 % no actúa).
 *   - primera: provincias donde dos partidos se disputan la primera plaza (más escaños que ningún otro).
 *   - giro: los mayores cambios de voto de un partido en una provincia respecto a las generales de 2023.
 *   - entra: partidos con una probabilidad intermedia de sacar al menos un escaño en una provincia.
 *   - margen: votos que separan a un partido de un escaño más en el reparto central (el primero que se queda fuera frente al último que entra).
 *   - incierta: provincias donde el reparto central de escaños es el menos probable de las simulaciones.
 *   - nacional: partidos con una probabilidad apreciable de quedarse sin ningún diputado en toda España.
 *   - votos_sin_escanos: en qué porcentaje de las simulaciones un partido (PSOE frente a PP) saca más votos que el otro en toda España y, aun así, MENOS escaños (y al revés); un empate a escaños no cuenta. (23/11/2026, sin empates desde el 24/11/2026)
 *   - voto: el voto más valioso de España (sitio/voto_util.json, que genera voto_util_provincias.js: ejecutar antes).
 * Escribe sitio/curiosidades.js (const CURIOSIDADES = {...}) y curiosidades.json. Uso: node datos_curiosos.js [sorteos]
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 50000;   // 50.000 desde el 24/11/2026 (antes 10.000); con la misma semilla, los 10.000 primeros son los del navegador
const SEMILLA = 20261129;
const CUOTA_MINIMA_PARA_BARRERA = 0.004;   // un partido con menos de un 0,4 % del voto de la provincia no se cuenta como candidato a quedarse sin escaño
const PROBABILIDAD_BARRERA_MINIMA = 0.05;
const PROBABILIDAD_BARRERA_MAXIMA = 0.97;
const MAXIMO_DE_DATOS_POR_TIPO = { barrera: 6, margen: 6, incierta: 5, nacional: 5, voto: 4, primera: 5, giro: 4, entra: 6, votos_sin_escanos: 1 };

const datos = JSON.parse(fs.readFileSync(path.join(__dirname, "sitio", "datos_modelo.json"), "utf8"));
// Resultados reales de 2023 por provincia (votos de cada candidatura y votos válidos): sirven para medir los giros
const resultados2023 = new Function(fs.readFileSync(path.join(__dirname, "sitio", "resultados_2023.js"), "utf8") + "; return RESULTADOS_2023;")();
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
// D'Hondt SIN barrera: escaños de cada partido con los votos de una simulación, sin excluir a nadie por quedarse por debajo del mínimo
function escanosSinBarrera(votos, numeroDeEscanos) {
  const escanos = new Int32Array(votos.length);
  for (let n = 0; n < numeroDeEscanos; n++) {
    let mejor = -1, mejorCociente = -1;
    for (let k = 0; k < votos.length; k++) {
      if (votos[k] <= 0) continue;
      const cociente = votos[k] / (escanos[k] + 1);
      if (cociente > mejorCociente) { mejorCociente = cociente; mejor = k; }
    }
    if (mejor >= 0) escanos[mejor] += 1;
  }
  return escanos;
}

const candidatosDeBarrera = [];
for (let p = 0; p < P; p++) {
  const provincia = modelo.provincias[p];
  const minimo = datos.barrera * provincia.votos_validos;
  const N = provincia.escanos;
  const expulsados = new Int32Array(K);   // simulaciones en las que el partido, con escaño por cociente, se queda fuera por la barrera
  const debajo = new Int32Array(K);       // simulaciones en las que el partido queda por debajo de la barrera, tenga o no escaño por cociente
  const votos = new Float64Array(K);
  for (let s = 0; s < SORTEOS; s++) {
    for (let k = 0; k < K; k++) {
      const excluido = sinEscano[modelo.partidos[k]] || !modelo.presente[p * K + k];
      votos[k] = excluido ? 0 : cuotasFinales[(s * P + p) * K + k] * modelo.peso[p];
    }
    let hayAlguienDebajo = false;
    for (let k = 0; k < K; k++) if (votos[k] > 0 && votos[k] < minimo) { debajo[k]++; hayAlguienDebajo = true; }
    if (!hayAlguienDebajo) continue;
    const sinBarrera = escanosSinBarrera(votos, N);
    for (let k = 0; k < K; k++) if (votos[k] > 0 && votos[k] < minimo && sinBarrera[k] > 0) expulsados[k]++;
  }
  // Voto que cuesta el último escaño en el reparto central (porcentaje de los votos válidos): lo que tiene que sacar el último en entrar
  const cocientesCentrales = [];
  for (let k = 0; k < K; k++) {
    const votosCentrales = central.cuotas[p * K + k] * modelo.peso[p];
    if (sinEscano[modelo.partidos[k]] || !modelo.presente[p * K + k] || votosCentrales < minimo) continue;
    for (let d = 1; d <= N; d++) cocientesCentrales.push(votosCentrales / d);
  }
  cocientesCentrales.sort(function (a, b) { return b - a; });
  const ultimoEscanoPct = cocientesCentrales.length >= N ? Math.round(10000 * cocientesCentrales[N - 1] / provincia.votos_validos) / 10000 : null;
  for (let k = 0; k < K; k++) {
    if (sinEscano[modelo.partidos[k]] || !modelo.presente[p * K + k] || central.cuotas[p * K + k] < CUOTA_MINIMA_PARA_BARRERA) continue;
    const probabilidad = expulsados[k] / SORTEOS;
    if (ultimoEscanoPct === null || ultimoEscanoPct >= datos.barrera) continue;  // la barrera de facto es más alta que el 3 %: no es un dato de barrera
    if (probabilidad < PROBABILIDAD_BARRERA_MINIMA || probabilidad > PROBABILIDAD_BARRERA_MAXIMA) continue;
    candidatosDeBarrera.push({
      tipo: "barrera", partido: modelo.partidos[k], provincia: provincia.nombre, escanos: N, barrera: datos.barrera,
      probabilidad: Math.round(1000 * probabilidad) / 1000, debajo_de_la_barrera: Math.round(1000 * debajo[k] / SORTEOS) / 1000,
      voto_central: Math.round(10000 * central.cuotas[p * K + k] * modelo.peso[p] / provincia.votos_validos) / 10000, ultimo_escano: ultimoEscanoPct,
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
  // Solo es exacto si el que queda fuera y el último que entra son partidos distintos: si fueran el mismo, al ganar votos subirían también sus otros cocientes y la cuenta cambia
  if (cocientes.length > N && N >= 2 && cocientes[N].partido !== cocientes[N - 1].partido) {
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

// Escaños de Podemos dentro de Compromís-Front Valencià en cada sorteo (primer puesto de Alicante, etc.; Web/sitio/assets/origen_escanos_fv.js): cuentan como diputados de Podemos (22/11/2026)
const origenDeFV = require(path.join(__dirname, "sitio", "assets", "origen_escanos_fv.js"));
const columnaDeFV = modelo.partidos.indexOf("FV");
const columnaDePodemos = modelo.partidos.indexOf("PODEMOS");
const diputadosDePodemosEnFV = new Int16Array(SORTEOS);
if (columnaDeFV >= 0) {
  for (let s = 0; s < SORTEOS; s++) {
    for (let p = 0; p < P; p++) {
      diputadosDePodemosEnFV[s] += origenDeFV.origenDeEscanosFVEnProvincia(modelo.provincias[p].nombre, resultado.provinciales[(s * P + p) * K + columnaDeFV])["Podemos"] || 0;
    }
  }
}

// ---- Nacional: partidos que pueden quedarse sin ningún diputado (Podemos, contando su cupo en FV)
const nacionales = [];
for (let k = 0; k < K; k++) {
  if (!sinEscano[modelo.partidos[k]]) {
    let sinNinguno = 0;
    for (let s = 0; s < SORTEOS; s++) if (resultado.nacionales[s * K + k] + (k === columnaDePodemos ? diputadosDePodemosEnFV[s] : 0) === 0) sinNinguno++;
    const probabilidad = sinNinguno / SORTEOS;
    if (probabilidad >= 0.05 && probabilidad <= 0.95) nacionales.push({ tipo: "nacional", partido: modelo.partidos[k], probabilidad: Math.round(1000 * probabilidad) / 1000 });
  }
}
nacionales.sort(function (a, b) { return Math.abs(a.probabilidad - 0.5) - Math.abs(b.probabilidad - 0.5); });
nacionales.slice(0, MAXIMO_DE_DATOS_POR_TIPO.nacional).forEach(function (dato) { curiosidades.push(dato); });

// ---- Podemos con su puesto en Compromís-Front Valencià (primero de Alicante): probabilidad de tener al menos un diputado con y sin ese cupo (22/11/2026)
if (columnaDeFV >= 0 && columnaDePodemos >= 0) {
  let conPodemosPropio = 0;
  let conElCupoDeFV = 0;
  for (let s = 0; s < SORTEOS; s++) {
    const propios = resultado.nacionales[s * K + columnaDePodemos];
    if (propios > 0) conPodemosPropio++;
    if (propios + diputadosDePodemosEnFV[s] > 0) conElCupoDeFV++;
  }
  curiosidades.push({ tipo: "podemos_fv", propia: Math.round(1000 * conPodemosPropio / SORTEOS) / 1000, con_fv: Math.round(1000 * conElCupoDeFV / SORTEOS) / 1000 });
}

// ---- Más votos pero no más escaños: PSOE frente a PP (23/11/2026). Votos nacionales de cada sorteo = suma de las cuotas por provincia por los votos válidos de la provincia
const columnaDePP = modelo.partidos.indexOf("PP");
const columnaDePSOE = modelo.partidos.indexOf("PSOE");
if (columnaDePP >= 0 && columnaDePSOE >= 0) {
  let psoeMasVotos = 0, psoeMasVotosSinMasEscanos = 0, ppMasVotos = 0, ppMasVotosSinMasEscanos = 0;
  for (let s = 0; s < SORTEOS; s++) {
    let votosPP = 0, votosPSOE = 0;
    for (let p = 0; p < P; p++) {
      votosPP += cuotasFinales[(s * P + p) * K + columnaDePP] * modelo.peso[p];
      votosPSOE += cuotasFinales[(s * P + p) * K + columnaDePSOE] * modelo.peso[p];
    }
    const escanosPP = resultado.nacionales[s * K + columnaDePP];
    const escanosPSOE = resultado.nacionales[s * K + columnaDePSOE];
    if (votosPSOE > votosPP) { psoeMasVotos++; if (escanosPSOE < escanosPP) psoeMasVotosSinMasEscanos++; }
    else if (votosPP > votosPSOE) { ppMasVotos++; if (escanosPP < escanosPSOE) ppMasVotosSinMasEscanos++; }
  }
  curiosidades.push({
    tipo: "votos_sin_escanos",
    psoe_mas_votos_sin_mas_escanos: Math.round(1000 * psoeMasVotosSinMasEscanos / SORTEOS) / 1000,
    pp_mas_votos_sin_mas_escanos: Math.round(1000 * ppMasVotosSinMasEscanos / SORTEOS) / 1000,
    psoe_mas_votos: Math.round(1000 * psoeMasVotos / SORTEOS) / 1000,
    pp_mas_votos: Math.round(1000 * ppMasVotos / SORTEOS) / 1000,
  });
}

// ---- Primera plaza de cada provincia, giros desde 2023 y partidos que entran o no
const primeras = [];
const giros = [];
const entran = [];
for (let p = 0; p < P; p++) {
  const provincia = modelo.provincias[p];
  const N = provincia.escanos;
  const vecesPrimero = new Int32Array(K);
  const vecesConEscano = new Int32Array(K);
  for (let s = 0; s < SORTEOS; s++) {
    let maximo = 0, ganador = -1, empate = false;
    for (let k = 0; k < K; k++) {
      const escanos = resultado.provinciales[(s * P + p) * K + k];
      if (escanos > 0) vecesConEscano[k]++;
      if (escanos > maximo) { maximo = escanos; ganador = k; empate = false; } else if (escanos === maximo && escanos > 0) empate = true;
    }
    if (ganador >= 0 && !empate) vecesPrimero[ganador]++;
  }
  const ordenados = [];
  for (let k = 0; k < K; k++) ordenados.push(k);
  ordenados.sort(function (a, b) { return vecesPrimero[b] - vecesPrimero[a]; });
  const A = ordenados[0], B = ordenados[1];
  if (N >= 4 && vecesPrimero[B] / SORTEOS >= 0.15) {
    primeras.push({ tipo: "primera", provincia: provincia.nombre, escanos: N, partido_a: modelo.partidos[A], probabilidad_a: Math.round(1000 * vecesPrimero[A] / SORTEOS) / 1000,
                    partido_b: modelo.partidos[B], probabilidad_b: Math.round(1000 * vecesPrimero[B] / SORTEOS) / 1000 });
  }
  for (let k = 0; k < K; k++) {
    if (sinEscano[modelo.partidos[k]] || !modelo.presente[p * K + k]) continue;
    // Giro: porcentaje de los votos válidos en 2023 (resultado real) frente al del reparto central de 2026, ambos sobre votos válidos
    const de2023 = resultados2023[provincia.nombre];
    const candidatura = de2023 ? de2023.candidaturas.find(function (c) { return c.clave === modelo.partidos[k]; }) : null;
    const antes = candidatura ? candidatura.votos / de2023.validos : 0;
    const ahora = central.cuotas[p * K + k] * modelo.peso[p] / provincia.votos_validos;
    if (antes >= 0.03) {
      giros.push({ tipo: "giro", partido: modelo.partidos[k], provincia: provincia.nombre, de: Math.round(1000 * antes) / 1000, a: Math.round(1000 * ahora) / 1000, puntos: Math.round(1000 * (ahora - antes)) / 10 });
    }
    const probabilidad = vecesConEscano[k] / SORTEOS;
    if (ahora >= 0.01 && probabilidad >= 0.3 && probabilidad <= 0.7) {
      entran.push({ tipo: "entra", partido: modelo.partidos[k], provincia: provincia.nombre, escanos: N, probabilidad: Math.round(1000 * probabilidad) / 1000 });
    }
  }
}
primeras.sort(function (a, b) { return Math.abs(a.probabilidad_a - a.probabilidad_b) - Math.abs(b.probabilidad_a - b.probabilidad_b); });
primeras.slice(0, MAXIMO_DE_DATOS_POR_TIPO.primera).forEach(function (dato) { curiosidades.push(dato); });
giros.sort(function (a, b) { return Math.abs(b.puntos) - Math.abs(a.puntos); });
// Un giro por partido (el mayor de todas las provincias), para que no salgan cuatro veces el mismo partido
const partidosConGiro = {};
giros.filter(function (dato) { if (partidosConGiro[dato.partido]) return false; partidosConGiro[dato.partido] = true; return true; })
     .slice(0, MAXIMO_DE_DATOS_POR_TIPO.giro).forEach(function (dato) { curiosidades.push(dato); });
entran.sort(function (a, b) { return Math.abs(a.probabilidad - 0.5) - Math.abs(b.probabilidad - 0.5); });
entran.slice(0, MAXIMO_DE_DATOS_POR_TIPO.entra).forEach(function (dato) { curiosidades.push(dato); });

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
