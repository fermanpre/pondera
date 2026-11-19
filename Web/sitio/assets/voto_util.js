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
    // Si el voto más valioso de un grupo no es el del partido más votado de ese grupo, se dice
    const comentarios = [];
    GRUPOS.slice(0, 2).forEach((grupo) => {
      const presentes = grupo.partidos.filter((partido) => datos.voto[partido] !== undefined && datos.valor[partido] !== undefined);
      if (presentes.length < 2) { return; }
      const masValioso = presentes.slice().sort((a, b) => datos.valor[b] - datos.valor[a])[0];
      const masVotado = presentes.slice().sort((a, b) => datos.voto[b] - datos.voto[a])[0];
      // Solo en contiendas claras (1 o 2 escaños en el aire) y si el partido más valioso se juega de verdad uno de ellos
      const seJuegaUnEscano = (datos.reparto_aire[masValioso] || 0) >= 0.10;
      if (datos.aire >= 1 && datos.aire <= 2 && seJuegaUnEscano && masValioso !== masVotado && datos.valor[masValioso] >= 0.5 && datos.valor[masValioso] >= 1.25 * datos.valor[masVotado]) {
        comentarios.push("a la " + grupo.clave + " le sirve más un voto a " + nombreDe(masValioso, nombre, true) + " que a " + nombreDe(masVotado, nombre, true));
      }
    });
    if (comentarios.length) { frase += " Así que " + comentarios.join(" y ") + "."; }
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
    const valores = Object.keys(datos.valor).filter((partido) => datos.voto[partido] !== undefined || datos.valor[partido] >= CASI_CERO);
    const escala = Math.max(ESCALA_MINIMA, Math.ceil(Math.max.apply(null, valores.map((partido) => datos.valor[partido]).concat([0]))));
    let html = '<p class="vu-explicacion">Cuánto vale un voto a cada partido, frente al voto medio en España</p>';
    GRUPOS.forEach((grupo) => {
      const partidos = grupo.partidos.filter((partido) => valores.indexOf(partido) >= 0).sort((a, b) => datos.valor[b] - datos.valor[a] || (datos.voto[b] || 0) - (datos.voto[a] || 0));
      if (!partidos.length) { return; }
      html += '<h4>' + grupo.titulo + "</h4>";
      partidos.forEach((partido) => {
        const valor = datos.valor[partido];
        const ancho = valor < CASI_CERO ? 0 : Math.max(1.5, Math.min(100, 100 * valor / escala));
        const etiqueta = valor < CASI_CERO ? '<span class="vu-casi0">casi 0</span>' : "×" + formatoValor.format(valor);
        html += '<div class="vu-fila"><span class="vu-nombre">' + escapar(nombreDe(partido, nombre, true)) + '</span><span class="vu-pista"><span class="vu-barra" style="width:' + ancho.toFixed(1) +
          "%;background:" + colorDe(partido) + '"></span><span class="vu-media" style="left:' + (100 / escala).toFixed(1) + '%"></span></span><span class="vu-valor">' + etiqueta + "</span></div>";
      });
    });
    html += '<p class="nota">La línea discontinua es ×1, el valor de un voto medio en España.</p>';
    return html;
  }

  function pintar() {
    const provincia = modelo.provincias[parseInt(selector.value, 10)];
    if (!provincia) { return; }
    const datos = VOTO_UTIL.provincias[provincia.nombre];
    if (!datos) { return; }
    document.getElementById("vu-titular").textContent = titular(provincia.nombre, datos);
    document.getElementById("vu-escanos").innerHTML = '<p class="nota">Los ' + datos.escanos + (datos.escanos === 1 ? " escaño" : " escaños") + " de " + escapar(provincia.nombre) + "</p>" + cuadrados(provincia.nombre, datos) + quienSeLoLleva(provincia.nombre, datos);
    document.getElementById("vu-barras").innerHTML = barras(provincia.nombre, datos);
    const fecha = VOTO_UTIL.fecha_promedio ? new Date(VOTO_UTIL.fecha_promedio + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" }) : "";
    document.getElementById("vu-nota").innerHTML = "Casi decidido: el partido saca ese escaño en al menos el " + Math.round(100 * datos.umbral) + "% de las " + entero(VOTO_UTIL.sorteos) +
      " simulaciones. Valor de un voto: escaños que gana de media el partido por cada voto más en esta provincia (se suma un " + Math.round(100 * VOTO_UTIL.delta) + "% de sus votos y se repite el reparto con las mismas simulaciones), " +
      "dividido por lo que vale un voto medio en España (un escaño por cada " + entero(VOTO_UTIL.votos_por_escano_medio) + " votos). No cuenta lo que ese voto quita a otros partidos. Promedio a " + fecha + ". <a href=\"metodologia.html#voto-util\">Cómo se calcula</a>.";
  }

  selector.addEventListener("change", pintar);
  pintar();
})();
