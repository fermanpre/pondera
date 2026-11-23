"use strict";
/*
 * Promedio de las encuestas de un territorio (provincia o comunidad), allí donde hay encuestas suficientes. (22/11/2026; tabla única el 24/11/2026)
 * Son los mismos promedios que usa el blend regional (Web/blend_regional.py, datos_modelo.js → blend_regional.promedios): las mismas reglas que el promedio nacional
 * (nota de la casa, antigüedad, tamaño de muestra, una entrega por casa) pero con ventana de 90 días.
 * Una sola tabla, con el formato de la página principal: una fila por casa (campo, muestra, peso en el promedio y cifra de cada partido) y, encima, la previsión del modelo en ese territorio y
 * el promedio de las encuestas (como en «Crea tu propio promedio» del simulador). Lo llaman pintarProvincia() y pintarComunidad() de app_prevision.js.
 */

const UMBRAL_DE_AVISO_DEL_RESTO = 8;   // puntos de «otros y en blanco» a partir de los cuales se marca la celda

function textoDeFecha(texto) { const trozos = texto.split("-"); return parseInt(trozos[2], 10) + "/" + parseInt(trozos[1], 10); }

// «16–19 Nov 2026» -> «16–19 Nov»: el año sobra en una tabla de la última quincena
function textoDeCampoSinAnio(encuesta) { return encuesta.campo ? encuesta.campo.replace(/\s\d{4}$/, "") : "hasta " + textoDeFecha(encuesta.fin); }

// Coalición UPN-PP (Navarra, 23/11/2026): las encuestas dan el PP (la coalición) y a veces UPN, y el modelo da el voto y los escaños en la columna UPN. Se juntan las dos filas en una sola, con el nombre
// de la coalición. Devuelve los nombres propios de las columnas fusionadas.
function fusionarCoaliciones(listaDeValores, indices) {
  const nombresPropios = {};
  if (typeof modelo === "undefined" || !modelo.coaliciones) { return nombresPropios; }
  modelo.coaliciones.filter(function (c) { return indices.indexOf(c.provincia) >= 0; }).forEach(function (c) {
    const columna = modelo.partidos[c.columna], socio = modelo.partidos[c.socio];
    let hayAlguno = false;
    listaDeValores.forEach(function (valores) {
      if (valores[columna] === undefined && valores[socio] === undefined) { return; }
      valores[columna] = (valores[columna] || 0) + (valores[socio] || 0);
      delete valores[socio];
      hayAlguno = true;
    });
    if (hayAlguno) { nombresPropios[columna] = c.nombre; }
  });
  return nombresPropios;
}

