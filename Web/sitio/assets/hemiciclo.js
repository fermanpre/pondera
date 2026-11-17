"use strict";
/*
 * Hemiciclo del Congreso: un círculo por escaño, en filas concéntricas, de izquierda a derecha según el orden de ORDEN_EN_LA_BARRA (comun.js).
 * Reparto de los asientos: cada fila recibe escaños en proporción a su radio y todos los asientos se ordenan por ángulo, de izquierda a derecha,
 * para dar a cada partido una cuña continua (la disposición clásica de los gráficos de parlamentos).
 * Uso: pintarHemiciclo(elemento, { PP: 132, PSOE: 111, ... }).
 */
const MAYORIA_ABSOLUTA = 176;
const HEMICICLO = { ancho: 720, alto: 400, centroX: 360, centroY: 368, radioExterior: 340, radioInterior: 128, filas: 11, proporcionDelRadio: 0.44 };

// Asientos del hemiciclo: [{ x, y, angulo, fila }] ordenados de izquierda a derecha
function asientosDelHemiciclo(total) {
  const filas = HEMICICLO.filas;
  const separacion = (HEMICICLO.radioExterior - HEMICICLO.radioInterior) / (filas - 1);
  const radios = [];
  for (let fila = 0; fila < filas; fila++) radios.push(HEMICICLO.radioInterior + fila * separacion);
  const sumaDeRadios = radios.reduce(function (suma, radio) { return suma + radio; }, 0);
  const porFila = radios.map(function (radio) { return Math.max(2, Math.round(total * radio / sumaDeRadios)); });
  // Ajuste del redondeo: se quita o se añade un asiento a las filas más largas hasta llegar al total
  let diferencia = total - porFila.reduce(function (suma, n) { return suma + n; }, 0);
  for (let i = 0; diferencia !== 0; i++) {
    const fila = filas - 1 - (i % filas);
    porFila[fila] += diferencia > 0 ? 1 : -1;
    diferencia += diferencia > 0 ? -1 : 1;
  }
  const asientos = [];
  radios.forEach(function (radio, fila) {
    const n = porFila[fila];
    for (let j = 0; j < n; j++) {
      const angulo = n === 1 ? Math.PI / 2 : Math.PI - Math.PI * j / (n - 1);
      asientos.push({ x: HEMICICLO.centroX + radio * Math.cos(angulo), y: HEMICICLO.centroY - radio * Math.sin(angulo), angulo: angulo, radio: radio });
    }
  });
  asientos.sort(function (a, b) { return (b.angulo - a.angulo) || (a.radio - b.radio); });
  return { asientos: asientos, radioDelAsiento: separacion * HEMICICLO.proporcionDelRadio };
}

// Línea de la mayoría absoluta: en cada fila de asientos pasa por el hueco entre el último asiento de la izquierda y el primero de la derecha;
// entre filas sigue el arco que las separa. Los asientos 1 a 174 (de izquierda a derecha) quedan a la izquierda y los 176 restantes a la derecha.
function marcadorDeMayoria(disposicion) {
  const asientosAIzquierda = disposicion.asientos.length - MAYORIA_ABSOLUTA;
  const filas = {};
  disposicion.asientos.forEach(function (asiento, posicion) {
    const fila = filas[asiento.radio] || (filas[asiento.radio] = { radio: asiento.radio, izquierda: [], derecha: [] });
    (posicion < asientosAIzquierda ? fila.izquierda : fila.derecha).push(asiento.angulo);
  });
  const radios = Object.keys(filas).map(Number).sort(function (a, b) { return a - b; });
  const medioPaso = (HEMICICLO.radioExterior - HEMICICLO.radioInterior) / (HEMICICLO.filas - 1) / 2;
  const cortes = radios.map(function (radio) {
    const fila = filas[radio];
    const paso = Math.PI / Math.max(1, fila.izquierda.length + fila.derecha.length - 1);
    const ultimoDeLaIzquierda = fila.izquierda.length ? Math.min.apply(null, fila.izquierda) : Math.PI + paso / 2;
    const primeroDeLaDerecha = fila.derecha.length ? Math.max.apply(null, fila.derecha) : -paso / 2;
    return { radio: radio, angulo: (ultimoDeLaIzquierda + primeroDeLaDerecha) / 2 };
  });
  const punto = function (radio, angulo) {
    return (HEMICICLO.centroX + radio * Math.cos(angulo)).toFixed(1) + " " + (HEMICICLO.centroY - radio * Math.sin(angulo)).toFixed(1);
  };
  let camino = "M" + punto(HEMICICLO.radioInterior - 14, cortes[0].angulo);
  cortes.forEach(function (corte, i) {
    camino += " L" + punto(corte.radio - medioPaso, corte.angulo) + " L" + punto(corte.radio + medioPaso, corte.angulo);
    const siguiente = cortes[i + 1];
    if (siguiente) {
      const radioDeUnion = corte.radio + medioPaso;
      camino += " A" + radioDeUnion.toFixed(1) + " " + radioDeUnion.toFixed(1) + " 0 0 " + (siguiente.angulo > corte.angulo ? 0 : 1) + " " + punto(radioDeUnion, siguiente.angulo);
    }
  });
  const ultimo = cortes[cortes.length - 1];
  const exterior = HEMICICLO.radioExterior + 12;
  camino += " L" + punto(exterior, ultimo.angulo);
  return '<path class="hemiciclo-marcador" d="' + camino + '" fill="none"/>' +
    '<text class="hemiciclo-etiqueta" text-anchor="middle" x="' + (HEMICICLO.centroX + (exterior + 12) * Math.cos(ultimo.angulo)).toFixed(1) +
    '" y="' + (HEMICICLO.centroY - (exterior + 12) * Math.sin(ultimo.angulo) + 4).toFixed(1) + '">176</text>';
}

