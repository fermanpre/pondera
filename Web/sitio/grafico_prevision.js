"use strict";
/*
 * Gráficos de evolución de la previsión (escaños, mayorías, bloques, primera fuerza, partidos en el filo, escaños en el aire).
 * Usa SERIE_PREVISION (serie_prevision.js, generada por serie_prevision_diaria.py) y los NOMBRES y COLORES de assets/comun.js. SVG propio, sin librerías.
 * Los días sin datos (null) cortan la línea. Hasta SERIE_PREVISION.publicada_desde la serie es una reconstrucción con el modelo de hoy; se marca en el gráfico.
 */
(function () {
  const contenedor = document.getElementById("grafico-evolucion");
  if (!contenedor || typeof SERIE_PREVISION === "undefined") { return; }

  const S = SERIE_PREVISION;
  const MILISEGUNDOS_POR_DIA = 86400000;
  // Tramo proyectado (25/11/2026): la serie acaba con el último promedio publicable; PROYECCION_FINAL (proyeccion_final.js) es la previsión vigente, con la tendencia llevada al día
  // de la votación. Se añade como último punto, con los días intermedios vacíos, y se une en línea discontinua.
  const ultimoDiaReal = S.dias.length - 1;
  const proyeccion = typeof PROYECCION_FINAL !== "undefined" && PROYECCION_FINAL && PROYECCION_FINAL.desde === S.ultimo_dia ? PROYECCION_FINAL : null;
  if (proyeccion) {
    const diasNuevos = Math.round((Date.parse(proyeccion.fecha + "T00:00:00Z") - Date.parse(S.ultimo_dia + "T00:00:00Z")) / MILISEGUNDOS_POR_DIA);
    const huecos = new Array(diasNuevos - 1).fill(null);
    const ampliar = (columnas, final) => {
      if (Array.isArray(columnas)) { columnas.push(...huecos, final === undefined ? null : final); return; }
      Object.keys(columnas).forEach((clave) => ampliar(columnas[clave], final ? final[clave] : undefined));
    };
    ["central", "p10", "mediana", "p90", "al_menos_uno", "mayorias", "bloques", "primera_fuerza", "en_el_aire"].forEach((campo) => ampliar(S[campo], proyeccion[campo]));
    for (let n = 1; n <= diasNuevos; n += 1) {
      S.dias.push(new Date(Date.parse(S.ultimo_dia + "T00:00:00Z") + n * MILISEGUNDOS_POR_DIA).toISOString().slice(0, 10));
      S.hay_datos.push(n === diasNuevos);
    }
  }
  const dias = S.dias;
  const totalDias = dias.length;
  // Ajuste solo visual (25/11/2026): después del 21/11 casi no entra trabajo de campo nuevo y el promedio repite valor hasta el 23. La línea continua acaba el 21 y la discontinua va de ahí
  // al día de la votación; el punto final y el cálculo de la proyección no cambian.
  const indiceDelCampo = dias.indexOf("2026-11-21");
  const finDeLaContinua = proyeccion && indiceDelCampo >= 0 ? indiceDelCampo : ultimoDiaReal;
  const primerDia = Date.parse(S.primer_dia + "T00:00:00Z");
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MARGEN = { izquierda: 46, derecha: 14, arriba: 14, abajo: 28 };
  const MARCAS = [{ fecha: "2026-10-30", texto: "Ancla del CIS 3584" }];
  const COLOR_DE_GRUPO = { derecha: (typeof COLOR_DERECHA !== "undefined" ? COLOR_DERECHA : "#1d6fb8"), izquierda: (typeof COLOR_IZQUIERDA !== "undefined" ? COLOR_IZQUIERDA : "#d4141c"), otras: "#7a7a75" };
  const COLOR_DE_BLOQUE = { DERECHA: COLOR_DE_GRUPO.derecha, IZQUIERDA: COLOR_DE_GRUPO.izquierda, NACIONALISTAS: "#8e5bb5" };
  const NOMBRE_DE_BLOQUE = { DERECHA: "Derecha (PP, Vox, UPN)", IZQUIERDA: "Izquierda (PSOE, Frente Amplio, Podemos, FV, UPC)", NACIONALISTAS: "Nacionalistas (ERC, Junts, Bildu, PNV, BNG, CC)" };
  const NOMBRES_CORTOS = { SUMAR: "Frente Amplio", FV: "Front Valencià" };

  const formatoEntero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
  const formatoUnDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nombreDe = (id) => NOMBRES_CORTOS[id] || (typeof NOMBRES !== "undefined" && NOMBRES[id]) || id;
  const colorDe = (id) => (typeof COLORES !== "undefined" && COLORES[id]) || "#7a7a75";

  function fechaDelIndice(indice) { return new Date(primerDia + indice * MILISEGUNDOS_POR_DIA); }
  function textoDeFecha(indice) { const fecha = fechaDelIndice(indice); return fecha.getUTCDate() + " " + MESES[fecha.getUTCMonth()] + " " + fecha.getUTCFullYear(); }
  function indiceDeFecha(textoIso) { return Math.round((Date.parse(textoIso + "T00:00:00Z") - primerDia) / MILISEGUNDOS_POR_DIA); }
  const porcentaje = (probabilidad) => (probabilidad === null || probabilidad === undefined ? "–" : (probabilidad > 0 && probabilidad < 0.001 ? "< 0,1%" : formatoUnDecimal.format(100 * probabilidad) + "%"));
  // Igual, pero en el modo «x de cada y» del botón de la cabecera (el porcentaje exacto queda en el texto emergente)
  const probabilidadEnTexto = (probabilidad) => (probabilidad === null || probabilidad === undefined ? "–" : PROBABILIDAD.html(probabilidad, porcentaje(probabilidad)));

  /* ---------- Definición de cada gráfico: series, eje y selección de partidos ---------- */

  function partidosConEscanos() {
    return Object.keys(S.central).filter((id) => S.p90[id].some((valor) => valor !== null && valor >= 1));
  }

  const GRAFICOS = {
    escanos: {
      titulo: "Escaños por partido",
      identificadores: partidosConEscanos,
      seleccionInicial: ["PP", "PSOE", "VOX", "SUMAR", "PODEMOS"],
      admiteBanda: true,
      series(seleccion) {
        return seleccion.map((id) => ({ id, nombre: nombreDe(id), color: colorDe(id), valores: S.central[id], bajo: S.p10[id], alto: S.p90[id], formatear: (v) => formatoEntero.format(v) }));
      },
      eje: (visibles, banda) => ({ minimo: 0, maximo: Math.max(25, Math.ceil(maximoDe(visibles, banda ? "alto" : "valores") / 25) * 25), paso: 25, formatear: (v) => String(v) }),
      referencia: null,
      detalle: (serie, indice) => formatoEntero.format(serie.valores[indice]) + " <span class=\"nota\">(" + formatoEntero.format(serie.bajo[indice]) + "-" + formatoEntero.format(serie.alto[indice]) + ")</span>",
      nota: "Reparto central (sin ruido), el mismo de la barra de escaños, y entre paréntesis el rango del 80% de las simulaciones.",
    },
    mayorias: {
      titulo: "Probabilidad de mayoría",
      identificadores: () => S.combinaciones.map((c) => c.id),
      seleccionInicial: ["pp_vox", "derecha_ampliada", "bloque_2023_sin_junts", "bloque_2023_completo"],
      nombreDe: (id) => S.combinaciones.find((c) => c.id === id).nombre,
      series(seleccion) {
        const contadores = { derecha: 0, izquierda: 0, otras: 0 };
        return seleccion.map((id) => {
          const combinacion = S.combinaciones.find((c) => c.id === id);
          const orden = contadores[combinacion.grupo]++;
          return { id, nombre: combinacion.nombre, color: COLOR_DE_GRUPO[combinacion.grupo], trazo: ["", "6 3", "2 3", "8 3 2 3"][orden % 4], valores: S.mayorias[id], formatear: porcentaje };
        });
      },
      eje: () => ({ minimo: 0, maximo: 1, paso: 0.2, formatear: (v) => PROBABILIDAD.plano(v, Math.round(100 * v) + "%") }),
      referencia: null,
      detalle: (serie, indice) => probabilidadEnTexto(serie.valores[indice]),
      nota: "Porcentaje de simulaciones en que la combinación suma 176 escaños o más (las mismas combinaciones que en «Probabilidad de mayoría absoluta»).",
    },
    bloques: {
      titulo: "Escaños por bloque",
      identificadores: () => Object.keys(S.bloques),
      seleccionInicial: ["DERECHA", "IZQUIERDA", "NACIONALISTAS"],
      nombreDe: (id) => NOMBRE_DE_BLOQUE[id] || id,
      admiteBanda: true,
      series(seleccion) {
        return seleccion.map((id) => ({ id, nombre: NOMBRE_DE_BLOQUE[id] || id, color: COLOR_DE_BLOQUE[id], valores: S.bloques[id].central, bajo: S.bloques[id].p10, alto: S.bloques[id].p90, formatear: (v) => formatoEntero.format(v) }));
      },
      eje: (visibles, banda) => ({ minimo: 0, maximo: Math.max(176, Math.ceil(maximoDe(visibles, banda ? "alto" : "valores") / 25) * 25), paso: 25, formatear: (v) => String(v) }),
      referencia: { valor: S.mayoria_absoluta, texto: "Mayoría absoluta: " + S.mayoria_absoluta },
      detalle: (serie, indice) => formatoEntero.format(serie.valores[indice]) + " <span class=\"nota\">(" + formatoEntero.format(serie.bajo[indice]) + "-" + formatoEntero.format(serie.alto[indice]) + ")</span>",
      nota: "Escaños del reparto central y, entre paréntesis, rango del 80% de las simulaciones. Derecha = PP, Vox y UPN; izquierda = PSOE, Frente Amplio, Podemos, FV y UPC; nacionalistas = ERC, Junts, Bildu, PNV, BNG y CC.",
    },
    primera: {
      titulo: "Primera fuerza",
      identificadores: () => ["PP", "PSOE", "empate", "otro"],
      seleccionInicial: ["PP", "PSOE", "empate"],
      nombreDe: (id) => ({ PP: "PP (con UPN)", PSOE: "PSOE", empate: "Empate", otro: "Vox" })[id],
      conmutador: [["escanos", "En escaños"], ["voto", "En voto"]],
      series(seleccion, estado) {
        const datos = S.primera_fuerza[estado.base];
        const color = { PP: colorDe("PP"), PSOE: colorDe("PSOE"), empate: "#7a7a75", otro: colorDe("VOX") };
        const nombre = { PP: "PP (con UPN)", PSOE: "PSOE", empate: "Empate", otro: "Vox" };
        return seleccion.filter((id) => datos[id]).map((id) => ({ id, nombre: nombre[id], color: color[id], valores: datos[id], formatear: porcentaje }));
      },
      eje: () => ({ minimo: 0, maximo: 1, paso: 0.2, formatear: (v) => PROBABILIDAD.plano(v, Math.round(100 * v) + "%") }),
      referencia: null,
      detalle: (serie, indice) => probabilidadEnTexto(serie.valores[indice]),
      nota: "Probabilidad de que cada uno sea la primera fuerza: en escaños, quien tiene más diputados; en voto, quien saca más porcentaje en el voto nacional simulado. El PP se cuenta con UPN, como en el resto de la página.",
    },
    alMenosUno: {
      titulo: "Al menos un escaño",
      identificadores: () => Object.keys(S.al_menos_uno),
      seleccionInicial: ["PODEMOS", "UPC", "CC", "FV", "EXISTE", "UPN"],
      series(seleccion) {
        return seleccion.map((id) => ({ id, nombre: nombreDe(id), color: colorDe(id), valores: S.al_menos_uno[id], formatear: porcentaje }));
      },
      eje: () => ({ minimo: 0, maximo: 1, paso: 0.2, formatear: (v) => PROBABILIDAD.plano(v, Math.round(100 * v) + "%") }),
      referencia: null,
      detalle: (serie, indice) => probabilidadEnTexto(serie.valores[indice]),
      nota: "Probabilidad de que el partido obtenga al menos un diputado en el conjunto de España (partidos en el filo o con pocos escaños).",
    },
    aire: {
      titulo: "Escaños en el aire",
      identificadores: () => [],
      seleccionInicial: [],
      series() { return [{ id: "aire", nombre: "Escaños en el aire", color: colorDe("PSOE"), valores: S.en_el_aire, formatear: (v) => formatoEntero.format(v) }]; },
      eje: (visibles) => ({ minimo: 0, maximo: Math.max(10, Math.ceil(maximoDe(visibles, "valores") / 10) * 10), paso: 10, formatear: (v) => String(v) }),
      referencia: null,
      detalle: (serie, indice) => formatoEntero.format(serie.valores[indice]),
      nota: "Escaños (partido por provincia) que se obtienen en entre el 20% y el 80% de las simulaciones. Cuanto más alto, más incierto es el reparto.",
    },
  };

  const estado = { grafico: "escanos", rango: "sep", banda: false, base: "escanos", indiceMarcado: totalDias - 1, seleccion: {} };
  Object.keys(GRAFICOS).forEach((clave) => { estado.seleccion[clave] = new Set(GRAFICOS[clave].seleccionInicial.filter((id) => GRAFICOS[clave].identificadores().indexOf(id) >= 0)); });

  function maximoDe(series, campo) {
    let maximo = 0;
    series.forEach((serie) => serie[campo].forEach((valor) => { if (valor !== null && valor > maximo) { maximo = valor; } }));
    return maximo;
  }

  function indicesVisibles() {
    const ultimo = totalDias - 1;
    if (estado.rango === "30") { return [Math.max(0, ultimo - 30), ultimo]; }
    if (estado.rango === "sep") { return [Math.min(ultimo - 1, Math.max(0, indiceDeFecha("2026-09-01"))), ultimo]; }
    return [0, ultimo];
  }

  function marcasDelEjeX(desde, hasta) {
    const marcas = [];
    const semanal = hasta - desde <= 45;
    for (let indice = desde; indice <= hasta; indice += 1) {
      const fecha = fechaDelIndice(indice);
      const dia = fecha.getUTCDate();
      if (semanal ? (indice - desde) % 7 === 0 : dia === 1) { marcas.push({ indice, texto: dia + " " + MESES[fecha.getUTCMonth()] }); }
    }
    return marcas;
  }

  function seriesVisibles() {
    const definicion = GRAFICOS[estado.grafico];
    const seleccion = definicion.identificadores().filter((id) => estado.seleccion[estado.grafico].has(id));
    return definicion.series(estado.grafico === "aire" ? [] : seleccion, estado);
  }

  function dibujar() {
    const definicion = GRAFICOS[estado.grafico];
    const anchura = Math.max(320, contenedor.clientWidth);
    const altura = anchura < 600 ? 300 : (anchura > 1300 ? 480 : 380);
    const [desde, hasta] = indicesVisibles();
    const visibles = seriesVisibles();
    const conBanda = definicion.admiteBanda && estado.banda;
    const eje = definicion.eje(visibles, conBanda);
    // Margen izquierdo a la medida de la etiqueta más larga del eje («4 de cada 5» ocupa más que «80%»)
    let etiquetaMasLarga = 0;
    for (let valor = eje.minimo; valor <= eje.maximo + 1e-9; valor += eje.paso) { etiquetaMasLarga = Math.max(etiquetaMasLarga, String(eje.formatear(valor)).length); }
    MARGEN.izquierda = Math.max(46, Math.ceil(etiquetaMasLarga * 6.4) + 14);
    const ancho = anchura - MARGEN.izquierda - MARGEN.derecha;
    const alto = altura - MARGEN.arriba - MARGEN.abajo;
    const x = (indice) => MARGEN.izquierda + ((indice - desde) / Math.max(1, hasta - desde)) * ancho;
    const y = (valor) => MARGEN.arriba + alto - ((valor - eje.minimo) / (eje.maximo - eje.minimo)) * alto;

    let svg = '<svg viewBox="0 0 ' + anchura + " " + altura + '" width="' + anchura + '" height="' + altura + '" role="img" aria-label="' + definicion.titulo + '">';
    // Tramo reconstruido: antes de «publicada_desde» (o toda la serie si todavía no hay previsión publicada)
    const finDeLaReconstruccion = S.publicada_desde ? indiceDeFecha(S.publicada_desde) : totalDias;
    if (finDeLaReconstruccion > desde) {
      const xFin = x(Math.min(finDeLaReconstruccion, hasta));
      svg += '<rect x="' + MARGEN.izquierda + '" y="' + MARGEN.arriba + '" width="' + Math.max(0, xFin - MARGEN.izquierda) + '" height="' + alto + '" fill="var(--suave)" fill-opacity="0.07" />';
      svg += '<text x="' + (MARGEN.izquierda + 6) + '" y="' + (MARGEN.arriba + 22) + '" font-size="11" fill="var(--suave)">Reconstrucción con el modelo actual</text>';
    }
    for (let valor = eje.minimo; valor <= eje.maximo + 1e-9; valor += eje.paso) {
      svg += '<line x1="' + MARGEN.izquierda + '" x2="' + (anchura - MARGEN.derecha) + '" y1="' + y(valor) + '" y2="' + y(valor) + '" stroke="var(--linea)" />';
      svg += '<text x="' + (MARGEN.izquierda - 6) + '" y="' + (y(valor) + 4) + '" text-anchor="end" font-size="11" fill="var(--suave)">' + eje.formatear(valor) + "</text>";
    }
    marcasDelEjeX(desde, hasta).forEach((marca) => {
      svg += '<text x="' + x(marca.indice) + '" y="' + (altura - 8) + '" text-anchor="middle" font-size="11" fill="var(--suave)">' + marca.texto + "</text>";
    });
    MARCAS.concat(S.publicada_desde ? [{ fecha: S.publicada_desde, texto: "Previsión publicada" }] : []).forEach((marca) => {
      const indice = indiceDeFecha(marca.fecha);
      if (indice > desde && indice < hasta) {
        svg += '<line x1="' + x(indice) + '" x2="' + x(indice) + '" y1="' + MARGEN.arriba + '" y2="' + (MARGEN.arriba + alto) + '" stroke="var(--suave)" stroke-dasharray="4 3" />';
        const aLaDerecha = x(indice) > anchura * 0.62;
        svg += '<text x="' + (x(indice) + (aLaDerecha ? -4 : 4)) + '" y="' + (MARGEN.arriba + 10) + '" text-anchor="' + (aLaDerecha ? "end" : "start") + '" font-size="11" fill="var(--suave)">' + marca.texto + "</text>";
      }
    });
    if (definicion.referencia) {
      svg += '<line x1="' + MARGEN.izquierda + '" x2="' + (anchura - MARGEN.derecha) + '" y1="' + y(definicion.referencia.valor) + '" y2="' + y(definicion.referencia.valor) + '" stroke="var(--texto)" stroke-opacity="0.55" stroke-dasharray="6 4" />';
      svg += '<text x="' + (anchura - MARGEN.derecha - 4) + '" y="' + (y(definicion.referencia.valor) - 4) + '" text-anchor="end" font-size="11" fill="var(--texto)">' + definicion.referencia.texto + "</text>";
    }
    if (conBanda) {
      visibles.forEach((serie) => {
        let arriba = "", abajo = "", puntos = 0;
        for (let indice = desde; indice <= hasta; indice += 1) {
          if (serie.alto[indice] === null) { continue; }
          arriba += (puntos ? "L" : "M") + x(indice).toFixed(1) + " " + y(serie.alto[indice]).toFixed(1) + " ";
          abajo = "L" + x(indice).toFixed(1) + " " + y(serie.bajo[indice]).toFixed(1) + " " + abajo;
          puntos += 1;
        }
        if (puntos > 1) { svg += '<path d="' + arriba + abajo + 'Z" fill="' + serie.color + '" fill-opacity="0.14" stroke="none" />'; }
      });
    }
    visibles.forEach((serie) => {
      let trazo = "", enTramo = false;
      for (let indice = desde; indice <= hasta; indice += 1) {
        const valor = proyeccion && indice > finDeLaContinua && indice <= ultimoDiaReal ? null : serie.valores[indice];
        if (valor === null) { enTramo = false; continue; }
        trazo += (enTramo ? "L" : "M") + x(indice).toFixed(1) + " " + y(valor).toFixed(1) + " ";
        enTramo = true;
      }
      svg += '<path d="' + trazo + '" fill="none" stroke="' + serie.color + '" stroke-width="2" stroke-linejoin="round"' + (serie.trazo ? ' stroke-dasharray="' + serie.trazo + '"' : "") + " />";
      const antes = serie.valores[finDeLaContinua];
      const despues = serie.valores[totalDias - 1];
      if (proyeccion && hasta === totalDias - 1 && antes !== null && despues !== null && despues !== undefined) {
        svg += '<line x1="' + x(finDeLaContinua) + '" y1="' + y(antes) + '" x2="' + x(hasta) + '" y2="' + y(despues) + '" stroke="' + serie.color + '" stroke-width="2.5" stroke-dasharray="3 3" />';
        svg += '<circle cx="' + x(hasta) + '" cy="' + y(despues) + '" r="3" fill="' + serie.color + '" />';
      }
    });
    if (proyeccion && hasta === totalDias - 1) {
      svg += '<rect x="' + x(finDeLaContinua) + '" y="' + MARGEN.arriba + '" width="' + (x(hasta) - x(finDeLaContinua)) + '" height="' + alto + '" fill="var(--suave)" fill-opacity="0.12" />';
      // En pantallas estrechas el rótulo pisaría los de las marcas: queda la zona sombreada y la nota de debajo
      if (anchura >= 600) { svg += '<text x="' + x(hasta) + '" y="' + (MARGEN.arriba + 10) + '" text-anchor="end" font-size="11" font-weight="600" fill="var(--texto)">Proyección al 29</text>'; }
    }
    if (estado.indiceMarcado >= desde && estado.indiceMarcado <= hasta) {
      svg += '<line x1="' + x(estado.indiceMarcado) + '" x2="' + x(estado.indiceMarcado) + '" y1="' + MARGEN.arriba + '" y2="' + (MARGEN.arriba + alto) + '" stroke="var(--texto)" stroke-opacity="0.5" />';
      visibles.forEach((serie) => {
        const valor = serie.valores[estado.indiceMarcado];
        if (valor !== null) { svg += '<circle cx="' + x(estado.indiceMarcado) + '" cy="' + y(valor) + '" r="3.5" fill="' + serie.color + '" />'; }
      });
    }
    svg += '<rect id="zona-puntero-evolucion" x="' + MARGEN.izquierda + '" y="' + MARGEN.arriba + '" width="' + ancho + '" height="' + alto + '" fill="transparent" style="touch-action:pan-y" />';
    svg += "</svg>";
    contenedor.innerHTML = svg;

    const zona = document.getElementById("zona-puntero-evolucion");
    const mover = (suceso) => {
      const caja = zona.getBoundingClientRect();
      const fraccion = Math.min(1, Math.max(0, (suceso.clientX - caja.left) / caja.width));
      estado.indiceMarcado = Math.round(desde + fraccion * (hasta - desde));
      if (proyeccion && estado.indiceMarcado > finDeLaContinua) { estado.indiceMarcado = totalDias - 1; }
      dibujar();
    };
    zona.addEventListener("pointermove", mover);
    zona.addEventListener("pointerdown", mover);
    pintarDetalle(visibles);
  }

  function pintarDetalle(visibles) {
    const definicion = GRAFICOS[estado.grafico];
    const indice = estado.indiceMarcado;
    const hayDatos = S.hay_datos[indice];
    let texto = "<b>" + textoDeFecha(indice) + "</b>" + (proyeccion && indice > ultimoDiaReal ? " · proyección de la tendencia (previsión actual)" : (S.publicada_desde && dias[indice] >= S.publicada_desde ? " · previsión publicada" : " · reconstrucción"));
    if (!hayDatos) {
      texto += ": sin datos ese día (ninguna encuesta en la ventana del promedio).";
    } else {
      const filas = visibles.filter((serie) => serie.valores[indice] !== null && serie.valores[indice] !== undefined)
        .sort((a, b) => b.valores[indice] - a.valores[indice]);
      texto += '<div class="valores-promedio">' + filas.map((serie) =>
        '<span><span class="ficha" style="background:' + serie.color + '"></span>' + serie.nombre + " <b>" + definicion.detalle(serie, indice) + "</b></span>").join("") + "</div>";
    }
    document.getElementById("detalle-evolucion").innerHTML = texto;
  }

  function pintarControles() {
    const definicion = GRAFICOS[estado.grafico];
    document.querySelectorAll("#pestanas-evolucion button").forEach((boton) => boton.classList.toggle("activo", boton.dataset.grafico === estado.grafico));
    document.querySelectorAll("#rangos-evolucion button").forEach((boton) => boton.classList.toggle("activo", boton.dataset.rango === estado.rango));

    const opciones = document.getElementById("opciones-evolucion");
    opciones.innerHTML = "";
    if (definicion.admiteBanda) {
      const etiqueta = document.createElement("label");
      const casilla = document.createElement("input");
      casilla.type = "checkbox";
      casilla.checked = estado.banda;
      casilla.addEventListener("change", () => { estado.banda = casilla.checked; dibujar(); });
      etiqueta.appendChild(casilla);
      etiqueta.appendChild(document.createTextNode(" Banda del 80%"));
      opciones.appendChild(etiqueta);
    }
    if (definicion.conmutador) {
      definicion.conmutador.forEach(([clave, texto]) => {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.textContent = texto;
        boton.classList.toggle("activo", estado.base === clave);
        boton.addEventListener("click", () => { estado.base = clave; pintarControles(); dibujar(); });
        opciones.appendChild(boton);
      });
    }

    const partidos = document.getElementById("partidos-evolucion");
    partidos.innerHTML = "";
    definicion.identificadores().forEach((id) => {
      const etiqueta = document.createElement("label");
      etiqueta.className = "casilla-partido";
      const casilla = document.createElement("input");
      casilla.type = "checkbox";
      casilla.checked = estado.seleccion[estado.grafico].has(id);
      casilla.addEventListener("change", () => {
        if (casilla.checked) { estado.seleccion[estado.grafico].add(id); } else { estado.seleccion[estado.grafico].delete(id); }
        dibujar();
      });
      etiqueta.appendChild(casilla);
      const color = estado.grafico === "mayorias" ? COLOR_DE_GRUPO[S.combinaciones.find((c) => c.id === id).grupo]
        : (estado.grafico === "bloques" ? COLOR_DE_BLOQUE[id] : (estado.grafico === "primera" ? ({ PP: colorDe("PP"), PSOE: colorDe("PSOE"), empate: "#7a7a75", otro: colorDe("VOX") })[id] : colorDe(id)));
      const nombre = definicion.nombreDe ? definicion.nombreDe(id) : nombreDe(id);
      etiqueta.insertAdjacentHTML("beforeend", ' <span class="ficha" style="background:' + color + '"></span>' + nombre);
      partidos.appendChild(etiqueta);
    });
    document.getElementById("nota-evolucion").textContent = definicion.nota +
      (proyeccion ? " En línea discontinua, la proyección de la tendencia de la última semana hasta el día de la votación: el punto final es la previsión actual. La línea discontinua se dibuja desde el 21/11, último día con trabajo de campo nuevo." : "") +
      (S.ultimo_dia >= "2026-11-23" ? " Serie congelada: la ley electoral prohíbe publicar sondeos en los cinco días previos a la votación." : "");
  }

  function construirPestanasYRangos() {
    const pestanas = document.getElementById("pestanas-evolucion");
    Object.keys(GRAFICOS).forEach((clave) => {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.setAttribute("role", "tab");
      boton.textContent = GRAFICOS[clave].titulo;
      boton.dataset.grafico = clave;
      boton.addEventListener("click", () => { estado.grafico = clave; pintarControles(); dibujar(); });
      pestanas.appendChild(boton);
    });
    const rangos = document.getElementById("rangos-evolucion");
    [["todo", "Desde julio"], ["sep", "Desde septiembre"], ["30", "30 días"]].forEach(([clave, etiqueta]) => {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.textContent = etiqueta;
      boton.dataset.rango = clave;
      boton.addEventListener("click", () => { estado.rango = clave; pintarControles(); dibujar(); });
      rangos.appendChild(boton);
    });
  }

  construirPestanasYRangos();
  pintarControles();
  dibujar();
  PROBABILIDAD.alCambiar(dibujar);
  let temporizadorDeCambioDeTamano = null;
  window.addEventListener("resize", () => { clearTimeout(temporizadorDeCambioDeTamano); temporizadorDeCambioDeTamano = setTimeout(dibujar, 120); });
})();
