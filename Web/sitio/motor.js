/*
 * Motor electoral en JavaScript: espejo de motor_reparto.py y montecarlo.py (Python).
 *
 * Funciona en el navegador (global MotorElectoral) y en Node (module.exports).
 * Diferencia deliberada con Python: el desplazamiento proporcional se calcula con su fórmula cerrada
 * (log(objetivo × peso total / Σ cuota × peso)) en lugar de la bisección de 60 pasos; da el mismo resultado
 * (la bisección solo lo aproximaba) y es unas 60 veces más rápido.
 *
 * Disposición de los datos: las cuotas de un reparto viven en un Float64Array de provincias × partidos
 * (índice provincia * numeroDePartidos + partido); las cuotas de los pares no presentes valen 0 y se marcan en «presente».
 */
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.MotorElectoral = fabrica();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ITERACIONES_MAXIMAS = 400;
  const TOLERANCIA_DE_COLUMNA = 1e-9;

  /* ---------- Números aleatorios con semilla (mulberry32) y gaussiana de Box-Muller ---------- */

  function crearGenerador(semilla) {
    let estado = semilla >>> 0;
    let reserva = null;
    function uniforme() {
      estado = (estado + 0x6d2b79f5) >>> 0;
      let t = estado;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function gauss(media, sigma) {
      if (reserva !== null) {
        const valor = reserva;
        reserva = null;
        return media + sigma * valor;
      }
      let u = 0;
      while (u === 0) u = uniforme();
      const v = uniforme();
      const radio = Math.sqrt(-2.0 * Math.log(u));
      reserva = radio * Math.sin(2.0 * Math.PI * v);
      return media + sigma * radio * Math.cos(2.0 * Math.PI * v);
    }
    return { uniforme: uniforme, gauss: gauss };
  }

  /* ---------- Preparación del problema ---------- */

  function prepararModelo(datos) {
    const partidos = datos.partidos;
    const numeroDePartidos = partidos.length;
    const indiceDePartido = {};
    partidos.forEach(function (partido, indice) { indiceDePartido[partido] = indice; });
    const provincias = datos.provincias;
    const numeroDeProvincias = provincias.length;
    const base = new Float64Array(numeroDeProvincias * numeroDePartidos);
    const presente = new Uint8Array(numeroDeProvincias * numeroDePartidos);
    const peso = new Float64Array(numeroDeProvincias);
    let pesoTotal = 0;
    provincias.forEach(function (provincia, p) {
      peso[p] = provincia.peso;
      pesoTotal += provincia.peso;
      partidos.forEach(function (partido, k) {
        const cuota = provincia.cuotas[partido];
        if (cuota !== undefined && cuota > 0) {
          base[p * numeroDePartidos + k] = cuota;
          presente[p * numeroDePartidos + k] = 1;
        }
      });
    });
    // Coaliciones con reparto interno de escaños por orden de lista: índices de provincia, columna y socio
    const coaliciones = (datos.coaliciones || []).map(function (coalicion) {
      const indice = provincias.findIndex(function (provincia) { return provincia.nombre === coalicion.provincia; });
      return { provincia: indice, columna: indiceDePartido[coalicion.columna], socio: indiceDePartido[coalicion.socio],
               orden: coalicion.orden.map(function (nombre) { return indiceDePartido[nombre]; }), nombre: coalicion.nombre };
    });
    return {
      coaliciones: coaliciones,
      datos: datos, partidos: partidos, indiceDePartido: indiceDePartido, numeroDePartidos: numeroDePartidos,
      provincias: provincias, numeroDeProvincias: numeroDeProvincias, base: base, presente: presente, peso: peso, pesoTotal: pesoTotal,
    };
  }

  function vectorDeObjetivos(modelo, objetivos) {
    const vector = new Float64Array(modelo.numeroDePartidos);
    modelo.partidos.forEach(function (partido, k) { vector[k] = objetivos[partido] || 0; });
    return vector;
  }

  /* ---------- Reparto de votos: ajuste iterativo proporcional (raking) ---------- */

  function normalizarFilas(modelo, reparto) {
    const K = modelo.numeroDePartidos;
    for (let p = 0; p < modelo.numeroDeProvincias; p++) {
      let suma = 0;
      for (let k = 0; k < K; k++) suma += reparto[p * K + k];
      if (suma > 0) {
        for (let k = 0; k < K; k++) reparto[p * K + k] /= suma;
      }
    }
  }

  function errorMaximoDeColumna(modelo, reparto, objetivo) {
    const K = modelo.numeroDePartidos;
    let errorMaximo = 0;
    for (let k = 0; k < K; k++) {
      let votos = 0;
      for (let p = 0; p < modelo.numeroDeProvincias; p++) votos += reparto[p * K + k] * modelo.peso[p];
      errorMaximo = Math.max(errorMaximo, Math.abs(votos / modelo.pesoTotal - objetivo[k]));
    }
    return errorMaximo;
  }

  /* partida: cuotas de partida (Float64Array); objetivo: cuota nacional de cada partido. Devuelve un reparto nuevo. */
  function repartirProporcional(modelo, partida, objetivo) {
    const K = modelo.numeroDePartidos;
    const P = modelo.numeroDeProvincias;
    const reparto = Float64Array.from(partida);
    normalizarFilas(modelo, reparto);
    for (let iteracion = 0; iteracion < ITERACIONES_MAXIMAS; iteracion++) {
      for (let k = 0; k < K; k++) {
        let votos = 0;
        for (let p = 0; p < P; p++) votos += reparto[p * K + k] * modelo.peso[p];
        if (votos <= 0 || objetivo[k] <= 0) continue;
        const factor = (objetivo[k] * modelo.pesoTotal) / votos;
        for (let p = 0; p < P; p++) reparto[p * K + k] *= factor;
      }
      normalizarFilas(modelo, reparto);
      if (errorMaximoDeColumna(modelo, reparto, objetivo) < TOLERANCIA_DE_COLUMNA) break;
    }
    return reparto;
  }

  /* ---------- D'Hondt con barrera ---------- */

  /* votos: Float64Array por partido (0 = no concurre o sin escaño). Rellena escanos (Int32Array por partido). */
  function repartirDhondt(votos, numeroDeEscanos, votosMinimos, escanos) {
    const K = votos.length;
    for (let k = 0; k < K; k++) escanos[k] = 0;
    for (let n = 0; n < numeroDeEscanos; n++) {
      let mejor = -1;
      let mejorCociente = -1;
      for (let k = 0; k < K; k++) {
        if (votos[k] <= 0 || votos[k] < votosMinimos) continue;
        const cociente = votos[k] / (escanos[k] + 1);
        if (cociente > mejorCociente) {
          mejorCociente = cociente;
          mejor = k;
        }
      }
      if (mejor >= 0) escanos[mejor] += 1;
    }
  }

  /* Escaños de un reparto de cuotas: Int32Array provincias × partidos. */
  function escanosDeReparto(modelo, reparto) {
    const K = modelo.numeroDePartidos;
    const datos = modelo.datos;
    const sinEscano = {};
    (datos.sin_escano || []).forEach(function (partido) { sinEscano[partido] = true; });
    const resultado = new Int32Array(modelo.numeroDeProvincias * K);
    const votos = new Float64Array(K);
    const escanos = new Int32Array(K);
    for (let p = 0; p < modelo.numeroDeProvincias; p++) {
      for (let k = 0; k < K; k++) {
        const excluido = sinEscano[modelo.partidos[k]] || !modelo.presente[p * K + k];
        votos[k] = excluido ? 0 : reparto[p * K + k] * modelo.peso[p];
      }
      repartirDhondt(votos, modelo.provincias[p].escanos, datos.barrera * modelo.provincias[p].votos_validos, escanos);
      modelo.coaliciones.forEach(function (coalicion) {
        if (coalicion.provincia !== p || escanos[coalicion.columna] === 0) return;
        // Los n escaños de la coalición ocupan los n primeros puestos de su lista: se reparten entre la columna y su socio
        const puestos = coalicion.orden.slice(0, escanos[coalicion.columna]);
        escanos[coalicion.columna] = puestos.filter(function (k) { return k === coalicion.columna; }).length;
        escanos[coalicion.socio] += puestos.filter(function (k) { return k === coalicion.socio; }).length;
      });
      for (let k = 0; k < K; k++) resultado[p * K + k] = escanos[k];
    }
    return resultado;
  }

  /* Reparto sin ruido para unos objetivos dados (lo que usa el simulador de la web). */
  function repartoSinRuido(modelo, objetivos) {
    const reparto = repartirProporcional(modelo, modelo.base, vectorDeObjetivos(modelo, objetivos));
    return { cuotas: reparto, escanos: escanosDeReparto(modelo, reparto) };
  }

  /* ---------- Monte Carlo ---------- */

  function sigmaPorTramos(tramos, cuota) {
    for (let i = 0; i < tramos.length; i++) {
      if (cuota >= tramos[i][0]) return tramos[i][1];
    }
    return tramos[tramos.length - 1][1];
  }

  /* Perturba los objetivos: error común por bloque (puntos de voto) + error propio lognormal por partido; después renormaliza. */
  function perturbarObjetivos(modelo, objetivo, generador, palanca) {
    const datos = modelo.datos;
    const K = modelo.numeroDePartidos;
    const cuotaDeBloque = {};
    for (let k = 0; k < K; k++) {
      const bloque = datos.bloques[modelo.partidos[k]];
      if (bloque) cuotaDeBloque[bloque] = (cuotaDeBloque[bloque] || 0) + objetivo[k];
    }
    const errorDeBloque = {};
    Object.keys(datos.sigma_bloque).forEach(function (bloque) {
      errorDeBloque[bloque] = generador.gauss(0, datos.sigma_bloque[bloque]) / 100;
    });
    const nuevos = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      const partido = modelo.partidos[k];
      const bloque = datos.bloques[partido];
      let factor = 1;
      if (bloque && cuotaDeBloque[bloque] > 0) {
        factor = Math.max(0.05, (cuotaDeBloque[bloque] + (errorDeBloque[bloque] || 0)) / cuotaDeBloque[bloque]);
      }
      const propio = Math.exp(generador.gauss(0, datos.sigma_partido[partido] || 0));
      nuevos[k] = objetivo[k] * factor * propio;
    }
    if (palanca) {
      const indicePsoe = modelo.indiceDePartido.PSOE;
      let sumaPesos = 0;
      for (let k = 0; k < K; k++) {
        if (k !== indicePsoe) sumaPesos += (datos.pesos_palanca[modelo.partidos[k]] || 0) * nuevos[k];
      }
      for (let k = 0; k < K; k++) {
        if (k !== indicePsoe && sumaPesos > 0) {
          nuevos[k] -= (palanca / 100) * (datos.pesos_palanca[modelo.partidos[k]] || 0) * nuevos[k] / sumaPesos;
          nuevos[k] = Math.max(nuevos[k], 0);
        }
      }
      nuevos[indicePsoe] += palanca / 100;
    }
    let total = 0;
    for (let k = 0; k < K; k++) total += nuevos[k];
    for (let k = 0; k < K; k++) nuevos[k] /= total;
    return nuevos;
  }

  function ruidoProvincial(modelo, reparto, generador) {
    const datos = modelo.datos;
    const K = modelo.numeroDePartidos;
    const ruidoso = new Float64Array(reparto.length);
    for (let p = 0; p < modelo.numeroDeProvincias; p++) {
      for (let k = 0; k < K; k++) {
        const indice = p * K + k;
        if (!modelo.presente[indice]) continue;
        const partido = modelo.partidos[k];
        const clase = datos.clase_de_partido[partido];
        const sigma = clase ? sigmaPorTramos(datos.tramos_provinciales[clase], reparto[indice]) : 0;
        ruidoso[indice] = reparto[indice] * Math.exp(generador.gauss(0, sigma));
      }
    }
    return ruidoso;
  }

  /*
   * Simula `sorteos` elecciones. opciones: {sorteos, semilla, objetivos (opcional, por defecto los del modelo),
   * palancaMedia, palancaSigma, alProgreso(hechos, total)}.
   * Devuelve {nacionales: Int16Array sorteos × partidos, provinciales: Uint8Array sorteos × provincias × partidos}.
   */
  function simular(modelo, opciones) {
    const K = modelo.numeroDePartidos;
    const P = modelo.numeroDeProvincias;
    const sorteos = opciones.sorteos;
    const generador = crearGenerador(opciones.semilla === undefined ? 20261129 : opciones.semilla);
    const objetivoBase = vectorDeObjetivos(modelo, opciones.objetivos || modelo.datos.objetivos);
    const palancaMedia = opciones.palancaMedia || 0;
    const palancaSigma = opciones.palancaSigma || 0;
    const nacionales = new Int16Array(sorteos * K);
    const provinciales = new Uint8Array(sorteos * P * K);
    for (let sorteo = 0; sorteo < sorteos; sorteo++) {
      const palanca = (palancaMedia || palancaSigma) ? generador.gauss(palancaMedia, palancaSigma) : 0;
      const objetivo = perturbarObjetivos(modelo, objetivoBase, generador, palanca);
      const primero = repartirProporcional(modelo, modelo.base, objetivo);
      const ruidoso = ruidoProvincial(modelo, primero, generador);
      const final = repartirProporcional(modelo, ruidoso, objetivo);
      const escanos = escanosDeReparto(modelo, final);
      for (let p = 0; p < P; p++) {
        for (let k = 0; k < K; k++) {
          const cantidad = escanos[p * K + k];
          if (cantidad) {
            nacionales[sorteo * K + k] += cantidad;
            provinciales[(sorteo * P + p) * K + k] = cantidad;
          }
        }
      }
      if (opciones.alProgreso && (sorteo + 1) % 25 === 0) opciones.alProgreso(sorteo + 1, sorteos);
    }
    if (opciones.alProgreso) opciones.alProgreso(sorteos, sorteos);
    return { nacionales: nacionales, provinciales: provinciales, sorteos: sorteos };
  }

  /* ---------- Resúmenes ---------- */

  function percentil(ordenados, fraccion) {
    const posicion = fraccion * (ordenados.length - 1);
    const inferior = Math.floor(posicion);
    const superior = Math.min(inferior + 1, ordenados.length - 1);
    return ordenados[inferior] + (ordenados[superior] - ordenados[inferior]) * (posicion - inferior);
  }

  function resumirNacional(modelo, resultado) {
    const K = modelo.numeroDePartidos;
    const resumen = {};
    modelo.partidos.forEach(function (partido, k) {
      const valores = [];
      for (let s = 0; s < resultado.sorteos; s++) valores.push(resultado.nacionales[s * K + k]);
      valores.sort(function (a, b) { return a - b; });
      const media = valores.reduce(function (a, b) { return a + b; }, 0) / valores.length;
      resumen[partido] = {
        media: media, mediana: percentil(valores, 0.5), p10: percentil(valores, 0.1), p90: percentil(valores, 0.9),
        p025: percentil(valores, 0.025), p975: percentil(valores, 0.975),
        pAlMenos1: valores.filter(function (v) { return v >= 1; }).length / valores.length,
      };
    });
    return resumen;
  }

  /* Probabilidad de que la suma de escaños de un grupo de partidos alcance el umbral (por defecto, mayoría absoluta). */
  function probabilidadDeSuma(modelo, resultado, grupo, umbral) {
    const K = modelo.numeroDePartidos;
    const indices = grupo.filter(function (p) { return p in modelo.indiceDePartido; }).map(function (p) { return modelo.indiceDePartido[p]; });
    let cuenta = 0;
    for (let s = 0; s < resultado.sorteos; s++) {
      let suma = 0;
      for (let i = 0; i < indices.length; i++) suma += resultado.nacionales[s * K + indices[i]];
      if (suma >= (umbral || 176)) cuenta++;
    }
    return cuenta / resultado.sorteos;
  }

  return {
    crearGenerador: crearGenerador, prepararModelo: prepararModelo, vectorDeObjetivos: vectorDeObjetivos,
    repartirProporcional: repartirProporcional, escanosDeReparto: escanosDeReparto, repartoSinRuido: repartoSinRuido,
    perturbarObjetivos: perturbarObjetivos, simular: simular, resumirNacional: resumirNacional, probabilidadDeSuma: probabilidadDeSuma,
    percentil: percentil,
  };
});
