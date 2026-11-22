"use strict";
/*
 * Escaños en juego y voto útil de la provincia elegida en el selector de la página de provincias.
 * Usa VOTO_UTIL (voto_util.js, que genera voto_util_provincias.js con las mismas 10.000 simulaciones que ve el visitante), `modelo` de app_prevision.js y NOMBRES, COLORES y logoDePartido de comun.js.
 * Cuadrados: los escaños casi decididos (con el color de su partido) y los que están en el aire («?»). Barras: cuánto vale un voto a cada partido frente al voto medio en España.
 */
(function () {
  const selector = document.getElementById("selector-provincia");
  const contenedor = document.getElementById("voto-util");
  if (!selector || !contenedor || typeof VOTO_UTIL === "undefined" || typeof modelo === "undefined") { return; }

  const GRUPOS = [
    { clave: "izquierda", titulo: "Si votas a la izquierda", partidos: ["PSOE", "SUMAR", "PODEMOS", "FV", "UPC", "ERC", "BILDU", "BNG", "ADELANTE"] },
    { clave: "derecha", titulo: "Si votas a la derecha", partidos: ["PP", "VOX", "SALF", "UPN"] },
    { clave: "otros", titulo: "Otras opciones", partidos: ["PNV", "JUNTS", "CC", "EXISTE"] },
  ];
  const ESCALA_MINIMA = 4;           // la barra llena corresponde a ×4 como mínimo
  const CASI_CERO = 0.05;            // por debajo de ×0,05 se escribe «casi 0»
  const MAXIMO_DE_CUADROS_GRANDES = 8;
  const MAXIMO_DE_ESCANOS_PARA_TABLA = 8;   // la escalera es tabla hasta 8 escaños; por encima, rejilla de cuadrados
  const formatoValor = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const formatoMedia = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // En Navarra UPN y PP van en coalición: en las barras se enseña la coalición (UPN-PP) y en los cuadrados los escaños de cada uno
  function nombreDe(partido, provincia, enBarra) {
    if (partido === "UPN" && provincia === "Navarra" && enBarra) { return "UPN-PP"; }
    return (typeof NOMBRES !== "undefined" && NOMBRES[partido]) || partido;
  }
  const colorDe = (partido) => (typeof COLORES !== "undefined" && COLORES[partido]) || "#7a7a75";
  // El 99,6 % no se redondea a 100 %: sería afirmar certeza
  const textoDePorcentaje = (probabilidad) => (probabilidad >= 1 ? "100%" : probabilidad > 0.995 ? ">99%" : probabilidad < 0.005 ? "<1%" : Math.round(100 * probabilidad) + "%");
  const porcentajeEntero = (probabilidad) => PROBABILIDAD.html(probabilidad, textoDePorcentaje(probabilidad));
  function lista(nombres) {
    if (nombres.length <= 1) { return nombres.join(""); }
    return nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
  }
  function escapar(texto) { return String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  const sumaDe = (cuentas) => Object.keys(cuentas || {}).reduce((suma, partido) => suma + cuentas[partido], 0);

  // «3 son casi seguros, 1 es probable y 1 está en el aire»
  function titular(nombre, datos) {
    const seguros = sumaDe(datos.seguros);
    const probables = sumaDe(datos.probables);
    if (datos.aire === 0 && probables === 0) {
      return datos.escanos === 1 ? "El único escaño de " + nombre + " es casi seguro." : "Los " + datos.escanos + " escaños de " + nombre + " son casi seguros.";
    }
    const partes = [];
    if (seguros > 0) { partes.push(seguros === 1 ? "1 es casi seguro" : seguros + " son casi seguros"); }
    if (probables > 0) { partes.push(probables === 1 ? "1 es probable" : probables + " son probables"); }
    if (datos.aire > 0) { partes.push(datos.aire === 1 ? "1 está en el aire" : datos.aire + " están en el aire"); }
    if (datos.escanos === 1) { return "El único escaño de " + nombre + " está en el aire."; }
    return "De los " + datos.escanos + " escaños de " + nombre + ", " + lista(partes) + ".";
  }

  function cuadrados(nombre, datos) {
    const compacto = datos.escanos > MAXIMO_DE_CUADROS_GRANDES;
    const porVoto = (cuentas) => Object.keys(cuentas || {}).sort((a, b) => cuentas[b] - cuentas[a] || (datos.voto[b] || 0) - (datos.voto[a] || 0));
    const ordenados = porVoto(datos.seguros);
    const ordenadosProbables = porVoto(datos.probables);
    let html = '<div class="vu-cuadrados' + (compacto ? " vu-compacto" : "") + '">';
    ordenados.forEach((partido) => {
      for (let i = 0; i < datos.seguros[partido]; i += 1) {
        const rotulo = nombreDe(partido, nombre, true);
        html += '<div class="vu-cuadro" title="' + escapar(rotulo) + ': casi seguro"><span class="caja" style="background:' + colorDe(partido) + '"></span>' + (compacto ? "" : "<b>" + escapar(rotulo) + "</b>") + "</div>";
      }
    });
    ordenadosProbables.forEach((partido) => {
      for (let i = 0; i < datos.probables[partido]; i += 1) {
        const rotulo = nombreDe(partido, nombre, true);
        html += '<div class="vu-cuadro vu-probable" title="' + escapar(rotulo) + ': probable"><span class="caja" style="background:' + colorDe(partido) + '"></span>' + (compacto ? "" : "<b>" + escapar(rotulo) + "</b>") + "</div>";
      }
    });
    for (let i = 0; i < datos.aire; i += 1) {
      html += '<div class="vu-cuadro vu-aire" title="En el aire"><span class="caja">?</span>' + (compacto ? "" : "<b>En el aire</b>") + "</div>";
    }
    html += "</div>";
    const conProbables = sumaDe(datos.probables) > 0;
    if (compacto) {
      const partes = ordenados.map((partido) => '<span><span class="ficha" style="background:' + colorDe(partido) + '"></span>' + escapar(nombreDe(partido, nombre, true)) + " <b>" + datos.seguros[partido] + "</b></span>");
      const partesProbables = ordenadosProbables.map((partido) => '<span><span class="ficha" style="background:' + colorDe(partido) + '"></span>' + escapar(nombreDe(partido, nombre, true)) + " <b>" + datos.probables[partido] + "</b></span>");
      html += '<p class="nota vu-leyenda">Casi seguros: ' + partes.join(" · ") + (conProbables ? ". Probables: " + partesProbables.join(" · ") : "") +
        (datos.aire ? '. <span class="vu-aire-leyenda">En el aire <b>' + datos.aire + "</b></span>" : "") + ".</p>";
    } else {
      html += '<p class="nota vu-leyenda"><span class="vu-muestra-cuadro"></span> casi seguro' + (conProbables ? ' · <span class="vu-muestra-cuadro vu-muestra-probable"></span> probable' : "") +
        (datos.aire ? ' · <span class="vu-muestra-cuadro vu-muestra-aire">?</span> en el aire' : "") + "</p>";
    }
    return html;
  }

  // Disputa por el último escaño: en qué parte de las simulaciones se lo lleva cada partido (y quién es el primero que se queda fuera)
  const MINIMO_EN_LA_DISPUTA = 0.03;
  function disputaDelUltimo(nombre, datos) {
    if (!datos.disputa) { return ""; }
    const fragmento = (cuentas) => Object.keys(cuentas).filter((partido) => cuentas[partido] >= MINIMO_EN_LA_DISPUTA).sort((a, b) => cuentas[b] - cuentas[a])
      .map((partido) => '<span><span class="ficha" style="background:' + colorDe(partido) + '"></span>' + escapar(nombreDe(partido, nombre, true)) + " <b>" + porcentajeEntero(cuentas[partido]) + "</b></span>").join(" · ");
    const ultimo = fragmento(datos.disputa.ultimo);
    if (!ultimo) { return ""; }
    const fuera = fragmento(datos.disputa.fuera);
    return '<p class="vu-quien"><b>Disputa por el último escaño:</b> ' + ultimo + "</p>" + (fuera ? '<p class="vu-quien vu-fuera"><b>El primero que se queda fuera:</b> ' + fuera + "</p>" : "");
  }

  // Escalera de probabilidades (provincias de pocos escaños): para cada partido, la probabilidad de sacar al menos 1, 2, 3... escaños
  function escalera(nombre, datos) {
    if (!datos.escalera || !datos.escalera.length) { return ""; }
    const umbralSeguro = datos.umbral, umbralProbable = datos.umbral_probable;
    const columnas = Math.max.apply(null, datos.escalera.map((fila) => fila.p.length));
    const clase = (probabilidad) => (probabilidad >= umbralSeguro ? "vu-seguro" : probabilidad >= umbralProbable ? "vu-probable-celda" : "vu-aire-celda");
    let html = '<h4 class="vu-escalera-titulo">Probabilidad de cada escaño</h4><div class="tabla-ancha"><table class="vu-escalera"><thead><tr><th>Partido</th>';
    for (let n = 1; n <= columnas; n += 1) { html += "<th>" + n + (n === 1 ? ".º escaño" : ".º") + "</th>"; }
    html += "</tr></thead><tbody>";
    datos.escalera.forEach((fila) => {
      html += '<tr><td class="col-partido"><span class="ficha" style="background:' + colorDe(fila.partido) + '"></span>' + escapar(nombreDe(fila.partido, nombre, true)) + "</td>";
      for (let n = 0; n < columnas; n += 1) {
        const probabilidad = fila.p[n];
        html += probabilidad === undefined ? "<td>–</td>" : '<td class="' + clase(probabilidad) + '">' + porcentajeEntero(probabilidad) + "</td>";
      }
      html += "</tr>";
    });
    html += "</tbody></table></div>" +
      '<p class="nota">Probabilidad de que el partido saque al menos ese número de escaños: <span class="vu-seguro vu-etiqueta">casi seguro</span> (desde el ' + Math.round(100 * umbralSeguro) + " %), " +
      '<span class="vu-probable-celda vu-etiqueta">probable</span> (desde el ' + Math.round(100 * umbralProbable) + ' %) y <span class="vu-aire-celda vu-etiqueta">en el aire</span> (por debajo). Una coalición (UPN-PP en Navarra) cuenta como un solo partido.</p>';
    return html;
  }

  // Texto corto para dentro de un cuadrado: «97%», o «19/20» en el modo de frecuencias
  function textoCortoDeProbabilidad(probabilidad) {
    if (!PROBABILIDAD.activo()) { return textoDePorcentaje(probabilidad); }
    const frecuencia = PROBABILIDAD.frecuencia(probabilidad);
    return frecuencia === "casi todas" ? "~1" : frecuencia.replace(" de cada ", "/");
  }

  // Rejilla de escaños (provincias de más de 8 escaños, donde la tabla de la escalera no cabe): una fila por partido y un cuadrado por escaño, con la probabilidad de sacar al menos ese escaño
  function rejillaDeEscanos(nombre, datos) {
    if (!datos.escalera || !datos.escalera.length) { return ""; }
    const umbralSeguro = datos.umbral, umbralProbable = datos.umbral_probable;
    let html = '<h4 class="vu-escalera-titulo">Probabilidad de cada escaño</h4><div class="vu-rejilla-escanos">';
    datos.escalera.forEach((fila) => {
      const rotuloDelPartido = nombreDe(fila.partido, nombre, true);
      html += '<div class="vu-rejilla-fila"><span class="vu-rejilla-partido"><span class="ficha" style="background:' + colorDe(fila.partido) + '"></span>' + escapar(rotuloDelPartido) + '</span><span class="vu-rejilla-cuadros">';
      fila.p.forEach((probabilidad, indice) => {
        const estado = probabilidad >= umbralSeguro ? "vu-rej-seguro" : probabilidad >= umbralProbable ? "vu-rej-probable" : "vu-rej-aire";
        const titulo = escapar(rotuloDelPartido) + ", " + (indice + 1) + ".º escaño: " + PROBABILIDAD.plano(probabilidad, textoDePorcentaje(probabilidad));
        html += '<span class="vu-rej-cuadro ' + estado + '" style="--color:' + colorDe(fila.partido) + '" title="' + titulo + '">' + escapar(textoCortoDeProbabilidad(probabilidad)) + "</span>";
      });
      html += "</span></div>";
    });
    html += "</div>" +
      '<p class="nota">Cada cuadrado es un escaño del partido, con la probabilidad de que saque al menos ese número de escaños: <span class="vu-rej-cuadro vu-rej-seguro vu-rej-muestra" style="--color:var(--suave)">casi seguro</span> (desde el ' + Math.round(100 * umbralSeguro) + " %), " +
      '<span class="vu-rej-cuadro vu-rej-probable vu-rej-muestra" style="--color:var(--suave)">probable</span> (línea discontinua, desde el ' + Math.round(100 * umbralProbable) + ' %) y <span class="vu-rej-cuadro vu-rej-aire vu-rej-muestra">en el aire</span> (por debajo). Solo se enseñan los escaños con un 1 % o más. Una coalición cuenta como un solo partido.</p>';
    return html;
  }

  function barras(nombre, datos) {
    const valoresDeBloque = datos.valor_bloque || {};
    const valores = Object.keys(datos.valor).filter((partido) => datos.voto[partido] !== undefined || datos.valor[partido] >= CASI_CERO);
    const escala = Math.max(ESCALA_MINIMA, Math.ceil(Math.max.apply(null, valores.map((partido) => datos.valor[partido]).concat(valores.map((partido) => valoresDeBloque[partido] || 0)).concat([0]))));
    let html = '<p class="vu-explicacion">Cuánto vale un voto a cada partido, frente al voto medio en España</p>' +
      '<p class="vu-clave"><span class="vu-muestra vu-muestra-partido"></span> para el partido <span class="vu-muestra vu-muestra-bloque"></span> para su bloque (izquierda o derecha)</p>';
    GRUPOS.forEach((grupo) => {
      const partidos = grupo.partidos.filter((partido) => valores.indexOf(partido) >= 0).sort((a, b) => datos.valor[b] - datos.valor[a] || (datos.voto[b] || 0) - (datos.voto[a] || 0));
      if (!partidos.length) { return; }
      html += '<h4>' + grupo.titulo + "</h4>";
      partidos.forEach((partido) => {
        const valor = datos.valor[partido];
        const ancho = valor < CASI_CERO ? 0 : Math.max(1.5, Math.min(100, 100 * valor / escala));
        const etiqueta = valor < CASI_CERO ? '<span class="vu-casi0">casi 0</span>' : "×" + formatoValor.format(valor);
        const valorBloque = valoresDeBloque[partido];
        const tieneBloque = valorBloque !== undefined;
        const anchoBloque = tieneBloque ? (valorBloque < CASI_CERO ? 0 : Math.max(1.5, Math.min(100, 100 * valorBloque / escala))) : 0;
        const barraDeBloque = tieneBloque ? '<span class="vu-barra vu-barra-bloque" style="width:' + anchoBloque.toFixed(1) + "%;background:" + colorDe(partido) + '"></span>' : "";
        const etiquetaDeBloque = tieneBloque ? '<small class="vu-valor-bloque">bloque ' + (valorBloque < CASI_CERO ? "casi 0" : "×" + formatoValor.format(valorBloque)) + "</small>" : "";
        html += '<div class="vu-fila' + (tieneBloque ? " vu-con-bloque" : "") + '"><span class="vu-nombre">' + escapar(nombreDe(partido, nombre, true)) + '</span><span class="vu-pista"><span class="vu-barra" style="width:' + ancho.toFixed(1) +
          "%;background:" + colorDe(partido) + '"></span>' + barraDeBloque + '<span class="vu-media" style="left:' + (100 / escala).toFixed(1) + '%"></span></span><span class="vu-valor">' + etiqueta + etiquetaDeBloque + "</span></div>";
      });
    });
    html += '<p class="nota">La línea discontinua es ×1, el valor de un voto medio en España.</p>';
    html += decisivos(nombre, datos);
    return html;
  }

  // Probabilidad de que un voto sea decisivo: en qué parte de las simulaciones basta un cambio de unos pocos centenares de votos para que el partido gane o pierda un escaño
  function decisivos(nombre, datos) {
    if (!datos.decisivo) { return ""; }
    const partidos = Object.keys(datos.decisivo).filter((partido) => datos.decisivo[partido] >= 0.005).sort((a, b) => datos.decisivo[b] - datos.decisivo[a]);
    if (!partidos.length) { return ""; }
    const formatoEntero = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
    const formatoPorcentajeDeVentana = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
    let html = '<p class="vu-explicacion vu-decisivo-titulo">Probabilidad de que el voto sea decisivo</p>' +
      '<p class="nota">En qué parte de las simulaciones un cambio de unos ' + formatoEntero.format(datos.ventana_decisiva) + ' votos (el ' + formatoPorcentajeDeVentana.format(100 * VOTO_UTIL.ventana_decisiva) +
      ' % del voto de la provincia) basta para que el partido gane un escaño más o pierda uno. Es una cifra baja casi siempre: un empate virtual en el reparto central (los cocientes de abajo) es solo una de las posiciones que toma en las simulaciones, porque el voto de cada partido en una provincia tiene un error de varios miles de votos.</p>';
    partidos.forEach((partido) => {
      const probabilidad = datos.decisivo[partido];
      html += '<div class="vu-fila"><span class="vu-nombre">' + escapar(nombreDe(partido, nombre, true)) + '</span><span class="vu-pista"><span class="vu-barra" style="width:' + Math.max(1.5, 100 * probabilidad).toFixed(1) +
        "%;background:" + colorDe(partido) + '"></span></span><span class="vu-valor">' + PROBABILIDAD.html(probabilidad, Math.round(100 * probabilidad) + " %") + "</span></div>";
    });
    return html;
  }

  // Cocientes D'Hondt del reparto central: cada barra es un cociente (votos del partido entre su divisor); entran los N mayores
  // Siglas para el gráfico de cocientes (el nombre completo sale al pasar el ratón)
  const SIGLAS = { PP: "PP", PSOE: "PSOE", VOX: "Vox", SUMAR: "FA", PODEMOS: "Podemos", SALF: "SALF", ADELANTE: "AA", FV: "FV", UPC: "UPC", ERC: "ERC", JUNTS: "Junts", BILDU: "Bildu", PNV: "PNV", BNG: "BNG", UPN: "UPN", CC: "CC", EXISTE: "Existe", PACMA: "PACMA" };
  const siglasDe = (partido, provincia) => (partido === "UPN" && provincia === "Navarra" ? "UPN-PP" : (SIGLAS[partido] || partido));

  // Aviso de que el reparto sin ruido puede no coincidir con los escaños de la previsión (los de un sorteo representativo) ni con el más probable, con la probabilidad del último partido que entra
  function fraseDeContraste(nombre, datos, filas, ultimoEscano) {
    const ultimaFila = filas[ultimoEscano - 1];
    const filaDeEscalera = (datos.escalera || []).find((fila) => fila.partido === ultimaFila.partido);
    const probabilidad = filaDeEscalera ? filaDeEscalera.p[ultimaFila.divisor - 1] : undefined;
    if (probabilidad === undefined) { return ""; }
    const numero = ultimaFila.divisor;
    const escanos = numero === 1 ? "al menos un escaño" : numero + " o más escaños";
    return " Ojo: este reparto, con los votos medios y sin ruido, puede no coincidir con los escaños de la previsión (los de un sorteo representativo de las simulaciones) ni con el «más probable». Aquí el último escaño es el " + numero + ".º de " +
      escapar(nombreDe(ultimaFila.partido, nombre, true)) + ", y ese partido saca " + escanos + " " + PROBABILIDAD.enLasSimulaciones(probabilidad, textoDePorcentaje(probabilidad)) + ".";
  }

  function cocientes(nombre, datos) {
    const filas = datos.cocientes;
    if (!filas || !filas.length || !datos.corte) { return ""; }
    const maximo = filas[0].votos;
    const formatoEntero = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
    const formatoPct = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const ultimo = datos.corte.ultimo, primeroFuera = datos.corte.primero_fuera;
    // Margen solo en la última fila de cada partido que entra (cuántos votos puede perder antes de ceder su último escaño) y en la primera que queda fuera (cuántos le faltan)
    const ultimaQueEntra = {}, primeraQueNo = {};
    filas.forEach((fila, i) => { if (fila.entra) { ultimaQueEntra[fila.partido] = i; } else if (primeraQueNo[fila.partido] === undefined) { primeraQueNo[fila.partido] = i; } });
    const ultimoEscano = filas.filter((f) => f.entra).length;
    let html = '<h3>Cómo se reparten los cocientes</h3><p class="nota">Cada barra es un cociente D’Hondt: los votos del partido divididos entre 1, 2, 3… El número de la izquierda es el del escaño: el 1 es el primero que se reparte y el último que entra es el ' + (filas.filter((f) => f.entra).length) + '. Los ' + ultimoEscano + (ultimoEscano === 1 ? " mayor se lleva el escaño" : " mayores se llevan los escaños") +
      " de " + escapar(nombre) + ". El último escaño se lo lleva " + escapar(nombreDe(filas[ultimoEscano - 1].partido, nombre)) + " con " + formatoEntero.format(ultimo) + " votos por escaño (" + formatoPct.format(filas[ultimoEscano - 1].pct) + " % del voto a candidaturas); el primero que se queda fuera es " + escapar(nombreDe(filas[ultimoEscano].partido, nombre)) + " con " + formatoEntero.format(primeroFuera) + ". Es el reparto central, sin ruido: no dice cuán probable es cada resultado (eso es lo que enseñan la «Disputa por el último escaño» y la escalera de probabilidades), sino dónde está hoy cada cociente y cuántos votos separan a cada partido del corte." + fraseDeContraste(nombre, datos, filas, ultimoEscano) + "</p>";
    filas.forEach((fila, i) => {
      if (i === ultimoEscano) {
        html += '<div class="vq-corte"><span></span><span class="linea"></span><span class="rotulo">corte: ' + formatoEntero.format(Math.round((ultimo + primeroFuera) / 2)) + ' votos</span></div>';
      }
      let margen = "";
      if (fila.entra && ultimaQueEntra[fila.partido] === i) {
        margen = '<span class="vq-margen" title="Votos que puede perder este partido sin ceder este escaño">puede perder ' + formatoEntero.format(fila.puede_perder !== undefined ? fila.puede_perder : Math.round((fila.votos - primeroFuera) * fila.divisor)) + " votos</span>";
      } else if (!fila.entra && primeraQueNo[fila.partido] === i) {
        margen = '<span class="vq-margen" title="Votos que le faltan a este partido para ganar un escaño más">le faltan ' + formatoEntero.format(fila.faltan !== undefined ? fila.faltan : Math.round((ultimo - fila.votos) * fila.divisor)) + " votos</span>";
      }
      html += '<div class="vq-fila' + (fila.entra ? "" : " vq-fuera") + '"><span class="vq-nombre" title="' + escapar(nombreDe(fila.partido, nombre)) + '"><span class="vq-n">' + (i + 1) + '</span>' + escapar(siglasDe(fila.partido, nombre)) + " <small>÷" + fila.divisor + '</small></span><span class="vq-pista"><span class="vq-barra" style="width:' +
        (100 * fila.votos / maximo).toFixed(1) + "%;background:" + colorDe(fila.partido) + '"></span></span><span class="vq-valor"><b>' + formatoEntero.format(fila.votos) + "</b> votos · " + formatoPct.format(fila.pct) + " %" + margen + "</span></div>";
    });
    return html;
  }

  // Barrera electoral de facto: lo que cuesta el último escaño, con el rango del 90 % de las simulaciones, frente al 3 % legal
  function barreraDeFacto(nombre, datos) {
    const barrera = datos.barrera_de_facto;
    if (!barrera) { return ""; }
    const legal = 100 * (VOTO_UTIL.barrera_legal || 0.03);
    const formato = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const bajo = 100 * barrera.p05, alto = 100 * barrera.p95;
    let conclusion;
    if (alto < legal) { conclusion = "Queda por debajo del " + formato.format(legal) + " % legal: la barrera que de verdad corta es la legal."; }
    else if (bajo >= legal) { conclusion = "Queda por encima del " + formato.format(legal) + " % legal: aquí la barrera legal no actúa, manda el propio reparto."; }
    else { conclusion = "Cruza el " + formato.format(legal) + " % legal: según la simulación manda la barrera legal o el propio reparto."; }
    return "<b>Barrera de facto en " + escapar(nombre) + ":</b> entre el " + formato.format(bajo) + " % y el " + formato.format(alto) + " % de los votos válidos (el 90 % de las simulaciones; mediana " + formato.format(100 * barrera.mediana) + " %). " +
      "Es lo que cuesta el último escaño del reparto: un partido necesita más o menos eso para sacar su primer escaño. " + conclusion;
  }

  function pintar() {
    const provincia = modelo.provincias[parseInt(selector.value, 10)];
    if (!provincia) { return; }
    const datos = VOTO_UTIL.provincias[provincia.nombre];
    if (!datos) { return; }
    document.getElementById("vu-titular").textContent = titular(provincia.nombre, datos);
    document.getElementById("vu-barrera").innerHTML = barreraDeFacto(provincia.nombre, datos);
    document.getElementById("vu-escanos").innerHTML = '<p class="nota">' + (datos.escanos === 1 ? "El escaño" : "Los " + datos.escanos + " escaños") + " de " + escapar(provincia.nombre) + "</p>" + cuadrados(provincia.nombre, datos) + disputaDelUltimo(provincia.nombre, datos) + (datos.escanos <= MAXIMO_DE_ESCANOS_PARA_TABLA ? escalera(provincia.nombre, datos) : rejillaDeEscanos(provincia.nombre, datos));
    document.getElementById("vu-barras").innerHTML = barras(provincia.nombre, datos);
    document.getElementById("vu-cocientes").innerHTML = cocientes(provincia.nombre, datos);
    const fecha = VOTO_UTIL.fecha_promedio ? new Date(VOTO_UTIL.fecha_promedio + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" }) : "";
    document.getElementById("vu-nota").innerHTML = "Casi seguro: el partido saca ese escaño en al menos el " + Math.round(100 * datos.umbral) + "% de las " + entero(VOTO_UTIL.sorteos) +
      " simulaciones. Probable: en al menos el " + Math.round(100 * datos.umbral_probable) + " %. En el aire: en menos. «Disputa por el último escaño»: en qué parte de las simulaciones el último escaño del reparto es de cada partido. Valor de un voto: escaños que gana de media el partido por cada voto más en esta provincia (se suma un " + Math.round(100 * VOTO_UTIL.delta) + "% de sus votos y se repite el reparto con las mismas simulaciones), " +
      "dividido por lo que vale un voto medio en España (un escaño por cada " + entero(VOTO_UTIL.votos_por_escano_medio) + " votos). Para el bloque se cuentan los escaños que gana el conjunto de su bloque: un escaño que un partido le quita a otro del mismo bloque no suma, y uno que le quita al bloque contrario sí. Promedio a " + fecha + ". <a href=\"metodologia.html#voto-util\">Cómo se calcula</a>.";
  }

  selector.addEventListener("change", pintar);
  PROBABILIDAD.alCambiar(pintar);
  pintar();
})();
