"use strict";
/*
 * Gráfico del promedio diario de encuestas. Usa SERIE_PROMEDIO (serie_promedio.js) y los NOMBRES y COLORES de index.html.
 * SVG propio, sin librerías. Los días sin promedio (null) cortan la línea; no se interpola.
 */
(function () {
  const contenedor = document.getElementById("grafico-promedio");
  if (!contenedor || typeof SERIE_PROMEDIO === "undefined") { return; }

  // Nombre del partido en la serie (tal como sale de Wikipedia) -> identificador del modelo
  const IDENTIFICADOR_DE_SERIE = {
    PP: "PP", PSOE: "PSOE", Vox: "VOX", Sumar: "SUMAR_ANTIGUO", FA: "SUMAR", Podemos: "PODEMOS", ERC: "ERC", Junts: "JUNTS", "EH Bildu": "BILDU", PNV: "PNV", BNG: "BNG",
    SALF: "SALF", CCa: "CC", UPN: "UPN", "Adelante Andalucía": "ADELANTE", FV: "FV", FA_total: "SUMAR_TOTAL", UPC: "UPC",
  };
  COLORES.SUMAR_TOTAL = COLORES.SUMAR;  // la línea del total homogéneo (FA + FV + UPC) lleva el color del Frente Amplio, punteada
  const SELECCION_INICIAL = ["PP", "PSOE", "VOX", "SUMAR_ANTIGUO", "SUMAR", "SUMAR_TOTAL", "UPC", "PODEMOS", "SALF"];
  const NOMBRES_EN_GRAFICO = { SUMAR: "Frente Amplio", SUMAR_ANTIGUO: "Sumar", FV: "Front Valencià", SUMAR_TOTAL: "FA + FV + UPC (total)", UPC: "Unidad del Pueblo Canario (estimada)" };
  // Orden de las columnas de partido en la tabla de encuestas: por su resultado en las generales de 2023 (Frente Amplio, que sucede a Sumar, va justo detrás); los que no tuvieron resultado propio, al final
  const ORDEN_POR_2023 = ["PP", "PSOE", "VOX", "SUMAR_ANTIGUO", "SUMAR", "ERC", "JUNTS", "BILDU", "PNV", "BNG", "CC", "UPN", "ADELANTE", "PODEMOS", "SALF", "FV"];
  // Columnas de la tabla de encuestas del día: Sumar y Frente Amplio fusionadas en una (aunque no sean exactamente lo mismo) y Front Valencià justo a su derecha
  const COLUMNAS_DE_LA_TABLA = ["PP", "PSOE", "VOX", "SUMAR", "FV", "PODEMOS", "SALF", "ERC", "JUNTS", "BILDU", "PNV", "BNG", "CC", "UPN", "ADELANTE"];
  const NOMBRE_DE_COLUMNA = { SUMAR: "Sumar / Frente Amplio" };
  const conMiles = (numero) => String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const posicionEn2023 = (id) => { const posicion = ORDEN_POR_2023.indexOf(id); return posicion < 0 ? ORDEN_POR_2023.length : posicion; };
  const ELECCIONES_MARCADAS = [{ fecha: "2024-06-09", texto: "Europeas" }];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MARGEN = { izquierda: 40, derecha: 12, arriba: 12, abajo: 28 };
  const MILISEGUNDOS_POR_DIA = 86400000;

  const primerDia = Date.parse(SERIE_PROMEDIO.primer_dia + "T00:00:00Z");
  const totalDias = SERIE_PROMEDIO.dias;
  const series = Object.keys(SERIE_PROMEDIO.partidos)
    .filter((nombre) => IDENTIFICADOR_DE_SERIE[nombre])
    .map((nombre) => ({ id: IDENTIFICADOR_DE_SERIE[nombre], nombre: nombre, valores: SERIE_PROMEDIO.partidos[nombre] }))
    .filter((serie) => serie.valores.some((valor) => valor !== null));

  const estado = { seleccion: new Set(SELECCION_INICIAL), rango: "todo", indiceMarcado: totalDias - 1, orden: { columna: "peso", descendente: true } };

  const formato = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nombreDe = (id) => NOMBRES_EN_GRAFICO[id] || NOMBRES[id] || id;

  function fechaDelIndice(indice) { return new Date(primerDia + indice * MILISEGUNDOS_POR_DIA); }
  function textoDeFecha(indice) {
    const fecha = fechaDelIndice(indice);
    return fecha.getUTCDate() + " " + MESES[fecha.getUTCMonth()] + " " + fecha.getUTCFullYear();
  }
  function indiceDeFecha(textoIso) { return Math.round((Date.parse(textoIso + "T00:00:00Z") - primerDia) / MILISEGUNDOS_POR_DIA); }

  function indicesVisibles() {
    const ultimo = totalDias - 1;
    if (estado.rango === "90") { return [Math.max(0, ultimo - 90), ultimo]; }
    if (estado.rango === "365") { return [Math.max(0, ultimo - 365), ultimo]; }
    return [0, ultimo];
  }

  function marcasDelEjeX(desde, hasta) {
    const salto = estado.rango === "90" ? 1 : (estado.rango === "365" ? 3 : 6);
    const marcas = [];
    for (let indice = desde; indice <= hasta; indice += 1) {
      const fecha = fechaDelIndice(indice);
      if (fecha.getUTCDate() === 1 && fecha.getUTCMonth() % salto === 0) {
        marcas.push({ indice, texto: MESES[fecha.getUTCMonth()] + " " + String(fecha.getUTCFullYear()).slice(2) });
      }
    }
    return marcas;
  }

  function dibujar() {
    const anchura = Math.max(320, contenedor.clientWidth);
    const altura = anchura < 600 ? 300 : (anchura > 1300 ? 500 : 380);
    const [desde, hasta] = indicesVisibles();
    const visibles = series.filter((serie) => estado.seleccion.has(serie.id));
    let maximo = 5;
    visibles.forEach((serie) => {
      for (let indice = desde; indice <= hasta; indice += 1) {
        if (serie.valores[indice] !== null && serie.valores[indice] > maximo) { maximo = serie.valores[indice]; }
      }
    });
    maximo = Math.ceil(maximo / 5) * 5;
    const ancho = anchura - MARGEN.izquierda - MARGEN.derecha;
    const alto = altura - MARGEN.arriba - MARGEN.abajo;
    const x = (indice) => MARGEN.izquierda + ((indice - desde) / Math.max(1, hasta - desde)) * ancho;
    const y = (valor) => MARGEN.arriba + alto - (valor / maximo) * alto;

    let svg = '<svg viewBox="0 0 ' + anchura + " " + altura + '" width="' + anchura + '" height="' + altura + '" role="img" aria-label="Evolución del promedio de encuestas">';
    for (let valor = 0; valor <= maximo; valor += 5) {
      svg += '<line x1="' + MARGEN.izquierda + '" x2="' + (anchura - MARGEN.derecha) + '" y1="' + y(valor) + '" y2="' + y(valor) + '" stroke="var(--linea)" />';
      svg += '<text x="' + (MARGEN.izquierda - 6) + '" y="' + (y(valor) + 4) + '" text-anchor="end" font-size="11" fill="var(--suave)">' + valor + "%</text>";
    }
    marcasDelEjeX(desde, hasta).forEach((marca) => {
      svg += '<text x="' + x(marca.indice) + '" y="' + (altura - 8) + '" text-anchor="middle" font-size="11" fill="var(--suave)">' + marca.texto + "</text>";
    });
    ELECCIONES_MARCADAS.forEach((eleccion) => {
      const indice = indiceDeFecha(eleccion.fecha);
      if (indice > desde && indice < hasta) {
        svg += '<line x1="' + x(indice) + '" x2="' + x(indice) + '" y1="' + MARGEN.arriba + '" y2="' + (MARGEN.arriba + alto) + '" stroke="var(--suave)" stroke-dasharray="4 3" />';
        svg += '<text x="' + (x(indice) + 4) + '" y="' + (MARGEN.arriba + 10) + '" font-size="11" fill="var(--suave)">' + eleccion.texto + "</text>";
      }
    });
    visibles.forEach((serie) => {
      let trazo = "";
      let enTramo = false;
      for (let indice = desde; indice <= hasta; indice += 1) {
        const valor = serie.valores[indice];
        if (valor === null) { enTramo = false; continue; }
        trazo += (enTramo ? "L" : "M") + x(indice).toFixed(1) + " " + y(valor).toFixed(1) + " ";
        enTramo = true;
      }
      svg += '<path d="' + trazo + '" fill="none" stroke="' + COLORES[serie.id] + '" stroke-width="2" stroke-linejoin="round"' + (serie.id === "SUMAR_TOTAL" ? ' stroke-dasharray="2 4" stroke-linecap="round"' : "") + " />";
    });
    if (estado.indiceMarcado >= desde && estado.indiceMarcado <= hasta) {
      svg += '<line x1="' + x(estado.indiceMarcado) + '" x2="' + x(estado.indiceMarcado) + '" y1="' + MARGEN.arriba + '" y2="' + (MARGEN.arriba + alto) + '" stroke="var(--texto)" stroke-opacity="0.5" />';
      visibles.forEach((serie) => {
        const valor = serie.valores[estado.indiceMarcado];
        if (valor !== null) { svg += '<circle cx="' + x(estado.indiceMarcado) + '" cy="' + y(valor) + '" r="3.5" fill="' + COLORES[serie.id] + '" />'; }
      });
    }
    svg += '<rect id="zona-puntero" x="' + MARGEN.izquierda + '" y="' + MARGEN.arriba + '" width="' + ancho + '" height="' + alto + '" fill="transparent" style="touch-action:pan-y" />';
    svg += "</svg>";
    contenedor.innerHTML = svg;

    const zona = document.getElementById("zona-puntero");
    const mover = (suceso) => {
      const caja = zona.getBoundingClientRect();
      const fraccion = Math.min(1, Math.max(0, (suceso.clientX - caja.left) / caja.width));
      estado.indiceMarcado = Math.round(desde + fraccion * (hasta - desde));
      dibujar();
    };
    zona.addEventListener("pointermove", mover);
    zona.addEventListener("pointerdown", mover);
    pintarDetalle();
  }

  function pintarDetalle() {
    const indice = estado.indiceMarcado;
    const encuestas = SERIE_PROMEDIO.encuestas_usadas[indice];
    const filas = series
      .filter((serie) => estado.seleccion.has(serie.id))
      .map((serie) => ({ id: serie.id, valor: serie.valores[indice] }))
      .filter((fila) => fila.valor !== null)
      .sort((a, b) => b.valor - a.valor);
    let texto = "<b>" + textoDeFecha(indice) + "</b> · " + encuestas + " encuestas en la ventana de 30 días";
    texto += '<div class="valores-promedio">' + filas.map((fila) =>
      '<span><span class="ficha" style="background:' + COLORES[fila.id] + '"></span>' + nombreDe(fila.id) + " <b>" + formato.format(fila.valor) + "%</b></span>").join("") + "</div>";
    document.getElementById("detalle-promedio").innerHTML = texto;
    pintarEncuestas();
  }

  /* Tabla de las encuestas que entran en el promedio del día marcado: encuestadora, campo, entrevistados, peso (parte del peso total del día)
     y el valor de cada partido seleccionado. Se puede ordenar pulsando en la cabecera. */
  function pintarEncuestas() {
    const tabla = document.getElementById("tabla-encuestas-dia");
    if (!tabla || typeof ENCUESTAS_PROMEDIO === "undefined") { return; }
    const indice = estado.indiceMarcado;
    const entradas = ENCUESTAS_PROMEDIO.dias[indice] || [];
    const pesoTotal = entradas.reduce((suma, par) => suma + par[1], 0);
    const filas = entradas.map((par) => {
      const encuesta = ENCUESTAS_PROMEDIO.encuestas[par[0]];
      return { encuesta: encuesta, pesoActual: par[1], peso: pesoTotal > 0 ? par[1] / pesoTotal : 0 };
    });

    // Valor de un partido en una encuesta; la columna fusionada toma Frente Amplio y, si la encuesta aún usa el nombre antiguo, Sumar
    const valorDeColumna = (encuesta, id) => {
      if (id === "SUMAR") { return encuesta.valores["FA"] !== undefined ? encuesta.valores["FA"] : encuesta.valores["Sumar"]; }
      const serie = series.find((candidata) => candidata.id === id);
      return serie ? encuesta.valores[serie.nombre] : undefined;
    };
    const columnasDePartido = COLUMNAS_DE_LA_TABLA.filter((id) => filas.some((fila) => valorDeColumna(fila.encuesta, id) !== undefined));

    const valorDeOrden = (fila) => {
      const columna = estado.orden.columna;
      if (columna === "firma") { return fila.encuesta.firma.toLowerCase(); }
      if (columna === "campo") { return fila.encuesta.fin; }
      if (columna === "muestra") { return fila.encuesta.muestra === null ? -1 : fila.encuesta.muestra; }
      if (columna === "peso") { return fila.peso; }
      if (columna === "actual") { return fila.pesoActual; }
      if (columna === "absoluto") { return fila.encuesta.absoluto; }
      const valor = valorDeColumna(fila.encuesta, columna);
      return valor === undefined ? -1 : valor;
    };
    filas.sort((a, b) => {
      const x = valorDeOrden(a), y = valorDeOrden(b);
      const comparacion = x < y ? -1 : (x > y ? 1 : 0);
      return estado.orden.descendente ? -comparacion : comparacion;
    });

    document.getElementById("resumen-encuestas-dia").textContent = filas.length
      ? textoDeFecha(indice) + ": " + filas.length + " encuestas con el día medio de campo en los 30 días anteriores o ya empezadas. Pulsa una cabecera para ordenar."
      : textoDeFecha(indice) + ": ninguna encuesta con el día medio de campo en los 30 días anteriores.";

    const cabeceras = [["firma", "Encuestadora"], ["campo", "Campo"], ["muestra", "Muestra"], ["absoluto", "Peso absoluto"], ["actual", "Peso actual"], ["peso", "Peso relativo"]]
      .concat(columnasDePartido.map((id) => [id, logoDePartido(id, NOMBRE_DE_COLUMNA[id] || nombreDe(id)) || nombreDe(id)]));
    const flecha = (columna) => (estado.orden.columna === columna ? (estado.orden.descendente ? " ▼" : " ▲") : "");
    tabla.querySelector("thead").innerHTML = "<tr>" + cabeceras.map((par) =>
      '<th data-columna="' + par[0] + '" style="cursor:pointer' + (par[0] === "firma" || par[0] === "campo" ? ";text-align:left" : "") + '">' + par[1] + flecha(par[0]) + "</th>").join("") + "</tr>";
    tabla.querySelectorAll("thead th").forEach((celda) => celda.addEventListener("click", () => {
      const columna = celda.dataset.columna;
      estado.orden = { columna: columna, descendente: estado.orden.columna === columna ? !estado.orden.descendente : columna !== "firma" && columna !== "campo" };
      pintarEncuestas();
    }));

    const formatoEntero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
    const formatoPeso = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    tabla.querySelector("tbody").innerHTML = filas.map((fila) => {
      const encuesta = fila.encuesta;
      const cliente = encuesta.cliente ? '<br><span class="nota">' + escaparHtml(encuesta.cliente) + "</span>" : "";
      const barra = '<span class="prob" style="width:' + Math.max(1, Math.round(34 * fila.peso / (filas[0] ? Math.max(...filas.map((f) => f.peso)) : 1))) + 'px"></span>';
      const celdasDePartidos = columnasDePartido.map((id) => {
        const valor = valorDeColumna(encuesta, id);
        return "<td>" + (valor === undefined ? "–" : formato.format(valor)) + "</td>";
      }).join("");
      return "<tr><td>" + escaparHtml(encuesta.firma) + cliente + '</td><td style="text-align:left">' + escaparHtml(encuesta.campo.replace(/\s\d{4}$/, "")) + "</td><td>" +
        (encuesta.muestra === null ? "–" : conMiles(encuesta.muestra)) + "</td><td>" + formatoPeso.format(encuesta.absoluto) + "</td><td>" + formatoPeso.format(fila.pesoActual) +
        "</td><td>" + barra + formato.format(100 * fila.peso) + "%</td>" + celdasDePartidos + "</tr>";
    }).join("");
  }

  function escaparHtml(texto) {
    return String(texto).replace(/[&<>"]/g, (letra) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[letra]));
  }

  function construirControles() {
    const botonesRango = document.getElementById("rangos-promedio");
    [["todo", "Todo"], ["365", "1 año"], ["90", "90 días"]].forEach(([clave, etiqueta]) => {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.textContent = etiqueta;
      boton.dataset.rango = clave;
      boton.addEventListener("click", () => { estado.rango = clave; marcarBotones(); dibujar(); });
      botonesRango.appendChild(boton);
    });
    const partidos = document.getElementById("partidos-promedio");
    series.forEach((serie) => {
      const etiqueta = document.createElement("label");
      etiqueta.className = "casilla-partido";
      const casilla = document.createElement("input");
      casilla.type = "checkbox";
      casilla.checked = estado.seleccion.has(serie.id);
      casilla.addEventListener("change", () => {
        if (casilla.checked) { estado.seleccion.add(serie.id); } else { estado.seleccion.delete(serie.id); }
        dibujar();
      });
      etiqueta.appendChild(casilla);
      etiqueta.insertAdjacentHTML("beforeend", ' <span class="ficha" style="background:' + COLORES[serie.id] + '"></span>' + nombreDe(serie.id));
      partidos.appendChild(etiqueta);
    });
    marcarBotones();
    document.getElementById("nota-promedio").textContent =
      "Cada encuesta cuenta desde el primer día de su trabajo de campo, pesa más en el día medio de ese campo y menos cuanto más se aleja de él. " +
      "La línea de Sumar se detiene el día en que empieza la de Frente Amplio, con las primeras encuestas que usan ese nombre. Frente Amplio es el partido solo: la línea punteada «FA + FV + UPC (total)» es el total homogéneo que se usa para comparar encuestas, porque algunas casas dan una sola cifra con el Frente Amplio, el Front Valencià y la Unidad del Pueblo Canario juntos y otras los separan; de ese total se descuentan la parte de Front Valencià (según las encuestas que lo publican aparte) y la de la UPC (según Sondeos/upc_en_encuestas.csv). " + SERIE_PROMEDIO.fuente +
      (SERIE_PROMEDIO.ultimo_dia >= SERIE_PROMEDIO.ultimo_dia_publicable ? " Serie congelada: la ley electoral prohíbe publicar sondeos en los cinco días previos a la votación." : "");
  }

  function marcarBotones() {
    document.querySelectorAll("#rangos-promedio button").forEach((boton) => boton.classList.toggle("activo", boton.dataset.rango === estado.rango));
  }

  // Fecha y hora de la última actualización de la serie, en hora de Madrid (el servidor la guarda en UTC)
  function mostrarUltimaActualizacion() {
    const elemento = document.getElementById("ultima-actualizacion");
    if (!elemento || !SERIE_PROMEDIO.generado) return;
    const instante = new Date(SERIE_PROMEDIO.generado.length > 16 ? SERIE_PROMEDIO.generado : SERIE_PROMEDIO.generado.replace(" ", "T") + "Z");
    if (isNaN(instante.getTime())) return;
    const texto = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(instante).replace(",", "");
    elemento.textContent = "Última actualización: " + texto + " (hora de Madrid)";
  }

  construirControles();
  dibujar();
  let temporizadorDeCambioDeTamano = null;
  window.addEventListener("resize", () => { clearTimeout(temporizadorDeCambioDeTamano); temporizadorDeCambioDeTamano = setTimeout(dibujar, 120); });
})();
