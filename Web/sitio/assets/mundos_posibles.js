"use strict";
/*
 * Mundos posibles: diez sorteos de la simulación que enseñan cómo podría quedar el Congreso. (22/11/2026)
 * Se ordenan las 10.000 simulaciones por la ventaja de la derecha ampliada (PP, UPN, Vox, CC y SALF) sobre el bloque de investidura de 2023 (en escaños) y se eligen diez
 * percentiles repartidos a pasos iguales entre el 1 y el 99: como cada paso reúne la misma probabilidad, hay más mundos cerca del centro de la distribución, en proporción a lo
 * probables que son. En cada percentil se coge la banda de simulaciones que lo rodea (±0,5 puntos de percentil) y, dentro de ella, la más parecida a la mediana de cada partido en esa banda.
 * Lo llama pintarTodoConElResultado() de app_prevision.js; usa `modelo`, `ultimoResultado` y los datos de comun.js.
 */
const MUNDOS_QUE_SE_MUESTRAN = 10;
const PERCENTIL_MINIMO_DE_LOS_MUNDOS = 1;
const PERCENTIL_MAXIMO_DE_LOS_MUNDOS = 99;
const SEMIANCHURA_DE_LA_BANDA = 0.005;   // fracción de simulaciones a cada lado del percentil
const PARTIDOS_DE_LA_DERECHA = ["PP", "UPN", "VOX", "CC", "SALF"];
const PARTIDOS_DEL_BLOQUE_DE_INVESTIDURA = ["PSOE", "SUMAR", "FV", "UPC", "PODEMOS", "PNV", "ERC", "BILDU", "BNG", "JUNTS", "ADELANTE"];

function elegirLosMundosPosibles(simulacion, sorteos) {
  const nacionales = simulacion.nacionales;
  const numeroDePartidos = modelo.numeroDePartidos;
  const columnasDe = (partidos) => partidos.map((partido) => modelo.partidos.indexOf(partido)).filter((columna) => columna >= 0);
  const columnasDeLaDerecha = columnasDe(PARTIDOS_DE_LA_DERECHA);
  const columnasDeLaInvestidura = columnasDe(PARTIDOS_DEL_BLOQUE_DE_INVESTIDURA);
  const sumaDeColumnas = (sorteo, columnas) => { let suma = 0; columnas.forEach((columna) => { suma += nacionales[sorteo * numeroDePartidos + columna]; }); return suma; };

  const ventajas = new Int16Array(sorteos);
  for (let sorteo = 0; sorteo < sorteos; sorteo++) { ventajas[sorteo] = sumaDeColumnas(sorteo, columnasDeLaDerecha) - sumaDeColumnas(sorteo, columnasDeLaInvestidura); }
  const ordenados = Array.from({ length: sorteos }, (_, sorteo) => sorteo).sort((a, b) => ventajas[a] - ventajas[b] || a - b);

  const escalas = medianasYEscalasDeLosSorteos(simulacion, sorteos).escalas;
  const mediana = (valores) => { const copia = Int16Array.from(valores).sort(); return copia[Math.floor(copia.length / 2)]; };

  const mundos = [];
  for (let i = 0; i < MUNDOS_QUE_SE_MUESTRAN; i++) {
    const percentil = PERCENTIL_MINIMO_DE_LOS_MUNDOS + (PERCENTIL_MAXIMO_DE_LOS_MUNDOS - PERCENTIL_MINIMO_DE_LOS_MUNDOS) * i / (MUNDOS_QUE_SE_MUESTRAN - 1);
    const centro = Math.round(sorteos * percentil / 100);
    const desde = Math.max(0, centro - Math.round(sorteos * SEMIANCHURA_DE_LA_BANDA));
    const hasta = Math.min(sorteos - 1, centro + Math.round(sorteos * SEMIANCHURA_DE_LA_BANDA));
    const banda = ordenados.slice(desde, hasta + 1);
    const medianasDeLaBanda = [];
    for (let k = 0; k < numeroDePartidos; k++) { medianasDeLaBanda.push(mediana(banda.map((sorteo) => nacionales[sorteo * numeroDePartidos + k]))); }
    let elegido = banda[0];
    let mejorDistancia = Infinity;
    banda.forEach((sorteo) => {
      let distancia = 0;
      for (let k = 0; k < numeroDePartidos; k++) {
        const diferencia = (nacionales[sorteo * numeroDePartidos + k] - medianasDeLaBanda[k]) / escalas[k];
        distancia += diferencia * diferencia;
      }
      if (distancia < mejorDistancia) { mejorDistancia = distancia; elegido = sorteo; }
    });
    const escanos = {};
    modelo.partidos.forEach((partido, k) => { escanos[partido] = nacionales[elegido * numeroDePartidos + k]; });
    mundos.push({ percentil: percentil, sorteo: elegido, escanos: escanos, derecha: sumaDeColumnas(elegido, columnasDeLaDerecha), investidura: sumaDeColumnas(elegido, columnasDeLaInvestidura) });
  }
  return mundos;
}

function pintarMundosPosibles() {
  const contenedor = document.getElementById("mundos-posibles");
  if (!contenedor || typeof ultimoResultado === "undefined" || !ultimoResultado) { return; }
  const mundos = elegirLosMundosPosibles(ultimoResultado.simulacion, ultimoResultado.sorteos);
  const escritura = (numero) => String(Math.round(numero * 10) / 10).replace(".", ",");
  const veredicto = (mundo) => {
    if (mundo.derecha >= 176) { return "La derecha ampliada tiene mayoría absoluta"; }
    if (mundo.investidura >= 176) { return "El bloque de investidura de 2023 tiene mayoría absoluta"; }
    return "Ningún bloque llega a 176";
  };
  contenedor.innerHTML = mundos.map((mundo, i) =>
    '<figure class="mundo"><figcaption><span class="mundo-numero">Mundo ' + (i + 1) + '</span><span class="mundo-percentil">percentil ' + escritura(mundo.percentil) + '</span></figcaption>' +
    '<p class="mundo-veredicto">' + veredicto(mundo) + '</p>' +
    '<p class="nota">Derecha ampliada ' + mundo.derecha + ' · bloque de investidura ' + mundo.investidura + '</p>' +
    '<div class="hemiciclo" id="mundo-' + i + '"></div></figure>').join("");
  mundos.forEach((mundo, i) => pintarHemiciclo(document.getElementById("mundo-" + i), mundo.escanos));
}
