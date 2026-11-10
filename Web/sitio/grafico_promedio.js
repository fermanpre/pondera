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
    SALF: "SALF", CCa: "CC", UPN: "UPN", "Adelante Andalucía": "ADELANTE", FV: "FV",
  };
  const SELECCION_INICIAL = ["PP", "PSOE", "VOX", "SUMAR_ANTIGUO", "SUMAR", "PODEMOS", "SALF"];
  const NOMBRES_EN_GRAFICO = { SUMAR: "Frente Amplio", SUMAR_ANTIGUO: "Sumar", FV: "Front Valencià (incluido en Frente Amplio)" };
  const ELECCIONES_MARCADAS = [{ fecha: "2024-06-09", texto: "Europeas" }];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MARGEN = { izquierda: 40, derecha: 12, arriba: 12, abajo: 28 };
  const MILISEGUNDOS_POR_DIA = 86400000;

  const primerDia = Date.parse(SERIE_PROMEDIO.primer_dia + "T00:00:00Z");
  const totalDias = SERIE_PROMEDIO.dias;
  const series = Object.keys(SERIE_PROMEDIO.partidos)
    .filter((nombre) => IDENTIFICADOR_DE_SERIE[nombre])
    .map((nombre) => ({ id: IDENTIFICADOR_DE_SERIE[nombre], valores: SERIE_PROMEDIO.partidos[nombre] }))
    .filter((serie) => serie.valores.some((valor) => valor !== null));

  const estado = { seleccion: new Set(SELECCION_INICIAL), rango: "todo", indiceMarcado: totalDias - 1 };

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
    const altura = anchura < 600 ? 300 : 380;
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
      svg += '<text x="' + (MARGEN.izquierda - 6) + '" y="' + (y(valor) + 4) + '" text-anchor="end" font-size="11" fill="var(--suave)">' + valor + " %</text>";
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
      svg += '<path d="' + trazo + '" fill="none" stroke="' + COLORES[serie.id] + '" stroke-width="2" stroke-linejoin="round" />';
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
      '<span><span class="ficha" style="background:' + COLORES[fila.id] + '"></span>' + nombreDe(fila.id) + " <b>" + formato.format(fila.valor) + " %</b></span>").join("") + "</div>";
    document.getElementById("detalle-promedio").innerHTML = texto;
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
      "Actualizado el " + SERIE_PROMEDIO.generado + ". Cada día se calcula solo con las encuestas cuyo trabajo de campo había terminado ese día. " +
      "La línea de Sumar se traza mientras haya encuestas que usen ese nombre y la de Frente Amplio empieza con las primeras que lo incluyen; Frente Amplio suma Front Valencià cuando la encuesta los separa. " + SERIE_PROMEDIO.fuente +
      (SERIE_PROMEDIO.ultimo_dia >= SERIE_PROMEDIO.ultimo_dia_publicable ? " Serie congelada: la ley electoral prohíbe publicar sondeos en los cinco días previos a la votación." : "");
  }

  function marcarBotones() {
    document.querySelectorAll("#rangos-promedio button").forEach((boton) => boton.classList.toggle("activo", boton.dataset.rango === estado.rango));
  }

  construirControles();
  dibujar();
  let temporizadorDeCambioDeTamano = null;
  window.addEventListener("resize", () => { clearTimeout(temporizadorDeCambioDeTamano); temporizadorDeCambioDeTamano = setTimeout(dibujar, 120); });
})();
