"use strict";
/*
 * Mundos raros: sucesos que ocurren en una de cada cien o de cada mil simulaciones, cada uno con un mundo en el que pasa. (22/11/2026)
 *
 * Sucesos de la forma «el partido X saca n o más escaños» o «n o menos» (nacionales), con una probabilidad entre el 0,1 % y el 1 % en las 10.000 simulaciones, más un suceso propio: la coalición
 * UPN-PP con cuatro diputados en Navarra (en la tabla nacional, «UPN con dos»). Para cada partido y sentido se toma el umbral cuya probabilidad se acerca más al 0,5 % (en escala logarítmica);
 * de cada partido entra como mucho un suceso, y de los candidatos se eligen diez repartiéndolos por tipos (aparece, se queda sin escaños o casi, sube mucho, partido grande en un extremo).
 * El mundo de cada suceso es, de las simulaciones en las que ocurre, la más parecida a la mediana de cada partido en ese grupo: lo que suele pasar a la vez que el suceso.
 * Escribe sitio/mundos_raros.js (const MUNDOS_RAROS = {...}) y mundos_raros.json. Uso: node mundos_raros.js [sorteos]
 */
const comun = require("./mundos_comun.js");

const SORTEOS = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;
const PROBABILIDAD_MINIMA = 0.001;
const PROBABILIDAD_MAXIMA = 0.01;
const PROBABILIDAD_OBJETIVO = 0.005;
const SUCESOS_QUE_SE_MUESTRAN = 10;
const PARTIDOS_GRANDES = ["PP", "PSOE", "VOX"];
const PARTIDOS_QUE_NO_ENTRAN = ["OTROS"];
// Tipos en el orden en que se reparten los diez sucesos (una vuelta completa cada cuatro)
const ORDEN_DE_TIPOS = ["aparece", "desaparece", "grande", "sube"];

const simulacion = comun.prepararSimulacion(SORTEOS);
const modelo = simulacion.modelo;
const numeroDePartidos = modelo.numeroDePartidos;
const numeroDeProvincias = modelo.numeroDeProvincias;

function escanosDelPartido(sorteo, k) { return simulacion.nacionales[sorteo * numeroDePartidos + k]; }

// Mejor umbral de un partido en un sentido: la probabilidad, entre el mínimo y el máximo, más cercana al objetivo (en logaritmos)
function mejorUmbral(k, sentido) {
  const cuentas = {};
  for (let sorteo = 0; sorteo < SORTEOS; sorteo++) {
    const escanos = escanosDelPartido(sorteo, k);
    cuentas[escanos] = (cuentas[escanos] || 0) + 1;
  }
  const valores = Object.keys(cuentas).map(Number).sort(function (a, b) { return a - b; });
  const ordenados = sentido === "mas" ? valores.slice().reverse() : valores;
  const mediana = (function () { let acumulado = 0; for (const valor of valores) { acumulado += cuentas[valor]; if (acumulado >= SORTEOS / 2) { return valor; } } return 0; })();
  let acumulado = 0;
  let mejor = null;
  ordenados.forEach(function (valor) {
    acumulado += cuentas[valor];
    const probabilidad = acumulado / SORTEOS;
    if (probabilidad < PROBABILIDAD_MINIMA || probabilidad > PROBABILIDAD_MAXIMA) { return; }
    const distancia = Math.abs(Math.log(probabilidad / PROBABILIDAD_OBJETIVO));
    if (!mejor || distancia < mejor.distancia) { mejor = { umbral: valor, probabilidad: probabilidad, distancia: distancia, mediana: mediana }; }
  });
  return mejor;
}

const candidatos = [];
modelo.partidos.forEach(function (partido, k) {
  if (PARTIDOS_QUE_NO_ENTRAN.indexOf(partido) >= 0) { return; }
  ["mas", "menos"].forEach(function (sentido) {
    const umbral = mejorUmbral(k, sentido);
    if (!umbral) { return; }
    let tipo;
    if (PARTIDOS_GRANDES.indexOf(partido) >= 0) { tipo = "grande"; }
    else if (sentido === "mas") { tipo = umbral.mediana <= 1 ? "aparece" : "sube"; }
    else { tipo = umbral.umbral <= 2 ? "desaparece" : "baja"; }
    const cumple = function (sorteo) { return sentido === "mas" ? escanosDelPartido(sorteo, k) >= umbral.umbral : escanosDelPartido(sorteo, k) <= umbral.umbral; };
    candidatos.push({ tipo: tipo, partido: partido, sentido: sentido, umbral: umbral.umbral, probabilidad: umbral.probabilidad, distancia: umbral.distancia, cumple: cumple });
  });
});

// Suceso propio: la coalición UPN-PP con cuatro diputados en Navarra (la fila «UPN-PP» de la página de Navarra: sus escaños son los de UPN más los de PP en esa provincia)
const coalicionDeNavarra = modelo.coaliciones.find(function (coalicion) { return modelo.provincias[coalicion.provincia].nombre === "Navarra"; });
if (coalicionDeNavarra) {
  const diputadosDeLaCoalicion = function (sorteo) {
    const base = (sorteo * numeroDeProvincias + coalicionDeNavarra.provincia) * numeroDePartidos;
    return simulacion.provinciales[base + coalicionDeNavarra.columna] + simulacion.provinciales[base + coalicionDeNavarra.socio];
  };
  const cumple = function (sorteo) { return diputadosDeLaCoalicion(sorteo) >= 4; };
  let cuenta = 0;
  for (let sorteo = 0; sorteo < SORTEOS; sorteo++) { if (cumple(sorteo)) { cuenta += 1; } }
  const probabilidad = cuenta / SORTEOS;
  if (probabilidad >= PROBABILIDAD_MINIMA && probabilidad <= PROBABILIDAD_MAXIMA) {
    candidatos.push({ tipo: "aparece", partido: "UPN", sentido: "coalicion", umbral: 4, probabilidad: probabilidad, distancia: -1, cumple: cumple,
                      titulo: "La coalición UPN-PP saca cuatro diputados en Navarra", destacado: "UPN" });
  }
}

