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

function pintarHemiciclo(contenedor, escanosPorPartido) {
  if (!contenedor) return;
  const partidos = ORDEN_EN_LA_BARRA.filter(function (partido) { return (escanosPorPartido[partido] || 0) > 0; });
  // Partidos con escaños que no figuran en el orden de la barra: al final
  Object.keys(escanosPorPartido).forEach(function (partido) { if (escanosPorPartido[partido] > 0 && partidos.indexOf(partido) < 0) partidos.push(partido); });
  const total = partidos.reduce(function (suma, partido) { return suma + escanosPorPartido[partido]; }, 0);
  if (!total) { contenedor.innerHTML = ""; return; }
  const disposicion = asientosDelHemiciclo(total);
  let svg = '<svg viewBox="0 0 ' + HEMICICLO.ancho + " " + HEMICICLO.alto + '" role="img" aria-label="Hemiciclo del Congreso con los escaños previstos de cada partido">';
  let indice = 0;
  partidos.forEach(function (partido) {
    const cantidad = escanosPorPartido[partido];
    const nombre = NOMBRES[partido] || partido;
    for (let i = 0; i < cantidad; i++, indice++) {
      const asiento = disposicion.asientos[indice];
      svg += '<circle cx="' + asiento.x.toFixed(1) + '" cy="' + asiento.y.toFixed(1) + '" r="' + disposicion.radioDelAsiento.toFixed(1) + '" fill="' + (COLORES[partido] || "#9a9a94") + '"><title>' + nombre + ": " + cantidad + ' escaños</title></circle>';
    }
  });
  // Marcador de la mayoría absoluta: una línea radial entre el asiento 176 (contando desde la izquierda) y el siguiente, con la etiqueta «176» fuera del arco
  if (disposicion.asientos.length > MAYORIA_ABSOLUTA) {
    const angulo = (disposicion.asientos[MAYORIA_ABSOLUTA - 1].angulo + disposicion.asientos[MAYORIA_ABSOLUTA].angulo) / 2;
    const interior = HEMICICLO.radioInterior - 14, exterior = HEMICICLO.radioExterior + 12;
    svg += '<line class="hemiciclo-marcador" x1="' + (HEMICICLO.centroX + interior * Math.cos(angulo)).toFixed(1) + '" y1="' + (HEMICICLO.centroY - interior * Math.sin(angulo)).toFixed(1) +
      '" x2="' + (HEMICICLO.centroX + exterior * Math.cos(angulo)).toFixed(1) + '" y2="' + (HEMICICLO.centroY - exterior * Math.sin(angulo)).toFixed(1) + '"/>';
    svg += '<text class="hemiciclo-etiqueta" text-anchor="middle" x="' + (HEMICICLO.centroX + (exterior + 10) * Math.cos(angulo)).toFixed(1) + '" y="' + (HEMICICLO.centroY - (exterior + 10) * Math.sin(angulo) + 4).toFixed(1) + '">176</text>';
  }
  svg += '<text x="' + HEMICICLO.centroX + '" y="' + (HEMICICLO.centroY - 40) + '" text-anchor="middle" class="hemiciclo-total">' + total + '</text>';
  svg += '<text x="' + HEMICICLO.centroX + '" y="' + (HEMICICLO.centroY - 12) + '" text-anchor="middle" class="hemiciclo-nota">escaños · mayoría absoluta: 176</text>';
  svg += "</svg>";
  const leyenda = partidos.map(function (partido) {
    return '<span class="hemiciclo-partido"><span class="ficha" style="background:' + (COLORES[partido] || "#9a9a94") + '"></span>' + (NOMBRES[partido] || partido) + " <b>" + escanosPorPartido[partido] + "</b></span>";
  }).join("");
  contenedor.innerHTML = svg + '<div class="hemiciclo-leyenda">' + leyenda + "</div>";
}
