"use strict";
/*
 * Origen de los escaños de Compromís-Front Valencià (FV) por partido: Podemos, Compromís, EUPV y ERPV. (22/11/2026)
 * FV es una candidatura conjunta; sus escaños los ocupan, por orden, los puestos de su lista. Si FV saca n escaños en una provincia, son los n primeros de la lista proclamada (BOE núm. 273,
 * 03/11/2026; partido de cada puesto según la prensa, porque el BOE solo da los nombres). Los puestos cuyo partido no consta quedan como «Sin determinar». No cambia el reparto del modelo: solo atribuye
 * a cada partido los escaños que FV ya gana. Lo usan las páginas de territorio, los datos curiosos y los mundos raros (Web/datos_curiosos.js, Web/mundos_raros.js).
 */
const ORIGEN_DE_ESCANOS_FV = {
  "Alicante/Alacant": ["Podemos", "Compromís"],
  "Valencia/València": ["Compromís", "Compromís", "EUPV"],
  "Castellón/Castelló": ["Compromís", "ERPV", "Compromís", "EUPV", "Podemos"],
};
const ORIGENES_DE_FV = ["Podemos", "Compromís", "EUPV", "ERPV", "Sin determinar"];
const NOMBRES_DE_ORIGEN_DE_FV = { "Podemos": "Podemos", "Compromís": "Compromís", "EUPV": "Esquerra Unida (EUPV)", "ERPV": "Esquerra Republicana del País Valencià (ERPV)", "Sin determinar": "Sin determinar (puesto sin partido conocido)" };

// Escaños de FV por origen en una provincia: los n primeros puestos de su lista. Devuelve {origen: cantidad}
function origenDeEscanosFVEnProvincia(nombreDeProvincia, escanosDeFV) {
  const lista = ORIGEN_DE_ESCANOS_FV[nombreDeProvincia] || [];
  const cuentas = {};
  for (let puesto = 0; puesto < escanosDeFV; puesto++) {
    const origen = lista[puesto] || "Sin determinar";
    cuentas[origen] = (cuentas[origen] || 0) + 1;
  }
  return cuentas;
}

// Sección «Escaños de FV por partido de origen» de una página de provincia o comunidad, si el territorio incluye alguna provincia de FV. config.indices: índices de provincia del modelo.
function pintarOrigenDeEscanosFV(config) {
  const contenedor = document.getElementById("origen-fv");
  if (!contenedor) { return; }
  const columnaDeFV = modelo.partidos.indexOf("FV");
  const provincias = config.indices.map(function (p) { return { indice: p, nombre: modelo.provincias[p].nombre }; }).filter(function (provincia) { return ORIGEN_DE_ESCANOS_FV[provincia.nombre]; });
  if (columnaDeFV < 0 || !provincias.length || !ultimoResultado.simulacion) { contenedor.hidden = true; return; }
  const sorteos = ultimoResultado.sorteos;
  const porOrigen = {};
  ORIGENES_DE_FV.forEach(function (origen) { porOrigen[origen] = new Int16Array(sorteos); });
  for (let s = 0; s < sorteos; s++) {
    provincias.forEach(function (provincia) {
      const cuentas = origenDeEscanosFVEnProvincia(provincia.nombre, ultimoResultado.simulacion.provinciales[(s * P + provincia.indice) * K + columnaDeFV]);
      Object.keys(cuentas).forEach(function (origen) { porOrigen[origen][s] += cuentas[origen]; });
    });
  }
  const escribir = (numero) => String(numero).replace(".", ",");
  const filas = ORIGENES_DE_FV.map(function (origen) {
    const cantidades = porOrigen[origen];
    let suma = 0;
    let conAlguno = 0;
    const cuentas = {};
    for (let s = 0; s < sorteos; s++) { suma += cantidades[s]; if (cantidades[s] > 0) { conAlguno += 1; } cuentas[cantidades[s]] = (cuentas[cantidades[s]] || 0) + 1; }
    if (suma === 0) { return ""; }
    let masProbable = 0;
    Object.keys(cuentas).forEach(function (cantidad) { if (cuentas[cantidad] > (cuentas[masProbable] || 0)) { masProbable = parseInt(cantidad, 10); } });
    const probabilidad = conAlguno / sorteos;
    const textoDeProbabilidad = typeof PROBABILIDAD !== "undefined" ? PROBABILIDAD.html(probabilidad, escribir((100 * probabilidad).toFixed(1)) + " %") : escribir((100 * probabilidad).toFixed(1)) + " %";
    return '<tr><td class="col-partido">' + NOMBRES_DE_ORIGEN_DE_FV[origen] + '</td><td>' + escribir((suma / sorteos).toFixed(2)) + '</td><td>' + masProbable + '</td><td>' + textoDeProbabilidad + '</td></tr>';
  }).join("");
  contenedor.hidden = false;
  contenedor.innerHTML = '<h2>Escaños de Compromís-Front Valencià por partido</h2>' +
    '<p class="subtitulo">Cómo se reparten, entre los partidos de la coalición, los escaños que gana FV en ' + (config.indices.length === 1 ? 'esta provincia' : 'esta comunidad') + ' (simulaciones del modelo).</p>' +
    '<div class="tabla-ancha"><table><thead><tr><th>Partido de origen</th><th>Escaños (media)</th><th>Más probable</th><th>Al menos un escaño</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
    '<p class="nota">FV es una candidatura conjunta: si saca n escaños en una provincia, son los n primeros puestos de su lista proclamada (BOE del 3 de noviembre de 2026; el partido de cada puesto, según la prensa). ' +
    'Alicante: Podemos, Compromís; Valencia: Compromís, Compromís, EUPV; Castellón: Compromís, ERPV, Compromís, EUPV, Podemos. Los puestos siguientes no tienen partido conocido y salen como «Sin determinar». ' +
    'Esta atribución no cambia el reparto del modelo: en las tablas y el hemiciclo todos esos escaños siguen siendo de FV.</p>';
}

if (typeof module !== "undefined") { module.exports = { ORIGEN_DE_ESCANOS_FV: ORIGEN_DE_ESCANOS_FV, ORIGENES_DE_FV: ORIGENES_DE_FV, origenDeEscanosFVEnProvincia: origenDeEscanosFVEnProvincia }; }
