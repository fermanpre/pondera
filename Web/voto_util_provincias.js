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
 *   - valor de un voto para el bloque: escaños extra que gana de media el BLOQUE del partido (izquierda o derecha) por ese mismo voto adicional, dividido por lo mismo. Cuenta lo que el voto
 *     quita a partidos del otro bloque y no cuenta lo que mueve dentro del bloque (un escaño que el BNG le quita al PSOE no suma nada al bloque). No hay para PNV, Junts, CC ni Existe.
 *   - probabilidad de que un voto sea decisivo (22/11/2026): en qué parte de las simulaciones basta un cambio de VENTANA_DECISIVA = 0,25 % de los votos de la provincia para que el partido gane un
 *     escaño más (si se le suman esos votos) o pierda uno (si se le restan). A diferencia del valor, que promedia la pendiente sobre todas las simulaciones, mide cuántas veces el partido está justo en la
 *     frontera de un escaño, de modo que un empate virtual por el último escaño (PP y PSOE en Almería) se nota. En una coalición (UPN-PP en Navarra) se cuentan los escaños de la columna y de su socio.
 *   - barrera de facto: lo que cuesta el último escaño de la provincia (el cociente D'Hondt del último escaño, en % de los votos válidos), con el rango en el que caen el 90 % de las simulaciones
 *     (percentiles 5 y 95). Un partido necesita más o menos eso para sacar su primer escaño; si es inferior al 3 %, manda la barrera legal.
 * Escribe sitio/voto_util.js (const VOTO_UTIL = {...}) y voto_util.json. Uso: node voto_util_provincias.js [sorteos]
 */
const fs = require("fs");
const path = require("path");
const Motor = require(path.join(__dirname, "sitio", "motor.js"));

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;
const SEMILLA = 20261129;
const UMBRALES_DE_SEGURIDAD = [0.95, 0.975, 0.99];  // «casi seguro»: desde el 22/11/2026 el 95 % (antes el 90 %)
const UMBRAL_PROBABLE = 0.75;                        // «probable»: entre este umbral y el de «casi seguro»; por debajo, «en el aire»
const VENTANA_DECISIVA = 0.0025;  // fracción de los votos de la provincia que, sumada o restada a un partido, define si su voto es decisivo
const DELTA = 0.01;  // fracción de los votos de la provincia que se suma al partido para medir el valor de su voto
const BLOQUES = {
  izquierda: ["PSOE", "SUMAR", "PODEMOS", "FV", "UPC", "ERC", "BILDU", "BNG", "ADELANTE"],
  derecha: ["PP", "VOX", "SALF", "UPN"],
};
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
// Columnas de cada bloque en el modelo, y bloque de cada columna (-1 si no tiene)
const columnasDeBloque = {};
const bloqueDeColumna = new Array(K).fill(null);
Object.keys(BLOQUES).forEach(function (bloque) {
  columnasDeBloque[bloque] = BLOQUES[bloque].map(function (partido) { return modelo.partidos.indexOf(partido); }).filter(function (k) { return k >= 0; });
  columnasDeBloque[bloque].forEach(function (k) { bloqueDeColumna[k] = bloque; });
});

function socioDeCoalicion(p, k) {
  const coalicion = modelo.coaliciones.find(function (c) { return c.provincia === p && c.columna === k; });
  return coalicion ? coalicion.socio : -1;
}
function esSocioDeCoalicion(p, k) { return modelo.coaliciones.some(function (c) { return c.provincia === p && c.socio === k; }); }

function distribucionDeEscanos(p, k, maximo) {
  const cuentas = new Int32Array(maximo + 1);
  const socio = socioDeCoalicion(p, k);
  for (let s = 0; s < SORTEOS; s++) {
    const cantidad = resultado.provinciales[(s * P + p) * K + k] + (socio >= 0 ? resultado.provinciales[(s * P + p) * K + socio] : 0);
    cuentas[Math.min(cantidad, maximo)]++;
  }
  return cuentas;
}

// Probabilidad de que cada entidad (partido o coalición) saque j o más escaños, para j = 1..N: {partido: [P(>=1), P(>=2), ...]}
function probabilidadesAlMenos(p, escanos) {
  const resultadoPorPartido = {};
  for (let k = 0; k < K; k++) {
    if (esSocioDeCoalicion(p, k)) continue;
    const cuentas = distribucionDeEscanos(p, k, escanos);
    const alMenos = [];
    let acumulado = SORTEOS;
    for (let n = 1; n <= escanos; n++) {
      acumulado -= cuentas[n - 1];
      alMenos.push(acumulado / SORTEOS);
    }
    if (alMenos[0] > 0) resultadoPorPartido[modelo.partidos[k]] = alMenos;
  }
  return resultadoPorPartido;
}

// Escaños casi seguros (el partido saca j o más en al menos el umbral de las simulaciones) y probables (entre UMBRAL_PROBABLE y el umbral); el resto, en el aire
function clasificarEscanos(p, escanos) {
  const alMenos = probabilidadesAlMenos(p, escanos);
  for (let i = 0; i < UMBRALES_DE_SEGURIDAD.length; i++) {
    const umbral = UMBRALES_DE_SEGURIDAD[i];
    const seguros = {};
    const candidatosAProbables = [];   // {partido, probabilidad} de los escaños que son probables, para recortar si sobran
    let suma = 0;
    Object.keys(alMenos).forEach(function (partido) {
      let seguro = 0;
      for (let n = 1; n <= escanos; n++) { if (alMenos[partido][n - 1] >= umbral) seguro = n; }
      if (seguro > 0) { seguros[partido] = seguro; suma += seguro; }
      for (let n = seguro + 1; n <= escanos; n++) {
        const probabilidad = alMenos[partido][n - 1];
        if (probabilidad < UMBRAL_PROBABLE) break;
        candidatosAProbables.push({ partido: partido, probabilidad: probabilidad });
      }
    });
    if (suma <= escanos || i === UMBRALES_DE_SEGURIDAD.length - 1) {
      candidatosAProbables.sort(function (a, b) { return b.probabilidad - a.probabilidad; });
      const probables = {};
      let sumaProbables = 0;
      candidatosAProbables.forEach(function (candidato) {
        if (suma + sumaProbables < escanos) { probables[candidato.partido] = (probables[candidato.partido] || 0) + 1; sumaProbables += 1; }
      });
      return { seguros: seguros, probables: probables, suma: Math.min(suma, escanos), sumaProbables: sumaProbables, umbral: umbral, alMenos: alMenos };
    }
  }
}

const provincias = {};
for (let p = 0; p < P; p++) {
  const provincia = modelo.provincias[p];
  const N = provincia.escanos;
  const { seguros, probables, suma, sumaProbables, umbral, alMenos } = clasificarEscanos(p, N);
  const enElAire = N - suma - sumaProbables;
  // Escalera de probabilidades: para cada partido o coalición, la probabilidad de sacar al menos 1, 2, 3... escaños, mientras sea de un 1 % o más
  // (la web la enseña como tabla en las provincias de hasta 8 escaños y como rejilla de cuadrados en las demás)
  const escalera = Object.keys(alMenos).map(function (partido) {
    const probabilidades = [];
    for (let n = 0; n < alMenos[partido].length; n++) { if (alMenos[partido][n] >= 0.01) probabilidades.push(Math.round(1000 * alMenos[partido][n]) / 1000); }
    // Rango del 95 % de las simulaciones (del percentil 2,5 al 97,5): el mínimo es el mayor número de escaños que se alcanza con un 97,5 % o más, y el máximo, el mayor que se alcanza con un 2,5 % o más
    let minimo = 0, maximo = 0;
    for (let n = 1; n <= alMenos[partido].length; n++) {
      if (alMenos[partido][n - 1] >= 0.975) minimo = n;
      if (alMenos[partido][n - 1] >= 0.025) maximo = n;
    }
    return { partido: partido, p: probabilidades, min: minimo, max: maximo };
  }).filter(function (fila) { return fila.p.length > 0; })
    .sort(function (a, b) { return b.p.reduce(function (x, y) { return x + y; }, 0) - a.p.reduce(function (x, y) { return x + y; }, 0); });
  // Valor de un voto a cada partido
  const delta = DELTA * modelo.peso[p];
  const base = new Int32Array(SORTEOS * K);
  const escanos = new Int32Array(K);
  for (let s = 0; s < SORTEOS; s++) {
    Motor.escanosDeProvincia(modelo, p, cuotasFinales.subarray((s * P + p) * K, (s * P + p + 1) * K), null, escanos);
    base.set(escanos, s * K);
  }
  const valor = {};
  const valorBloque = {};
  for (let k = 0; k < K; k++) {
    if (!modelo.presente[p * K + k] || central[p * K + k] < CUOTA_MINIMA_PARA_VALORAR) continue;
    // En una coalición (UPN-PP en Navarra) el voto a la columna suma a la coalición entera: se cuentan los escaños de la columna y de su socio
    const coalicion = modelo.coaliciones.find(function (c) { return c.provincia === p && c.columna === k; });
    const socio = coalicion ? coalicion.socio : -1;
    let diferencia = 0, diferenciaBloque = 0;
    const bloque = bloqueDeColumna[k];
    for (let s = 0; s < SORTEOS; s++) {
      Motor.escanosDeProvincia(modelo, p, cuotasFinales.subarray((s * P + p) * K, (s * P + p + 1) * K), { k: k, votos: delta }, escanos);
      diferencia += escanos[k] - base[s * K + k];
      if (socio >= 0) diferencia += escanos[socio] - base[s * K + socio];
      if (bloque) {
        for (let j = 0; j < columnasDeBloque[bloque].length; j++) {
          const columna = columnasDeBloque[bloque][j];
          diferenciaBloque += escanos[columna] - base[s * K + columna];
        }
      }
    }
    valor[modelo.partidos[k]] = Math.round(100 * (diferencia / SORTEOS / delta) / escanosMediaPorVoto) / 100;
    if (bloque) valorBloque[modelo.partidos[k]] = Math.round(100 * (diferenciaBloque / SORTEOS / delta) / escanosMediaPorVoto) / 100;
  }
  // Probabilidad de ser decisivo: el partido gana un escaño con +ventana votos o pierde uno con -ventana votos
  const ventana = VENTANA_DECISIVA * modelo.peso[p];
  const decisivo = {};
  for (let k = 0; k < K; k++) {
    if (!modelo.presente[p * K + k] || central[p * K + k] < CUOTA_MINIMA_PARA_VALORAR) continue;
    const coalicion = modelo.coaliciones.find(function (c) { return c.provincia === p && c.columna === k; });
    const socio = coalicion ? coalicion.socio : -1;
    let sorteosDecisivos = 0;
    for (let s = 0; s < SORTEOS; s++) {
      const cuotasDelSorteo = cuotasFinales.subarray((s * P + p) * K, (s * P + p + 1) * K);
      const escanosBase = base[s * K + k] + (socio >= 0 ? base[s * K + socio] : 0);
      Motor.escanosDeProvincia(modelo, p, cuotasDelSorteo, { k: k, votos: ventana }, escanos);
      const conMasVotos = escanos[k] + (socio >= 0 ? escanos[socio] : 0);
      Motor.escanosDeProvincia(modelo, p, cuotasDelSorteo, { k: k, votos: -ventana }, escanos);
      const conMenosVotos = escanos[k] + (socio >= 0 ? escanos[socio] : 0);
      if (conMasVotos > escanosBase || conMenosVotos < escanosBase) sorteosDecisivos++;
    }
    decisivo[modelo.partidos[k]] = Math.round(1000 * sorteosDecisivos / SORTEOS) / 1000;
  }
  // Barrera de facto: cociente del último escaño en cada simulación, en % de los votos válidos
  const sinEscanoDeFacto = {};
  (datos.sin_escano || []).forEach(function (partido) { sinEscanoDeFacto[partido] = true; });
  const minimoLegal = datos.barrera * provincia.votos_validos;
  const costes = new Float64Array(SORTEOS);
  for (let s = 0; s < SORTEOS; s++) {
    const cocientes = [];
    for (let k = 0; k < K; k++) {
      const votosK = sinEscanoDeFacto[modelo.partidos[k]] || !modelo.presente[p * K + k] ? 0 : cuotasFinales[(s * P + p) * K + k] * modelo.peso[p];
      if (votosK <= 0 || votosK < minimoLegal) continue;
      for (let d = 1; d <= N; d++) cocientes.push(votosK / d);
    }
    cocientes.sort(function (a, b) { return b - a; });
    costes[s] = cocientes.length >= N ? cocientes[N - 1] / provincia.votos_validos : 0;
  }
  costes.sort();
  const disputa = (function () {
    const ultimo = {}, primeroFuera = {};
    for (let s = 0; s < SORTEOS; s++) {
      const cocientes = [];
      for (let k = 0; k < K; k++) {
        const votosK = sinEscanoDeFacto[modelo.partidos[k]] || !modelo.presente[p * K + k] ? 0 : cuotasFinales[(s * P + p) * K + k] * modelo.peso[p];
        if (votosK <= 0 || votosK < minimoLegal) continue;
        for (let d = 1; d <= N + 1; d++) cocientes.push({ k: k, votos: votosK / d });
      }
      cocientes.sort(function (a, b) { return b.votos - a.votos; });
      if (cocientes.length > N) {
        const partidoUltimo = modelo.partidos[cocientes[N - 1].k], partidoFuera = modelo.partidos[cocientes[N].k];
        ultimo[partidoUltimo] = (ultimo[partidoUltimo] || 0) + 1;
        primeroFuera[partidoFuera] = (primeroFuera[partidoFuera] || 0) + 1;
      }
    }
    const aProbabilidades = function (cuentas) {
      const salida = {};
      Object.keys(cuentas).forEach(function (partido) { if (cuentas[partido] / SORTEOS >= 0.005) salida[partido] = Math.round(1000 * cuentas[partido] / SORTEOS) / 1000; });
      return salida;
    };
    return { ultimo: aProbabilidades(ultimo), fuera: aProbabilidades(primeroFuera) };
  })();
  const percentil = function (q) { return costes[Math.min(SORTEOS - 1, Math.floor(q * SORTEOS))]; };
  const barreraDeFacto = { p05: Math.round(10000 * percentil(0.05)) / 10000, mediana: Math.round(10000 * percentil(0.5)) / 10000, p95: Math.round(10000 * percentil(0.95)) / 10000 };
  // Voto central de cada partido en la provincia (tanto por uno sobre votos a candidaturas), solo los de un 1 % o más: sirve para saber cuál es el partido más votado de cada grupo
  const voto = {};
  for (let k = 0; k < K; k++) if (modelo.presente[p * K + k] && central[p * K + k] >= 0.01) voto[modelo.partidos[k]] = Math.round(10000 * central[p * K + k]) / 10000;
  // Cocientes D'Hondt del reparto central: los N+4 mayores (partido, divisor), en % de los votos a candidaturas y en votos; el último que entra y el primero que se queda fuera marcan el corte
  const sinEscano = {};
  (datos.sin_escano || []).forEach(function (partido) { sinEscano[partido] = true; });
  const minimo = datos.barrera * provincia.votos_validos;
  const cocientes = [];
  for (let k = 0; k < K; k++) {
    const votosK = central[p * K + k] * modelo.peso[p];
    if (sinEscano[modelo.partidos[k]] || !modelo.presente[p * K + k] || votosK <= 0 || votosK < minimo) continue;
    for (let d = 1; d <= N + 1; d++) cocientes.push({ partido: modelo.partidos[k], divisor: d, votos: votosK / d, pct: 100 * central[p * K + k] / d });
  }
  cocientes.sort(function (x, y) { return y.votos - x.votos; });
  const lista = cocientes.slice(0, N + 4).map(function (c, i) { return { partido: c.partido, divisor: c.divisor, votos: Math.round(c.votos), pct: Math.round(100 * c.pct) / 100, entra: i < N }; });
  // Márgenes exactos: en el último cociente de cada partido que entra, cuántos votos puede perder sin ceder un escaño; en el primero que queda fuera, cuántos votos le faltan para ganar uno más.
  // Se busca por bisección sobre el reparto real (escanosDeProvincia), así que cuenta que al cambiar los votos del partido cambian TODOS sus cocientes (no solo el que se mira).
  const cuotasCentrales = central.subarray(p * K, (p + 1) * K);
  const escanosAuxiliares = new Int32Array(K);
  const escanosDelPartido = function (k, variacion) {
    Motor.escanosDeProvincia(modelo, p, cuotasCentrales, { k: k, votos: variacion }, escanosAuxiliares);
    const coalicionDeK = modelo.coaliciones.find(function (c) { return c.provincia === p && c.columna === k; });
    return escanosAuxiliares[k] + (coalicionDeK ? escanosAuxiliares[coalicionDeK.socio] : 0);
  };
  const ultimaFilaQueEntra = {}, primeraFilaQueNo = {};
  lista.forEach(function (fila, i) { if (fila.entra) ultimaFilaQueEntra[fila.partido] = i; else if (primeraFilaQueNo[fila.partido] === undefined) primeraFilaQueNo[fila.partido] = i; });
  Object.keys(ultimaFilaQueEntra).forEach(function (partido) {
    const k = modelo.partidos.indexOf(partido);
    const votosDelPartido = central[p * K + k] * modelo.peso[p];
    const base = escanosDelPartido(k, 0);
    let bajo = 0, alto = votosDelPartido;       // bajo: seguro que no cambia; alto: pierde todo
    if (escanosDelPartido(k, -alto) >= base) return;  // aunque pierda todos sus votos conserva el escaño (no pasa; por seguridad)
    for (let i = 0; i < 40; i++) { const medio = (bajo + alto) / 2; if (escanosDelPartido(k, -medio) >= base) bajo = medio; else alto = medio; }
    lista[ultimaFilaQueEntra[partido]].puede_perder = Math.floor(bajo);
  });
  Object.keys(primeraFilaQueNo).forEach(function (partido) {
    const k = modelo.partidos.indexOf(partido);
    const base = escanosDelPartido(k, 0);
    let bajo = 0, alto = 3 * modelo.peso[p];
    if (escanosDelPartido(k, alto) <= base) return;   // ni con muchísimos votos más gana otro escaño
    for (let i = 0; i < 40; i++) { const medio = (bajo + alto) / 2; if (escanosDelPartido(k, medio) > base) alto = medio; else bajo = medio; }
    lista[primeraFilaQueNo[partido]].faltan = Math.ceil(alto);
  });
  const corte = cocientes.length > N ? { ultimo: Math.round(cocientes[N - 1].votos), primero_fuera: Math.round(cocientes[N].votos) } : null;
  provincias[provincia.nombre] = { barrera_de_facto: barreraDeFacto, cocientes: lista, corte: corte, comunidad: provincia.comunidad, escanos: N, umbral: umbral, umbral_probable: UMBRAL_PROBABLE, seguros: seguros, probables: probables, aire: enElAire, escalera: escalera, disputa: disputa, valor: valor, valor_bloque: valorBloque, decisivo: decisivo, ventana_decisiva: Math.round(ventana), voto: voto };
  if ((p + 1) % 10 === 0) console.log("  " + (p + 1) + "/" + P + " provincias (" + ((Date.now() - inicio) / 1000).toFixed(0) + " s)");
}

const salida = {
  fecha_promedio: datos.fecha_promedio, sorteos: SORTEOS, semilla: SEMILLA, delta: DELTA, ventana_decisiva: VENTANA_DECISIVA,
  votos_por_escano_medio: Math.round(1 / escanosMediaPorVoto), barrera_legal: datos.barrera, bloques: BLOQUES, provincias: provincias,
};
const texto = JSON.stringify(salida);
fs.writeFileSync(path.join(__dirname, "sitio", "voto_util.json"), texto, "utf8");
fs.writeFileSync(path.join(__dirname, "sitio", "voto_util.js"), "const VOTO_UTIL = " + texto + ";\n", "utf8");
console.log("voto_util escrito: " + P + " provincias, " + (texto.length / 1024).toFixed(0) + " kB, " + ((Date.now() - inicio) / 1000).toFixed(1) + " s en total");