// Una tabla con la previsión del modelo, el promedio y las encuestas de un promedio (de una provincia o de una comunidad). «indices»: provincias del territorio en el modelo.
function htmlDeLaTablaDeEncuestas(titulo, promedio, indices, escaparTexto) {
  const cuotas = ultimoResultado.central.cuotas;
  const pesoTotal = indices.reduce(function (suma, p) { return suma + modelo.provincias[p].peso; }, 0);
  const cuotaDelModeloDe = function (k) {
    let cuota = 0;
    indices.forEach(function (p) { cuota += cuotas[p * K + k] * modelo.provincias[p].peso / pesoTotal; });
    return 100 * cuota;
  };
  const delModelo = {};
  modelo.partidos.forEach(function (partido, k) { if (partido !== "OTROS") { delModelo[partido] = cuotaDelModeloDe(k); } });
  const medias = Object.assign({}, promedio.medias);
  const encuestas = promedio.encuestas.map(function (e) { return Object.assign({}, e, { valores: Object.assign({}, e.valores || {}) }); });
  const nombresPropios = fusionarCoaliciones([delModelo, medias].concat(encuestas.map(function (e) { return e.valores; })), indices);
  // Columnas: todos los partidos del promedio (también los que el modelo no tiene, como la CUP, sin cifra del modelo) y los del modelo con al menos un 1 % en el territorio, de mayor a menor
  const partidos = Object.keys(medias);
  Object.keys(delModelo).forEach(function (partido) { if (medias[partido] === undefined && delModelo[partido] >= 1) { partidos.push(partido); } });
  const pesoDeLaColumna = (partido) => medias[partido] !== undefined ? medias[partido] : delModelo[partido];
  partidos.sort(function (a, b) { return pesoDeLaColumna(b) - pesoDeLaColumna(a); });
  const nombreDe = (partido) => nombresPropios[partido] || (typeof NOMBRES !== "undefined" && NOMBRES[partido]) || partido;
  const celda = (valor) => '<td class="num col-partido">' + (valor === undefined || valor === null ? "–" : porcentaje(valor)) + "</td>";
  const sumaDe = (valores) => partidos.reduce(function (suma, partido) { return suma + (valores[partido] || 0); }, 0);
  const celdaDelResto = function (valores) {
    const resto = 100 - sumaDe(valores);
    return '<td class="num' + (resto >= UMBRAL_DE_AVISO_DEL_RESTO ? " resto-alto" : "") + '">' + porcentaje(resto) + "</td>";
  };
  const cabeceras = partidos.map(function (partido) {
    const nombre = nombreDe(partido);
    const logo = (typeof logoDePartido === "function" && logoDePartido(partido, nombre)) || (typeof ficha === "function" ? ficha(partido) : "") + escaparTexto(nombre);
    return '<th class="num col-partido">' + logo + "</th>";
  }).join("");
  const filaDeResumen = (rotulo, pesoTexto, valores) =>
    '<tr class="fila-promedio"><th colspan="3">' + rotulo + '</th><th class="num">' + pesoTexto + "</th>" + partidos.map((partido) => celda(valores[partido])).join("") + celdaDelResto(valores) + "</tr>";
  const cuerpo = encuestas.map(function (e) {
    const medio = e.cliente ? ' <span class="nota">(' + escaparTexto(e.cliente) + ")</span>" : "";
    return "<tr><td>" + escaparTexto(e.casa) + medio + "</td><td>" + escaparTexto(textoDeCampoSinAnio(e)) + '</td><td class="num">' + (e.muestra ? entero(e.muestra) : "–") + '</td><td class="num">' +
      Math.round(100 * e.peso) + " %</td>" + partidos.map((partido) => celda(e.valores[partido])).join("") + '<td class="num"></td></tr>';
  }).join("");
  return '<div class="tabla-ancha"><table class="tabla-encuestas-territorio"><thead><tr><th>Casa</th><th>Campo</th><th class="num">Muestra</th><th class="num">Peso</th>' + cabeceras + '<th class="num">Otros y en blanco</th></tr>' +
    filaDeResumen("Previsión del modelo", "", delModelo) + filaDeResumen("Promedio de las encuestas", "100 %", medias) + "</thead><tbody>" + cuerpo + "</tbody></table></div>";
}

// En la página de una provincia, el promedio de las encuestas de toda su comunidad (22/11/2026), si lo hay: una encuesta autonómica, como la de Ágora Integral en Canarias, no trae datos por provincia
// y por eso no entra en el promedio de ninguna de ellas, pero sí en el de la comunidad y, con su peso, en la previsión de sus provincias.
function htmlDelPromedioDeLaComunidad(config, promedios, escaparTexto) {
  if (config.tipo !== "provincia" || !config.comunidad) { return ""; }
  const promedio = promedios[config.comunidad + " (comunidad)"];
  if (!promedio) { return ""; }
  const indicesDeLaComunidad = [];
  modelo.provincias.forEach(function (provincia, p) { if (provincia.comunidad === config.comunidad) { indicesDeLaComunidad.push(p); } });
  return '<h3>Promedio de la comunidad: ' + escaparTexto(config.comunidad) + '</h3>' +
    '<p class="subtitulo">' + promedio.k + (promedio.k === 1 ? " encuesta" : " encuestas") + ' de toda la comunidad, con la previsión del modelo en el conjunto de la comunidad.</p>' +
    htmlDeLaTablaDeEncuestas("comunidad", promedio, indicesDeLaComunidad, escaparTexto) +
    '<p class="nota">Promedio de todas las encuestas de la comunidad, también las que ya dan datos por provincia. En la previsión no se cuenta dos veces lo mismo: las encuestas con detalle provincial pesan en sus provincias, y en el total de la comunidad solo pesan las que no lo tienen.</p>';
}

