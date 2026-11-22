"use strict";
/*
 * Página del Senado: senadores elegidos por voto (reparto de cada escenario con sus rangos), ventaja de la derecha y probabilidades por circunscripción.
 * Usa SENADO (senado.js, que genera prevision_senado_diaria.py) y NOMBRES, COLORES y entero de comun.js.
 */
(function () {
  if (typeof SENADO === "undefined") { return; }
  const datos = SENADO.senado;
  const ELEGIDOS_POR_VOTO = 208;
  const NOMBRES_DEL_SENADO = { SDP: "Senado de Progreso (PSOE + Frente Amplio + Front Valencià)", LOCALES: "Candidaturas locales", GEROABAI: "Geroa Bai" };
  const COLORES_DEL_SENADO = { SDP: "#d4141c", LOCALES: "#9a9a95", GEROABAI: "#b03a8c" };
  const ORDEN = ["SDP", "PSOE", "SUMAR", "FV", "PODEMOS", "BILDU", "BNG", "GEROABAI", "ERC", "PNV", "CC", "JUNTS", "LOCALES", "UPN", "PP", "VOX"];
  const DESIGNADOS = (typeof SENADO_DESIGNADOS !== "undefined") ? SENADO_DESIGNADOS : null;
  // Designados de cada partido tal como aparece en el escenario: en «SDP» se suman los del PSOE, Más Madrid (con el Frente Amplio) y Compromís (con Front Valencià)
  const designadosDe = (clave) => {
    if (!DESIGNADOS) { return 0; }
    const porPartido = DESIGNADOS.por_partido;
    if (clave === "SDP") { return (porPartido.PSOE || 0) + (porPartido.SUMAR || 0) + (porPartido.FV || 0); }
    return porPartido[clave] || 0;
  };
  const SIN_ELEGIDOS = { media: 0, mediana: 0, p10: 0, p90: 0, p025: 0, p975: 0 };
  const formatoDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nombreDe = (clave) => NOMBRES_DEL_SENADO[clave] || (typeof NOMBRES !== "undefined" && NOMBRES[clave]) || clave;
  const nombreCorto = (clave) => (clave === "SDP" ? "Senado de Progreso" : nombreDe(clave));
  const colorDe = (clave) => COLORES_DEL_SENADO[clave] || (typeof COLORES !== "undefined" && COLORES[clave]) || "#7a7a75";
  const porcentaje = (probabilidad) => PROBABILIDAD.html(probabilidad, Math.round(100 * probabilidad) + "%");
  function escapar(texto) { return String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  const posicion = (clave) => (ORDEN.indexOf(clave) < 0 ? 99 : ORDEN.indexOf(clave));
  const porOrden = (a, b) => posicion(a) - posicion(b);

  const selectorEscenario = document.getElementById("selector-escenario-senado");
  const selectorCircunscripcion = document.getElementById("selector-circunscripcion-senado");

  const fecha = new Date(SENADO.fecha_promedio + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  document.getElementById("senado-fecha").textContent = "Promedio a " + fecha + ". " + entero(SENADO.sorteos) + " simulaciones. Se calcula una vez al día.";

  function pintarEscenario() {
    const escenario = datos.escenarios[selectorEscenario.value];
    const claves = Object.keys(escenario.nacional).sort(porOrden);
    // Partidos con designados que no tienen senadores elegidos en el escenario (Geroa Bai): aparecen en la tabla con 0 elegidos
    const clavesDeLaTabla = claves.slice();
    if (DESIGNADOS) { Object.keys(DESIGNADOS.por_partido).forEach((clave) => { if (clave === "PSOE" || clave === "SUMAR" || clave === "FV") { return; } if (clavesDeLaTabla.indexOf(clave) < 0) { clavesDeLaTabla.push(clave); } }); }
    const elegidosDe = (clave) => escenario.nacional[clave] || SIN_ELEGIDOS;
    // Barra: la mediana de cada partido, normalizada al total de las medianas
    const sumaMedianas = claves.reduce((suma, clave) => suma + escenario.nacional[clave].mediana, 0) || 1;
    document.getElementById("senado-barra").innerHTML = claves.filter((clave) => escenario.nacional[clave].mediana > 0).map((clave) => {
      const mediana = escenario.nacional[clave].mediana;
      const rotulo = mediana >= 6 ? escapar(clave === "SDP" ? "SDP" : nombreDe(clave)) + " " + mediana : "";
      return '<span class="senado-tramo" style="width:' + (100 * mediana / sumaMedianas).toFixed(2) + "%;background:" + colorDe(clave) + '" title="' + escapar(nombreCorto(clave)) + " " + mediana + '">' + rotulo + "</span>";
    }).join("");
    const total = (clave) => elegidosDe(clave).mediana + designadosDe(clave);
    const filas = clavesDeLaTabla.slice().sort((a, b) => total(b) - total(a) || elegidosDe(b).media - elegidosDe(a).media);
    document.querySelector("#tabla-senado tbody").innerHTML = filas.map((clave) => {
      const n = elegidosDe(clave);
      return '<tr><td><span class="ficha" style="background:' + colorDe(clave) + '"></span> ' + escapar(nombreDe(clave)) + "</td><td><b>" + n.mediana + "</b></td><td>" + n.p10 + " a " + n.p90 +
        "</td><td>" + n.p025 + " a " + n.p975 + "</td><td>" + formatoDecimal.format(n.media) + "</td><td>" + designadosDe(clave) + "</td><td><b>" + total(clave) + "</b></td></tr>";
    }).join("");
    const principal = datos.escenarios[datos.escenario_principal];
    const derecha = ["PP", "VOX", "UPN"].reduce((suma, clave) => suma + (principal.nacional[clave] ? principal.nacional[clave].mediana : 0), 0);
    document.getElementById("senado-titular").textContent = "En el escenario principal (" + principal.titulo.charAt(0).toLowerCase() + principal.titulo.slice(1) + "), PP, Vox y UPN suman una mediana de " + derecha + " de los " + ELEGIDOS_POR_VOTO + " senadores elegidos por voto.";
    document.getElementById("senado-nota-escenario").textContent = escenario.titulo + ". " + datos.nota + " Mediana de cada partido en las simulaciones (la suma de medianas no tiene por qué dar " + ELEGIDOS_POR_VOTO +
      "); el rango del 80 % deja fuera el 10 % de los resultados más bajos y el 10 % de los más altos, y el del 95 % el 2,5 % de cada lado.";
    pintarVentaja(escenario);
    pintarMayorias(escenario);
  }

  // ---- Probabilidad de mayoría: histogramas de cada bloque (elegidos + designados) con las líneas de la mayoría absoluta y de los tres quintos
  const TAMANO_DEL_SENADO = DESIGNADOS ? DESIGNADOS.total_senado : 266;
  const MAYORIA_ABSOLUTA = DESIGNADOS ? DESIGNADOS.mayoria_absoluta : 134;
  const TRES_QUINTOS = Math.ceil(0.6 * TAMANO_DEL_SENADO);   // 160 de 266 (159,6 redondeado al alza)
  const designadosDelBloque = (claves) => claves.reduce((suma, clave) => suma + ((DESIGNADOS && DESIGNADOS.por_partido[clave]) || 0), 0);
  const porcentajeEntero = (probabilidad) => PROBABILIDAD.html(probabilidad, Math.round(100 * probabilidad) + " %");
  PROBABILIDAD.alCambiar(function () { location.reload(); });
  const probabilidadDeAlcanzar = (distribucion, desplazamiento, umbral, invertido, elegidos) => {
    // distribucion[n] = probabilidad de n senadores elegidos del bloque; total del bloque = n + designados (o, si el bloque es «todo lo demás», (elegidos - n) + designados)
    let suma = 0;
    distribucion.forEach((p, n) => { const total = invertido ? (elegidos - n) + desplazamiento : n + desplazamiento; if (total >= umbral) { suma += p; } });
    return suma;
  };

  function histogramaSvg(distribucion, desplazamiento, invertido, elegidos, contenedor) {
    const probabilidades = {};   // total de senadores del bloque -> probabilidad
    distribucion.forEach((p, n) => { if (p > 0) { const total = invertido ? (elegidos - n) + desplazamiento : n + desplazamiento; probabilidades[total] = (probabilidades[total] || 0) + p; } });
    const totales = Object.keys(probabilidades).map(Number);
    if (!totales.length) { contenedor.textContent = ""; return; }
    const minimo = Math.max(0, Math.min(Math.min.apply(null, totales), MAYORIA_ABSOLUTA) - 8);
    const maximo = Math.min(TAMANO_DEL_SENADO, Math.max(Math.max.apply(null, totales), TRES_QUINTOS) + 8);
    const pico = Math.max.apply(null, Object.keys(probabilidades).map((k) => probabilidades[k]));
    const ancho = 560, alto = 250, margen = { izquierda: 8, derecha: 8, arriba: 26, abajo: 26 };
    const anchoUtil = ancho - margen.izquierda - margen.derecha, altoUtil = alto - margen.arriba - margen.abajo;
    const x = (valor) => margen.izquierda + anchoUtil * (valor - minimo) / (maximo - minimo + 1);
    const y = (p) => margen.arriba + altoUtil * (1 - p / (pico * 1.08));
    const anchoDeBarra = anchoUtil / (maximo - minimo + 1);
    let svg = '<svg class="mg-svg" viewBox="0 0 ' + ancho + " " + alto + '" role="img" aria-label="Distribución de senadores del bloque">';
    for (let total = minimo; total <= maximo; total += 1) {
      const p = probabilidades[total] || 0;
      if (p <= 0) { continue; }
      const clase = total >= TRES_QUINTOS ? "mg-barra-tres" : (total >= MAYORIA_ABSOLUTA ? "mg-barra-absoluta" : "mg-barra-baja");
      svg += '<rect class="' + clase + '" x="' + x(total).toFixed(1) + '" y="' + y(p).toFixed(1) + '" width="' + Math.max(1, anchoDeBarra - 0.6).toFixed(1) + '" height="' + (margen.arriba + altoUtil - y(p)).toFixed(1) + '"><title>' + total + " senadores: " + (100 * p).toFixed(1).replace(".", ",") + " %</title></rect>";
    }
    svg += '<line x1="' + margen.izquierda + '" x2="' + (ancho - margen.derecha) + '" y1="' + (margen.arriba + altoUtil) + '" y2="' + (margen.arriba + altoUtil) + '" stroke="var(--linea)" />';
    for (let marca = Math.ceil(minimo / 10) * 10; marca <= maximo; marca += 10) {
      svg += '<text class="mg-eje" x="' + (x(marca) + anchoDeBarra / 2).toFixed(1) + '" y="' + (alto - 8) + '" text-anchor="middle">' + marca + "</text>";
    }
    [[MAYORIA_ABSOLUTA, "absoluta " + MAYORIA_ABSOLUTA], [TRES_QUINTOS, "tres quintos " + TRES_QUINTOS]].forEach(([umbral, rotulo], i) => {
      if (umbral < minimo || umbral > maximo) { return; }
      const posicion = x(umbral);
      svg += '<line class="mg-umbral" x1="' + posicion.toFixed(1) + '" x2="' + posicion.toFixed(1) + '" y1="' + (margen.arriba - 4) + '" y2="' + (margen.arriba + altoUtil) + '" />';
      const alFinal = i === 0 || posicion > ancho - 110;   // la etiqueta va a la izquierda de la línea; la de tres quintos, a la derecha salvo que no quepa
      svg += '<text class="mg-etiqueta" x="' + (posicion + (alFinal ? -4 : 4)).toFixed(1) + '" y="' + (12 + 11 * i) + '" text-anchor="' + (alFinal ? "end" : "start") + '">' + rotulo + "</text>";
    });
    svg += "</svg>";
    contenedor.innerHTML = svg;
  }

  function pintarMayorias(escenario) {
    const seccion = document.getElementById("senado-mayorias");
    const bloques = escenario.distribucion_de_bloques;
    if (!seccion || !bloques) { if (seccion) { seccion.hidden = true; } return; }
    seccion.hidden = false;
    const elegidos = bloques.elegidos;
    const designadosDerecha = designadosDelBloque(["PP", "VOX", "UPN"]);
    const designadosIzquierda = designadosDelBloque(["PSOE", "SUMAR", "FV"]);
    const designadosRestoDeLaDerecha = (DESIGNADOS ? DESIGNADOS.designados : 0) - designadosDerecha;   // todo lo que no es derecha: izquierda, nacionalistas y locales
    histogramaSvg(bloques.derecha, designadosDerecha, false, elegidos, document.getElementById("grafico-mayoria-derecha"));
    histogramaSvg(bloques.derecha, designadosRestoDeLaDerecha, true, elegidos, document.getElementById("grafico-mayoria-resto"));
    const filas = [
      { nombre: "Derecha", detalle: "PP + Vox + UPN, con " + designadosDerecha + " designados", distribucion: bloques.derecha, desplazamiento: designadosDerecha, invertido: false },
      { nombre: "PP solo", detalle: "con " + designadosDelBloque(["PP"]) + " designados", distribucion: bloques.pp, desplazamiento: designadosDelBloque(["PP"]), invertido: false },
      { nombre: "Izquierda", detalle: "PSOE + Frente Amplio + Front Valencià, con " + designadosIzquierda + " designados", distribucion: bloques.izquierda, desplazamiento: designadosIzquierda, invertido: false },
      { nombre: "Todo lo que no es derecha", detalle: "izquierda, nacionalistas y locales, con " + designadosRestoDeLaDerecha + " designados", distribucion: bloques.derecha, desplazamiento: designadosRestoDeLaDerecha, invertido: true },
    ];
    const probabilidades = filas.map((fila) => ({
      absoluta: probabilidadDeAlcanzar(fila.distribucion, fila.desplazamiento, MAYORIA_ABSOLUTA, fila.invertido, elegidos),
      tres: probabilidadDeAlcanzar(fila.distribucion, fila.desplazamiento, TRES_QUINTOS, fila.invertido, elegidos),
    }));
    document.getElementById("mayorias-resumen").innerHTML = filas.map((fila, i) =>
      '<div class="mr-fila"><div class="mr-nombre">' + escapar(fila.nombre) + "<small>" + escapar(fila.detalle) + '</small></div><div class="mr-barras">' +
      '<div class="mr-linea"><span class="mr-pista"><span class="mr-relleno absoluta" style="width:' + (100 * probabilidades[i].absoluta).toFixed(1) + '%"></span></span><span class="mr-valor">' + porcentajeEntero(probabilidades[i].absoluta) + "</span></div>" +
      '<div class="mr-linea"><span class="mr-pista"><span class="mr-relleno tres" style="width:' + (100 * probabilidades[i].tres).toFixed(1) + '%"></span></span><span class="mr-valor">' + porcentajeEntero(probabilidades[i].tres) + "</span></div>" +
      "</div></div>").join("") +
      '<p class="mg-leyenda"><span><span class="ficha" style="background:#1d6fb8"></span>mayoría absoluta (' + MAYORIA_ABSOLUTA + ' de ' + TAMANO_DEL_SENADO + ')</span><span><span class="ficha" style="background:#2e9e5b"></span>tres quintos (' + TRES_QUINTOS + ' de ' + TAMANO_DEL_SENADO + ')</span></p>';
    const enSimulaciones = (p) => PROBABILIDAD.enLasSimulaciones(p, Math.round(100 * p) + " %");
    document.getElementById("mayorias-titular").innerHTML = PROBABILIDAD.activo()
      ? "Con los " + designadosDerecha + " designados, la derecha logra la mayoría absoluta del Senado (" + MAYORIA_ABSOLUTA + ") " + enSimulaciones(probabilidades[0].absoluta) + " y los tres quintos (" + TRES_QUINTOS + ") " +
        enSimulaciones(probabilidades[0].tres) + "; el resto, " + enSimulaciones(probabilidades[3].absoluta) + " y " + enSimulaciones(probabilidades[3].tres) + "."
      : "Con los " + designadosDerecha + " designados, la derecha tiene un " + porcentajeEntero(probabilidades[0].absoluta) + " de probabilidad de mayoría absoluta del Senado (" + MAYORIA_ABSOLUTA +
        ") y un " + porcentajeEntero(probabilidades[0].tres) + " de tres quintos (" + TRES_QUINTOS + "); el resto, un " + porcentajeEntero(probabilidades[3].absoluta) + " y un " + porcentajeEntero(probabilidades[3].tres) + ".";
    document.getElementById("mayorias-nota").textContent = "Cada barra es el número total de senadores del bloque (elegidos por voto, simulados, más designados por los parlamentos autonómicos, fijos) en las " + entero(SENADO.sorteos) +
      " simulaciones. La mayoría absoluta decide casi todo; los tres quintos son los que exige la Constitución para que el Senado proponga cuatro de los doce magistrados del Tribunal Constitucional y se usan también para otros nombramientos, como los vocales del CGPJ que elige el Senado. " +
      "Con " + entero(SENADO.sorteos) + " simulaciones, cada probabilidad tiene un error de hasta ±" + String(Math.round(10 * 98 / Math.sqrt(SENADO.sorteos)) / 10).replace(".", ",") + " puntos (al 95 %). «Todo lo que no es derecha» suma izquierda, nacionalistas, Coalición Canaria, Geroa Bai y locales, que no tienen por qué votar juntos.";
  }

  function pintarVentaja(escenario) {
    const v = escenario.ventaja_derecha_sobre_izquierda_y_nacionalistas;
    const signo = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n);
    document.getElementById("senado-ventaja-titular").innerHTML = "PP, Vox y UPN sacan una mediana de " + signo(v.mediana) + " senadores de ventaja sobre el resto (izquierda, nacionalistas y locales), " +
      (PROBABILIDAD.activo() ? "y la ventaja es positiva " + PROBABILIDAD.enLasSimulaciones(v.p_positiva, Math.round(100 * v.p_positiva) + "%") + "." : "con una probabilidad del " + porcentaje(v.p_positiva) + " de que la ventaja sea positiva.");
    let texto = "Rango del 80 %: de " + signo(v.p10) + " a " + signo(v.p90) + ". Esta ventaja solo cuenta los " + ELEGIDOS_POR_VOTO + " senadores elegidos por voto.";
    if (DESIGNADOS) {
      // Elegidos de PP, Vox y UPN = (ventaja + 208) / 2, porque los 208 se reparten entre ellos y el resto; con los designados de PP y Vox, la mayoría absoluta exige llegar a 134
      const designadosDeLaDerecha = (DESIGNADOS.por_partido.PP || 0) + (DESIGNADOS.por_partido.VOX || 0) + (DESIGNADOS.por_partido.UPN || 0);
      const necesarios = DESIGNADOS.mayoria_absoluta - designadosDeLaDerecha;
      const elegidos = (ventaja) => Math.round((ventaja + ELEGIDOS_POR_VOTO) / 2);
      texto += " Con los " + designadosDeLaDerecha + " designados de PP y Vox, la mayoría absoluta del Senado (" + DESIGNADOS.mayoria_absoluta + " de " + DESIGNADOS.total_senado + ") exige " + necesarios +
        " senadores elegidos a PP, Vox y UPN: su mediana es " + elegidos(v.mediana) + " (rango del 80 %: de " + elegidos(v.p10) + " a " + elegidos(v.p90) + "). Los " + DESIGNADOS.designados + " designados no dependen de las elecciones y están reconstruidos a partir de la prensa y de la composición del Senado.";
    }
    document.getElementById("senado-ventaja-nota").textContent = texto;
  }

  function pintarCircunscripcion() {
    const nombre = selectorCircunscripcion.value;
    const escenario = datos.escenarios[selectorEscenario.value];
    const distribucion = (escenario.circunscripciones || datos.circunscripciones)[nombre];
    if (!distribucion) { return; }
    const masProbable = (clave) => Math.max.apply(null, Object.keys(distribucion[clave]).map((n) => distribucion[clave][n]));
    const claves = Object.keys(distribucion).sort((a, b) => masProbable(b) - masProbable(a) || porOrden(a, b));
    const maximo = Math.max.apply(null, claves.map((clave) => Math.max.apply(null, Object.keys(distribucion[clave]).map(Number))));
    let cabecera = "<tr><th>Partido</th>";
    for (let n = 0; n <= maximo; n++) { cabecera += "<th>" + n + (n === 1 ? " senador" : " senadores") + "</th>"; }
    document.querySelector("#tabla-circunscripcion-senado thead").innerHTML = cabecera + "</tr>";
    document.querySelector("#tabla-circunscripcion-senado tbody").innerHTML = claves.map((clave) => {
      const probabilidades = distribucion[clave];
      const suma = Object.keys(probabilidades).reduce((s, n) => s + probabilidades[n], 0);
      const modal = Object.keys(probabilidades).reduce((mejor, n) => (probabilidades[n] > (probabilidades[mejor] || 0) ? n : mejor), "1");
      let fila = '<tr><td><span class="ficha" style="background:' + colorDe(clave) + '"></span> ' + escapar(nombreCorto(clave)) + "</td>";
      for (let n = 0; n <= maximo; n++) {
        const p = n === 0 ? Math.max(0, 1 - suma) : (probabilidades[n] || 0);
        fila += "<td" + (String(n) === modal && n > 0 ? ' class="senado-modal"' : "") + ">" + (p >= 0.005 ? porcentaje(p) : "–") + "</td>";
      }
      return fila + "</tr>";
    }).join("");
    document.getElementById("senado-circunscripcion-nota").textContent = "Probabilidad de que cada partido saque ese número de senadores en " + nombre + ", en el escenario elegido arriba. En negrita, el resultado más probable de cada partido.";
  }

  Object.keys(datos.escenarios).forEach((clave) => {
    const opcion = document.createElement("option");
    opcion.value = clave;
    opcion.textContent = datos.escenarios[clave].titulo;
    if (clave === datos.escenario_principal) { opcion.selected = true; }
    selectorEscenario.appendChild(opcion);
  });
  const nombres = Object.keys(datos.escenarios[datos.escenario_principal].circunscripciones || datos.circunscripciones);
  nombres.sort((a, b) => a.localeCompare(b, "es")).forEach((nombre) => {
    const opcion = document.createElement("option");
    opcion.value = nombre;
    opcion.textContent = nombre;
    selectorCircunscripcion.appendChild(opcion);
  });
  selectorEscenario.addEventListener("change", () => { pintarEscenario(); pintarCircunscripcion(); });
  selectorCircunscripcion.addEventListener("change", pintarCircunscripcion);
  pintarEscenario();
  pintarCircunscripcion();
})();
