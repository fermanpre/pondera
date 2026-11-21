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
    return;
  }
  const indices = config.indices;
  const cuotas = ultimoResultado.central.cuotas;
  const pesoTotal = indices.reduce(function (suma, p) { return suma + modelo.provincias[p].peso; }, 0);
  const filas = [];
  Object.keys(promedio.medias).forEach(function (partido) {
    const k = modelo.partidos.indexOf(partido);
    if (k < 0) { return; }
    let cuotaDelModelo = 0;
    indices.forEach(function (p) { cuotaDelModelo += cuotas[p * K + k] * modelo.provincias[p].peso / pesoTotal; });
    filas.push({ partido: partido, encuestas: promedio.medias[partido], modelo: 100 * cuotaDelModelo });
  });
  filas.sort(function (a, b) { return b.encuestas - a.encuestas; });
  const fecha = (texto) => { const trozos = texto.split("-"); return parseInt(trozos[2], 10) + "/" + parseInt(trozos[1], 10); };
  contenedor.innerHTML =
    '<h2>Promedio de encuestas</h2>' +
    '<p class="subtitulo">' + promedio.k + (promedio.k === 1 ? " encuesta" : " encuestas") + ' de ' + escaparTexto(config.nombre) + ' en los últimos 90 días, promediadas con las mismas reglas que el promedio nacional.</p>' +
    '<div class="tabla-ancha"><table><thead><tr><th>Partido</th><th>Promedio de encuestas</th><th>Previsión del modelo</th><th>Diferencia</th></tr></thead><tbody>' +
    filas.map(function (f) {
      return '<tr><td class="col-partido">' + ficha(f.partido) + NOMBRES[f.partido] + '</td><td>' + porcentaje(f.encuestas) + '</td><td>' + porcentaje(f.modelo) + '</td><td>' + conTriangulo(f.modelo - f.encuestas, 1) + '</td></tr>';
    }).join("") + '</tbody></table></div>' +
    '<details class="vu-detalle"><summary>Encuestas del promedio</summary><div class="tabla-ancha"><table><thead><tr><th>Casa</th><th>Fin de campo</th><th>Muestra</th><th>Peso en el promedio</th></tr></thead><tbody>' +
    promedio.encuestas.map(function (e) {
      return '<tr><td>' + escaparTexto(e.casa) + '</td><td>' + fecha(e.fin) + '</td><td>' + (e.muestra ? entero(e.muestra) : "–") + '</td><td>' + Math.round(100 * e.peso) + ' %</td></tr>';
    }).join("") + '</tbody></table></div></details>' +
    '<p class="nota">La diferencia es previsión menos promedio, en puntos: el modelo no sigue a la encuesta al cien por cien, sino que la mezcla con el promedio nacional y la elección de 2023 (ver la <a href="metodologia.html">metodología</a>). ' +
    'El promedio solo incluye los partidos que figuran en al menos la mitad de las encuestas.</p>';
}
