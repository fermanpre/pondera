"use strict";
/*
 * Escaños en juego y valor del voto en cada provincia. (19/11/2026)
 *
 * Con el motor de la web (sitio/motor.js) y las mismas 10.000 simulaciones que ve el visitante (semilla 20261129, sitio/datos_modelo.json), calcula para cada provincia:
 *   - escaños «casi decididos» de cada partido: el escaño j-ésimo de un partido es seguro si en al menos el 90 % de los sorteos saca j o más (si en una provincia grande la suma de seguros
 *     supera los escaños, se sube el umbral a 95, 97,5 y 99 % hasta que cabe: «umbral» dice cuál se usó);
 *   - escaños «en el aire» = escaños de la provincia - seguros, y quién se los lleva: escaños de más que los seguros, por partido, de media por sorteo (con un solo escaño en el aire es
 *     la probabilidad de llevárselo);
 *   - valor de un voto a cada partido: escaños extra que gana ese partido de media por cada voto adicional en la provincia (se suman DELTA = 1 % de los votos de la provincia al partido en cada
 *     sorteo, se vuelven a repartir los escaños de la provincia y se mide la diferencia), dividido por el valor medio de un voto en España (escaños / votos a candidaturas). 1 = la media.
 *     No cuenta el efecto sobre otros partidos.
 * Escribe sitio/voto_util.js (const VOTO_UTIL = {...}) y voto_util.json. Uso: node voto_util_provincias.js [sorteos]
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;
const SEMILLA = 20261129;
const UMBRALES_DE_SEGURIDAD = [0.90, 0.95, 0.975, 0.99];
const DELTA = 0.01;  // fracción de los votos de la provincia que se suma al partido para medir el valor de su voto
const CUOTA_MINIMA_PARA_VALORAR = 0.003;  // los partidos con menos de un 0,3 % medio en la provincia no se valoran (su valor es 0)

const datos = JSON.parse(fs.readFileSync(path.join(__dirname, "sitio", "datos_modelo.json"), "utf8"));
const modelo = Motor.prepararModelo(datos);
const K = modelo.numeroDePartidos;
const P = modelo.numeroDeProvincias;
const inicio = Date.now();

// Reparto final de cada sorteo (cuotas por provincia y partido), tal como lo ve el reparto de escaños
const cuotasFinales = new Float64Array(SORTEOS * P * K);
const resultado = Motor.simular(modelo, {
  sorteos: SORTEOS, semilla: SEMILLA,
  alRepartir: function (sorteo, final) { cuotasFinales.set(final, sorteo * P * K); },
});
console.log("Simulación: " + SORTEOS + " sorteos en " + ((Date.now() - inicio) / 1000).toFixed(1) + " s");

const escanosMediaPorVoto = datos.provincias.reduce(function (suma, provincia) { return suma + provincia.escanos; }, 0) / modelo.pesoTotal;  // escaños por voto medio en España
const central = Motor.repartoSinRuido(modelo, datos.objetivos).cuotas;

function distribucionDeEscanos(p, k, maximo) {
  const cuentas = new Int32Array(maximo + 1);
  for (let s = 0; s < SORTEOS; s++) cuentas[resultado.provinciales[(s * P + p) * K + k]]++;
  return cuentas;
}

function escanosSeguros(p, escanos) {
  for (let i = 0; i < UMBRALES_DE_SEGURIDAD.length; i++) {
    const umbral = UMBRALES_DE_SEGURIDAD[i];
    const seguros = {};
    let suma = 0;
    for (let k = 0; k < K; k++) {
      const cuentas = distribucionDeEscanos(p, k, escanos);
      let alMenos = SORTEOS, seguro = 0;
      for (let n = 1; n <= escanos; n++) {
        alMenos -= cuentas[n - 1];
        if (alMenos / SORTEOS >= umbral) seguro = n;
      }
      if (seguro > 0) { seguros[modelo.partidos[k]] = seguro; suma += seguro; }
    }
    if (suma <= escanos || i === UMBRALES_DE_SEGURIDAD.length - 1) return { seguros: seguros, suma: Math.min(suma, escanos), umbral: umbral };
  }
}

const provincias = {};
for (let p = 0; p < P; p++) {
  const provincia = modelo.provincias[p];
  const N = provincia.escanos;
  const { seguros, suma, umbral } = escanosSeguros(p, N);
  const enElAire = N - suma;
  // Quién se lleva los escaños en el aire
  const repartoDelAire = {};
  if (enElAire > 0) {
    for (let k = 0; k < K; k++) {
      const partido = modelo.partidos[k];
      const base = seguros[partido] || 0;
      let extra = 0;
      for (let s = 0; s < SORTEOS; s++) {
        const cantidad = resultado.provinciales[(s * P + p) * K + k];
        if (cantidad > base) extra += cantidad - base;
      }
      if (extra > 0) repartoDelAire[partido] = Math.round(10000 * extra / SORTEOS) / 10000;
    }
  }
  // Valor de un voto a cada partido
  const delta = DELTA * modelo.peso[p];
  const base = new Int32Array(SORTEOS * K);
  const escanos = new Int32Array(K);
  for (let s = 0; s < SORTEOS; s++) {
    Motor.escanosDeProvincia(modelo, p, cuotasFinales.subarray((s * P + p) * K, (s * P + p + 1) * K), null, escanos);
    base.set(escanos, s * K);
  }
  const valor = {};
  for (let k = 0; k < K; k++) {
    if (!modelo.presente[p * K + k] || central[p * K + k] < CUOTA_MINIMA_PARA_VALORAR) continue;
    // En una coalición (UPN-PP en Navarra) el voto a la columna suma a la coalición entera: se cuentan los escaños de la columna y de su socio
    const coalicion = modelo.coaliciones.find(function (c) { return c.provincia === p && c.columna === k; });
    const socio = coalicion ? coalicion.socio : -1;
    let diferencia = 0;
    for (let s = 0; s < SORTEOS; s++) {
      Motor.escanosDeProvincia(modelo, p, cuotasFinales.subarray((s * P + p) * K, (s * P + p + 1) * K), { k: k, votos: delta }, escanos);
      diferencia += escanos[k] - base[s * K + k];
      if (socio >= 0) diferencia += escanos[socio] - base[s * K + socio];
    }
    valor[modelo.partidos[k]] = Math.round(100 * (diferencia / SORTEOS / delta) / escanosMediaPorVoto) / 100;
  }
  // Voto central de cada partido en la provincia (tanto por uno sobre votos a candidaturas), solo los de un 1 % o más: sirve para saber cuál es el partido más votado de cada grupo
  const voto = {};
  for (let k = 0; k < K; k++) if (modelo.presente[p * K + k] && central[p * K + k] >= 0.01) voto[modelo.partidos[k]] = Math.round(10000 * central[p * K + k]) / 10000;
  provincias[provincia.nombre] = { comunidad: provincia.comunidad, escanos: N, umbral: umbral, seguros: seguros, aire: enElAire, reparto_aire: repartoDelAire, valor: valor, voto: voto };
  if ((p + 1) % 10 === 0) console.log("  " + (p + 1) + "/" + P + " provincias (" + ((Date.now() - inicio) / 1000).toFixed(0) + " s)");
}

const salida = {
  fecha_promedio: datos.fecha_promedio, sorteos: SORTEOS, semilla: SEMILLA, delta: DELTA,
  votos_por_escano_medio: Math.round(1 / escanosMediaPorVoto), provincias: provincias,
};
const texto = JSON.stringify(salida);
fs.writeFileSync(path.join(__dirname, "sitio", "voto_util.json"), texto, "utf8");
fs.writeFileSync(path.join(__dirname, "sitio", "voto_util.js"), "const VOTO_UTIL = " + texto + ";\n", "utf8");
console.log("voto_util escrito: " + P + " provincias, " + (texto.length / 1024).toFixed(0) + " kB, " + ((Date.now() - inicio) / 1000).toFixed(1) + " s en total");