// Candidaturas que el CIS cita en voto directo y que no tienen línea propia en el modelo (Drago Canarias Verdes, Democracia 21, Frente Obrero...): se enseñan como dato, su voto está en «Otros».
function htmlDeOtrosDelCis(config, escaparTexto) {
  const comunidad = config.tipo === "comunidad" ? config.nombre : config.comunidad;
  const otros = (typeof CIS_OTROS_POR_COMUNIDAD !== "undefined" && CIS_OTROS_POR_COMUNIDAD[comunidad]) || [];
  if (!otros.length) { return ""; }
  const cifra = (valor) => String(valor).replace(".", ",") + " %";
  const lista = otros.map(function (partido) {
    const aviso = partido.nombre === "Democracia 21" ? " (el CIS incluye ahí las menciones a Ciudadanos en Barcelona y Madrid)" : "";
    return escaparTexto(partido.nombre) + " " + cifra(partido.directo) + " (" + cifra(partido.citados) + " de quienes citan un partido)" + aviso;
  }).join("; ");
  return '<p class="nota">Otras candidaturas sin línea propia en el modelo. El preelectoral del CIS (estudio 3584) recoge en ' + escaparTexto(comunidad) + ', en voto directo: ' + lista +
    '. Son cifras de unas pocas respuestas, indicativas, y no alcanzan la barrera del 3 %: su voto está dentro de «Otros».</p>';
}

function pintarPromedioDelTerritorio(config) {
  const contenedor = document.getElementById("promedio-territorio");
  if (!contenedor) { return; }
  const escaparTexto = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const promedios = (typeof DATOS_MODELO !== "undefined" && DATOS_MODELO.blend_regional && DATOS_MODELO.blend_regional.promedios) || {};
  const promedio = promedios[config.nombre + " (" + config.tipo + ")"];
  contenedor.hidden = false;
  if (!promedio) {
    contenedor.innerHTML = '<h2>Promedio de encuestas</h2><p class="nota">No hay ninguna encuesta de ' + escaparTexto(config.nombre) +
      ' con porcentajes de voto en los últimos 90 días: hoy no hay promedio vigente y la previsión parte del promedio nacional. El gráfico de abajo es solo el historial de las encuestas anteriores.</p>' + htmlDelPromedioDeLaComunidad(config, promedios, escaparTexto) + htmlDeOtrosDelCis(config, escaparTexto);
    if (typeof pintarSerieDelTerritorio === "function") { pintarSerieDelTerritorio(config, contenedor); }   // aunque hoy no haya promedio, puede haber historia
    return;
  }
  contenedor.innerHTML =
    '<h2>Promedio de encuestas</h2>' +
    '<p class="subtitulo">' + promedio.k + (promedio.k === 1 ? " encuesta" : " encuestas") + ' de ' + escaparTexto(config.nombre) + ' en los últimos 90 días, promediadas con las mismas reglas que el promedio nacional. ' +
    'Arriba, la previsión del modelo y el promedio; debajo, cada encuesta con su peso.</p>' +
    htmlDeLaTablaDeEncuestas(config.tipo, promedio, config.indices, escaparTexto) +
    '<p class="nota">La previsión del modelo no sigue a la encuesta al cien por cien, sino que la mezcla con el promedio nacional y la elección de 2023 (ver la <a href="metodologia.html">metodología</a>). ' +
    'El peso es el de cada encuesta en el promedio (suman 100 %). Las cifras de cada encuesta son las que entran en el promedio: pueden diferir de las publicadas si el filtro de cifras atípicas ha descartado alguna. ' +
    'El promedio solo incluye los partidos que figuran en al menos la mitad de las encuestas. «Otros y en blanco» es lo que falta hasta el 100 %: se marca en rojo a partir del ' + UMBRAL_DE_AVISO_DEL_RESTO +
    ' %, porque un cajón tan grande suele indicar un partido sin cifra en la encuesta o una cifra descartada.</p>' + htmlDelPromedioDeLaComunidad(config, promedios, escaparTexto) + htmlDeOtrosDelCis(config, escaparTexto);
  if (typeof pintarSerieDelTerritorio === "function") { pintarSerieDelTerritorio(config, contenedor); }
}