function pintarHemiciclo(contenedor, escanosPorPartido) {
  if (!contenedor) return;
  const partidos = ORDEN_EN_LA_BARRA.filter(function (partido) { return (escanosPorPartido[partido] || 0) > 0; });
  // Partidos con escaños que no figuran en el orden de la barra: al final
  Object.keys(escanosPorPartido).forEach(function (partido) { if (escanosPorPartido[partido] > 0 && partidos.indexOf(partido) < 0) partidos.push(partido); });
  const total = partidos.reduce(function (suma, partido) { return suma + escanosPorPartido[partido]; }, 0);
  if (!total) { contenedor.innerHTML = ""; return; }
  const disposicion = asientosDelHemiciclo(total);
  let svg = '<svg viewBox="0 -24 ' + HEMICICLO.ancho + " " + (HEMICICLO.alto + 24) + '" role="img" aria-label="Hemiciclo del Congreso con los escaños previstos de cada partido">';
  let indice = 0;
  partidos.forEach(function (partido) {
    const cantidad = escanosPorPartido[partido];
    const nombre = NOMBRES[partido] || partido;
    for (let i = 0; i < cantidad; i++, indice++) {
      const asiento = disposicion.asientos[indice];
      svg += '<circle cx="' + asiento.x.toFixed(1) + '" cy="' + asiento.y.toFixed(1) + '" r="' + disposicion.radioDelAsiento.toFixed(1) + '" fill="' + (COLORES[partido] || "#9a9a94") + '"><title>' + nombre + ": " + cantidad + ' escaños</title></circle>';
    }
  });
  // Marcador de la mayoría absoluta: una línea quebrada que bordea los círculos (nunca los atraviesa) y deja 174 asientos a su izquierda y 176 a su derecha
  if (disposicion.asientos.length > MAYORIA_ABSOLUTA) svg += marcadorDeMayoria(disposicion);
  svg += '<text x="' + HEMICICLO.centroX + '" y="' + (HEMICICLO.centroY - 40) + '" text-anchor="middle" class="hemiciclo-total">' + total + '</text>';
  svg += '<text x="' + HEMICICLO.centroX + '" y="' + (HEMICICLO.centroY - 12) + '" text-anchor="middle" class="hemiciclo-nota">escaños · mayoría absoluta: 176</text>';
  svg += "</svg>";
  const leyenda = partidos.map(function (partido) {
    return '<span class="hemiciclo-partido"><span class="ficha" style="background:' + (COLORES[partido] || "#9a9a94") + '"></span>' + (NOMBRES[partido] || partido) + " <b>" + escanosPorPartido[partido] + "</b></span>";
  }).join("");
  contenedor.innerHTML = svg + '<div class="hemiciclo-leyenda">' + leyenda + "</div>";
}
