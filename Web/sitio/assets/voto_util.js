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
  const formatoValor = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const formatoMedia = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // En Navarra UPN y PP van en coalición: en las barras se enseña la coalición (UPN-PP) y en los cuadrados los escaños de cada uno
  function nombreDe(partido, provincia, enBarra) {
    if (partido === "UPN" && provincia === "Navarra" && enBarra) { return "UPN-PP"; }
    return (typeof NOMBRES !== "undefined" && NOMBRES[partido]) || partido;
  }
  const colorDe = (partido) => (typeof COLORES !== "undefined" && COLORES[partido]) || "#7a7a75";
  const porcentajeEntero = (probabilidad) => Math.round(100 * probabilidad) + "%";
  function lista(nombres) {
    if (nombres.length <= 1) { return nombres.join(""); }
    return nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
  }
  function escapar(texto) { return String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function titular(nombre, datos) {
    const seguros = Object.keys(datos.seguros).reduce((suma, partido) => suma + datos.seguros[partido], 0);
    const probables = Object.keys(datos.reparto_aire).filter((partido) => datos.reparto_aire[partido] >= (datos.aire === 1 ? 0.10 : 0.25))
      .sort((a, b) => datos.reparto_aire[b] - datos.reparto_aire[a]).slice(0, 4).map((partido) => nombreDe(partido, nombre));
    let frase;
    if (datos.aire === 0) {
      frase = "Los " + datos.escanos + " escaños de " + nombre + " están casi decididos.";
    } else if (seguros === 0) {
      frase = datos.escanos === 1 ? "El único escaño de " + nombre + " se lo juegan " + lista(probables) + "."
        : "Ninguno de los " + datos.escanos + " escaños de " + nombre + " está decidido del todo: se los juegan sobre todo " + lista(probables) + ".";
    } else if (datos.aire === 1) {
      frase = (seguros === 1 ? "Uno de sus " + datos.escanos + " escaños está casi decidido" : seguros + " de sus " + datos.escanos + " escaños están casi decididos") + ". El otro se lo juegan " + lista(probables) + ".";
    } else {
      frase = seguros + " de sus " + datos.escanos + " escaños están casi decididos; " + (datos.aire === 1 ? "queda 1 en el aire" : "quedan " + datos.aire + " en el aire") + ", que se juegan sobre todo " + lista(probables) + ".";
    }
    return frase;
  }

  function cuadrados(nombre, datos) {
    const compacto = datos.escanos > MAXIMO_DE_CUADROS_GRANDES;
    const ordenados = Object.keys(datos.seguros).sort((a, b) => datos.seguros[b] - datos.seguros[a] || (datos.voto[b] || 0) - (datos.voto[a] || 0));
    let html = '<div class="vu-cuadrados' + (compacto ? " vu-compacto" : "") + '">';
    ordenados.forEach((partido) => {
      for (let i = 0; i < datos.seguros[partido]; i += 1) {
        const rotulo = nombreDe(partido, nombre);
        html += '<div class="vu-cuadro" title="' + escapar(rotulo) + '"><span class="caja" style="background:' + colorDe(partido) + '"></span>' + (compacto ? "" : "<b>" + escapar(rotulo) + "</b>") + "</div>";
      }
    });
    for (let i = 0; i < datos.aire; i += 1) {
      html += '<div class="vu-cuadro vu-aire" title="En el aire"><span class="caja">?</span>' + (compacto ? "" : "<b>En el aire</b>") + "</div>";
    }
    html += "</div>";
    if (compacto) {
      const partes = ordenados.map((partido) => '<span><span class="ficha" style="background:' + colorDe(partido) + '"></span>' + escapar(nombreDe(partido, nombre)) + " <b>" + datos.seguros[partido] + "</b></span>");
      html += '<p class="nota vu-leyenda">Casi decididos: ' + partes.join(" · ") + (datos.aire ? ' · <span class="vu-aire-leyenda">En el aire <b>' + datos.aire + "</b></span>" : "") + ".</p>";
    }
    return html;
  }

  function quienSeLoLleva(nombre, datos) {
    if (datos.aire === 0) { return ""; }
    const entradas = Object.keys(datos.reparto_aire).filter((partido) => datos.reparto_aire[partido] >= 0.005).sort((a, b) => datos.reparto_aire[b] - datos.reparto_aire[a]);
    if (!entradas.length) { return ""; }
    if (datos.aire === 1) {
      return '<p class="vu-quien"><b>Quién se lo lleva:</b> ' + entradas.map((partido) => '<span><span class="ficha" style="background:' + colorDe(partido) + '"></span>' +
        escapar(nombreDe(partido, nombre)) + " <b>" + porcentajeEntero(datos.reparto_aire[partido]) + "</b></span>").join(" · ") + "</p>";
    }
    return '<p class="vu-quien"><b>Escaños de más sobre los casi decididos, de media:</b> ' + entradas.map((partido) => '<span><span class="ficha" style="background:' + colorDe(partido) + '"></span>' +
      escapar(nombreDe(partido, nombre)) + " <b>" + formatoMedia.format(datos.reparto_aire[partido]) + "</b></span>").join(" · ") + "</p>";
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
    return html;
  }

  // Cocientes D'Hondt del reparto central: cada barra es un cociente (votos del partido entre su divisor); entran los N mayores
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
    let html = '<h3>Cómo se reparten los cocientes</h3><p class="nota">Cada barra es un cociente D’Hondt: los votos del partido divididos entre 1, 2, 3… Los ' + ultimoEscano + (ultimoEscano === 1 ? " mayor se lleva el escaño" : " mayores se llevan los escaños") +
      " de " + escapar(nombre) + ". El último escaño se lo lleva " + escapar(nombreDe(filas[ultimoEscano - 1].partido, nombre)) + " con " + formatoEntero.format(ultimo) + " votos por escaño (" + formatoPct.format(filas[ultimoEscano - 1].pct) + " % del voto a candidaturas); el primero que se queda fuera es " + escapar(nombreDe(filas[ultimoEscano].partido, nombre)) + " con " + formatoEntero.format(primeroFuera) + ". Es el reparto central, sin ruido: no dice cuán probable es cada resultado (eso es lo que enseña «Quién se lo lleva»), sino dónde está hoy cada cociente y cuántos votos separan a cada partido del corte.</p>";
    filas.forEach((fila, i) => {
      if (i === ultimoEscano) {
        html += '<div class="vq-corte"><span></span><span class="linea"></span><span class="rotulo">corte: ' + formatoEntero.format(Math.round((ultimo + primeroFuera) / 2)) + ' votos</span></div>';
      }
      let margen = "";
      if (fila.entra && ultimaQueEntra[fila.partido] === i) {
        margen = '<span class="vq-margen">puede perder ' + formatoEntero.format(Math.round((fila.votos - primeroFuera) * fila.divisor)) + " votos antes de ceder este escaño</span>";
      } else if (!fila.entra && primeraQueNo[fila.partido] === i) {
        margen = '<span class="vq-margen">le faltan ' + formatoEntero.format(Math.round((ultimo - fila.votos) * fila.divisor)) + " votos para el siguiente</span>";
      }
      html += '<div class="vq-fila' + (fila.entra ? "" : " vq-fuera") + '"><span class="vq-nombre">' + escapar(nombreDe(fila.partido, nombre)) + " <small>÷" + fila.divisor + '</small></span><span class="vq-pista"><span class="vq-barra" style="width:' +
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
    document.getElementById("vu-escanos").innerHTML = '<p class="nota">Los ' + datos.escanos + (datos.escanos === 1 ? " escaño" : " escaños") + " de " + escapar(provincia.nombre) + "</p>" + cuadrados(provincia.nombre, datos) + quienSeLoLleva(provincia.nombre, datos);
    document.getElementById("vu-barras").innerHTML = barras(provincia.nombre, datos);
    document.getElementById("vu-cocientes").innerHTML = cocientes(provincia.nombre, datos);
    const fecha = VOTO_UTIL.fecha_promedio ? new Date(VOTO_UTIL.fecha_promedio + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" }) : "";
    document.getElementById("vu-nota").innerHTML = "Casi decidido: el partido saca ese escaño en al menos el " + Math.round(100 * datos.umbral) + "% de las " + entero(VOTO_UTIL.sorteos) +
      " simulaciones. Valor de un voto: escaños que gana de media el partido por cada voto más en esta provincia (se suma un " + Math.round(100 * VOTO_UTIL.delta) + "% de sus votos y se repite el reparto con las mismas simulaciones), " +
      "dividido por lo que vale un voto medio en España (un escaño por cada " + entero(VOTO_UTIL.votos_por_escano_medio) + " votos). Para el bloque se cuentan los escaños que gana el conjunto de su bloque: un escaño que un partido le quita a otro del mismo bloque no suma, y uno que le quita al bloque contrario sí. Promedio a " + fecha + ". <a href=\"metodologia.html#voto-util\">Cómo se calcula</a>.";
  }

  selector.addEventListener("change", pintar);
  pintar();
})();