// Suceso propio: Compromís-Front Valencià con dos diputados en Castellón, de modo que el segundo puesto de su lista, de Esquerra Republicana del País Valencià (ERPV), entra en el Congreso (22/11/2026).
// Es de las pocas simulaciones del conjunto: basta con que ocurra al menos una vez.
const columnaDeFV = modelo.partidos.indexOf("FV");
const provinciaDeCastellon = modelo.provincias.findIndex(function (provincia) { return provincia.nombre === "Castellón/Castelló"; });
if (columnaDeFV >= 0 && provinciaDeCastellon >= 0) {
  const cumpleErpv = function (sorteo) { return simulacion.provinciales[(sorteo * numeroDeProvincias + provinciaDeCastellon) * numeroDePartidos + columnaDeFV] >= 2; };
  let cuentaErpv = 0;
  for (let sorteo = 0; sorteo < SORTEOS; sorteo++) { if (cumpleErpv(sorteo)) { cuentaErpv += 1; } }
  if (cuentaErpv >= 1) {
    candidatos.push({ tipo: "aparece", partido: "ERPV", sentido: "coalicion", umbral: 2, probabilidad: cuentaErpv / SORTEOS, distancia: -1, cumple: cumpleErpv, destacado: "FV",
                      titulo: "Compromís-Front Valencià saca dos diputados en Castellón y ERPV logra un escaño",
                      nota: "El segundo puesto de la lista de Compromís-Front Valencià por Castellón es de Núria Calduch, de Esquerra Republicana del País Valencià (ERPV), que no tiene candidatura propia en el modelo: " +
                            "este mundo es uno de los pocos en que FV gana allí un segundo escaño." });
  }
}

// Reparto por tipos: una vuelta completa cada cuatro sucesos, un suceso por partido, los más cercanos al 0,5 % primero (el suceso propio de Navarra, que pasa lista el primero)
const porTipo = {};
candidatos.forEach(function (candidato) { (porTipo[candidato.tipo] = porTipo[candidato.tipo] || []).push(candidato); });
Object.keys(porTipo).forEach(function (tipo) { porTipo[tipo].sort(function (a, b) { return a.distancia - b.distancia; }); });
const elegidos = [];
const partidosUsados = {};
let sinCandidatos = 0;
for (let vuelta = 0; elegidos.length < SUCESOS_QUE_SE_MUESTRAN && sinCandidatos < ORDEN_DE_TIPOS.length * 2; vuelta++) {
  const tipo = ORDEN_DE_TIPOS[vuelta % ORDEN_DE_TIPOS.length];
  const lista = porTipo[tipo] || [];
  let hallado = false;
  while (lista.length && !hallado) {
    const candidato = lista.shift();
    if (partidosUsados[candidato.partido]) { continue; }
    partidosUsados[candidato.partido] = true;
    elegidos.push(candidato);
    hallado = true;
  }
  sinCandidatos = hallado ? 0 : sinCandidatos + 1;
}
// Si algún tipo se queda corto, se completa con lo que sobre (tipos «baja» incluidos), también de partidos distintos
if (elegidos.length < SUCESOS_QUE_SE_MUESTRAN) {
  const resto = [];
  Object.keys(porTipo).forEach(function (tipo) { porTipo[tipo].forEach(function (candidato) { resto.push(candidato); }); });
  resto.sort(function (a, b) { return a.distancia - b.distancia; });
  resto.forEach(function (candidato) {
    if (elegidos.length >= SUCESOS_QUE_SE_MUESTRAN || partidosUsados[candidato.partido]) { return; }
    partidosUsados[candidato.partido] = true;
    elegidos.push(candidato);
  });
}

const mundos = elegidos.map(function (candidato) {
  const grupo = [];
  for (let sorteo = 0; sorteo < SORTEOS; sorteo++) { if (candidato.cumple(sorteo)) { grupo.push(sorteo); } }
  const mundo = simulacion.describirSorteo(simulacion.masParecidoALaMediana(grupo));
  mundo.partido = candidato.partido;
  mundo.sentido = candidato.sentido;
  mundo.umbral = candidato.umbral;
  mundo.tipo = candidato.tipo;
  mundo.simulaciones = grupo.length;
  mundo.probabilidad = Math.round(1000 * candidato.probabilidad) / 10;
  if (candidato.titulo) { mundo.titulo = candidato.titulo; mundo.destacado = candidato.destacado; }
  if (candidato.nota) { mundo.nota = candidato.nota; }
  return mundo;
});
mundos.sort(function (a, b) { return b.probabilidad - a.probabilidad; });

comun.guardar("mundos_raros", { fecha_promedio: simulacion.datos.fecha_promedio, sorteos: SORTEOS, mundos: mundos }, "MUNDOS_RAROS");
mundos.forEach(function (mundo) {
  console.log((mundo.titulo || mundo.partido + " " + (mundo.sentido === "mas" ? ">= " : "<= ") + mundo.umbral) + " [" + mundo.tipo + "]: " + mundo.probabilidad + " % (" + mundo.simulaciones + " simulaciones), derecha " + mundo.derecha + ", investidura " + mundo.investidura);
});
