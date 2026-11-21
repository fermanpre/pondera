"use strict";
/*
 * Promedio de las encuestas de un territorio (provincia o comunidad), allí donde hay encuestas suficientes. (22/11/2026)
 * Son los mismos promedios que usa el blend regional (Web/blend_regional.py, datos_modelo.js → blend_regional.promedios): las mismas reglas que el promedio nacional
 * (nota de la casa, antigüedad, tamaño de muestra, una entrega por casa) pero con ventana de 90 días. Se enseña junto a la previsión del modelo en ese territorio.
 * Lo llaman pintarProvincia() y pintarComunidad() de app_prevision.js.
 */
function pintarPromedioDelTerritorio(config) {
  const contenedor = document.getElementById("promedio-territorio");
  if (!contenedor) { return; }
  const escaparTexto = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const promedios = (typeof DATOS_MODELO !== "undefined" && DATOS_MODELO.blend_regional && DATOS_MODELO.blend_regional.promedios) || {};
  const promedio = promedios[config.nombre + " (" + config.tipo + ")"];
  contenedor.hidden = false;
  if (!promedio) {
    contenedor.innerHTML = '<h2>Promedio de encuestas</h2><p class="nota">No hay encuestas suficientes de ' + escaparTexto(config.nombre) +
      ' con porcentajes de voto para calcular un promedio propio (hacen falta ' + (config.tipo === "comunidad" ? "dos" : "una") + '); la previsión parte del promedio nacional.</p>';
    if (typeof pintarSerieDelTerritorio === "function") { pintarSerieDelTerritorio(config, contenedor); }   // aunque hoy no haya promedio, puede haber historia
    return;
  }
  const indices = config.indices;
  const cuotas = ultimoResultado.central.cuotas;
  const pesoTotal = indices.reduce(function (suma, p) { return suma + modelo.provincias[p].peso; }, 0);
  // Filas: todos los partidos del promedio (también los que el modelo no tiene, como la CUP, sin cifra del modelo) y los del modelo con al menos un 1 % en el territorio (sin cifra de promedio)
  const cuotaDelModeloDe = function (k) {
    let cuota = 0;
    indices.forEach(function (p) { cuota += cuotas[p * K + k] * modelo.provincias[p].peso / pesoTotal; });
    return 100 * cuota;
  };
  const filas = [];
  Object.keys(promedio.medias).forEach(function (partido) {
    const k = modelo.partidos.indexOf(partido);
    filas.push({ partido: partido, encuestas: promedio.medias[partido], modelo: k < 0 ? null : cuotaDelModeloDe(k) });
  });
  modelo.partidos.forEach(function (partido, k) {
    if (partido === "OTROS" || promedio.medias[partido] !== undefined) { return; }
    const cuota = cuotaDelModeloDe(k);
    if (cuota >= 1) { filas.push({ partido: partido, encuestas: null, modelo: cuota }); }
  });
  const pesoDeLaFila = (f) => f.encuestas !== null ? f.encuestas : f.modelo;
  filas.sort(function (a, b) { return pesoDeLaFila(b) - pesoDeLaFila(a); });
  const cifra = (valor) => valor === null ? "–" : porcentaje(valor);
  const nombreDe = (partido) => NOMBRES[partido] || partido;
  const colorDe = (partido) => COLORES[partido] || "#9a9a94";
  // Control de cordura: suma de los partidos de la tabla y, por diferencia, «otros y en blanco». Un cajón anormalmente grande delata un partido que falta en la encuesta o una cifra descartada.
  const sumaDeLaEncuesta = filas.reduce(function (suma, f) { return suma + (f.encuestas === null ? 0 : f.encuestas); }, 0);
  const sumaDelModelo = filas.reduce(function (suma, f) { return suma + (f.modelo === null ? 0 : f.modelo); }, 0);
  const restoDeLaEncuesta = 100 - sumaDeLaEncuesta;
  const restoDelModelo = 100 - sumaDelModelo;
  const UMBRAL_DE_AVISO = 8;   // puntos de «otros y en blanco» a partir de los cuales se marca la fila
  const claseDelResto = (resto) => resto >= UMBRAL_DE_AVISO ? ' class="resto-alto"' : "";
  const fecha = (texto) => { const trozos = texto.split("-"); return parseInt(trozos[2], 10) + "/" + parseInt(trozos[1], 10); };
  contenedor.innerHTML =
    '<h2>Promedio de encuestas</h2>' +
    '<p class="subtitulo">' + promedio.k + (promedio.k === 1 ? " encuesta" : " encuestas") + ' de ' + escaparTexto(config.nombre) + ' en los últimos 90 días, promediadas con las mismas reglas que el promedio nacional.</p>' +
    '<div class="tabla-ancha"><table><thead><tr><th>Partido</th><th>Promedio de encuestas</th><th>Previsión del modelo</th><th>Diferencia</th></tr></thead><tbody>' +
    filas.map(function (f) {
      const diferencia = f.encuestas !== null && f.modelo !== null ? conTriangulo(f.modelo - f.encuestas, 1) : "–";
      return '<tr><td class="col-partido"><span class="ficha" style="background:' + colorDe(f.partido) + '"></span>' + escaparTexto(nombreDe(f.partido)) + '</td><td>' + cifra(f.encuestas) + '</td><td>' + cifra(f.modelo) + '</td><td>' + diferencia + '</td></tr>';
    }).join("") +
    '<tr class="fila-suma"><td class="col-partido">Suma de los partidos</td><td>' + porcentaje(sumaDeLaEncuesta) + '</td><td>' + porcentaje(sumaDelModelo) + '</td><td></td></tr>' +
    '<tr class="fila-resto"><td class="col-partido">Otros y en blanco (por diferencia)</td><td' + claseDelResto(restoDeLaEncuesta) + '>' + porcentaje(restoDeLaEncuesta) + '</td><td' + claseDelResto(restoDelModelo) + '>' + porcentaje(restoDelModelo) +
    '</td><td></td></tr></tbody></table></div>' +
    '<details class="vu-detalle"><summary>Encuestas del promedio</summary><div class="tabla-ancha"><table><thead><tr><th>Casa</th><th>Fin de campo</th><th>Muestra</th><th>Peso en el promedio</th></tr></thead><tbody>' +
    promedio.encuestas.map(function (e) {
      return '<tr><td>' + escaparTexto(e.casa) + '</td><td>' + fecha(e.fin) + '</td><td>' + (e.muestra ? entero(e.muestra) : "–") + '</td><td>' + Math.round(100 * e.peso) + ' %</td></tr>';
    }).join("") + '</tbody></table></div></details>' +
    '<p class="nota">La diferencia es previsión menos promedio, en puntos: el modelo no sigue a la encuesta al cien por cien, sino que la mezcla con el promedio nacional y la elección de 2023 (ver la <a href="metodologia.html">metodología</a>). ' +
    'El promedio solo incluye los partidos que figuran en al menos la mitad de las encuestas. «Otros y en blanco» es lo que falta hasta el 100 %: se marca en rojo a partir del ' + UMBRAL_DE_AVISO + ' %, porque un cajón tan grande suele indicar un partido sin cifra en la encuesta o una cifra descartada.</p>';
  if (typeof pintarSerieDelTerritorio === "function") { pintarSerieDelTerritorio(config, contenedor); }
}
