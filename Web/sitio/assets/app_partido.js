"use strict";
/*
 * Página de un partido: voto previsto en cada circunscripción con sus franjas, y mapa de España con el voto como tono del color del partido. (23/11/2026)
 * Datos: datos_partidos.js (Web/datos_partidos.js: 10.000 simulaciones, semilla 20261129). La página la fija window.PARTIDO_INICIAL (la clave del partido en el modelo, por ejemplo «PP»).
 * Direcciones de cada provincia: assets/territorios.js. Nombres y colores: assets/comun.js.
 */
(function () {
  const clave = window.PARTIDO_INICIAL;
  const datos = typeof DATOS_PARTIDOS !== "undefined" && DATOS_PARTIDOS.partidos[clave];
  if (!datos) { return; }
  const color = COLORES[clave] || "#7a7a75";
  const formatoUnDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const formatoEntero = new Intl.NumberFormat("es-ES");
  const porcentaje = (valor) => formatoUnDecimal.format(valor) + " %";
  const rango = (desde, hasta) => formatoUnDecimal.format(desde) + "–" + formatoUnDecimal.format(hasta);
  const escapar = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // «Coruña (A)» -> «A Coruña»: el nombre que ve el visitante
  const nombreVisible = (nombre) => { const partes = /^(.*) \((.*)\)$/.exec(nombre); return partes ? partes[2] + " " + partes[1] : nombre; };
  const direccionDe = (nombre) => (typeof TERRITORIOS !== "undefined" && TERRITORIOS.provincias[nombre]) ? "provincias/" + TERRITORIOS.provincias[nombre] + ".html" : null;
  const enlaceDeProvincia = (nombre) => { const direccion = direccionDe(nombre); return direccion ? '<a href="' + direccion + '">' + escapar(nombreVisible(nombre)) + "</a>" : escapar(nombreVisible(nombre)); };
  const conSigno = (diferencia) => (diferencia >= 0 ? "+" : "−") + formatoUnDecimal.format(Math.abs(diferencia));

  const filas = datos.provincias.slice();           // ya vienen por voto previsto decreciente
  const porNombre = {};
  filas.forEach(function (fila) { porNombre[fila.nombre] = fila; });
  const minimo = Math.min.apply(null, filas.map((fila) => fila.voto));
  const maximo = Math.max.apply(null, filas.map((fila) => fila.voto));

  /* ---------- Color: el del partido, de claro (poco voto) a oscuro (mucho voto) ---------- */
  function hexAHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), luz = (max + min) / 2;
    let tono = 0, saturacion = 0;
    if (max !== min) {
      const d = max - min;
      saturacion = luz > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) { tono = (g - b) / d + (g < b ? 6 : 0); } else if (max === g) { tono = (b - r) / d + 2; } else { tono = (r - g) / d + 4; }
      tono *= 60;
    }
    return { h: tono, s: saturacion, l: luz };
  }
  const base = hexAHsl(color);
  const LUZ_CLARA = 93, LUZ_OSCURA = 24;
  function tonoDelVoto(voto) {
    const posicion = maximo > minimo ? (voto - minimo) / (maximo - minimo) : 1;
    const luz = LUZ_CLARA - posicion * (LUZ_CLARA - LUZ_OSCURA);
    return "hsl(" + base.h.toFixed(0) + "," + Math.round(100 * Math.max(base.s, 0.25)) + "%," + luz.toFixed(1) + "%)";
  }

  /* ---------- Resumen ---------- */
  function pintarResumen() {
    const nacional = datos.escanos;
    const total = filas.length;
    const mejor = filas[0], peor = filas[filas.length - 1];
    const tarjeta = (titulo, cifra, detalle) => '<div class="tarjeta-partido"><span class="tarjeta-titulo">' + titulo + '</span><b>' + cifra + '</b><span class="tarjeta-detalle">' + detalle + "</span></div>";
    const diferenciaDe2023 = datos.voto2023_donde_concurre === null ? "" : " Donde concurre, tuvo un " + porcentaje(datos.voto2023_donde_concurre) + " en 2023.";
    const escanos2023 = datos.escanos2023_donde_concurre === null ? "" : " En 2023, donde concurre, sacó " + datos.escanos2023_donde_concurre + ".";
    document.getElementById("partido-resumen").innerHTML = '<div class="tarjetas-partido">' +
      tarjeta("Voto previsto en España", porcentaje(datos.objetivo), "Sobre los votos a candidaturas de toda España." + diferenciaDe2023) +
      tarjeta("Escaños (mediana)", String(nacional.mediana), "Rango del 95 %: " + nacional.p025 + "–" + nacional.p975 + ". En el escenario representativo, " + nacional.escenario + "." + escanos2023) +
      tarjeta("Dónde concurre", total + (total === 1 ? " circunscripción" : " circunscripciones"), "De las 52 de España." + (total < 52 ? " No concurre, o no se le calcula voto, en las otras " + (52 - total) + "." : "")) +
      tarjeta("Su mejor circunscripción", escapar(nombreVisible(mejor.nombre)), porcentaje(mejor.voto) + (total > 1 ? ". La peor: " + escapar(nombreVisible(peor.nombre)) + ", " + porcentaje(peor.voto) + "." : "")) +
      "</div>";
  }

  /* ---------- Mapa ---------- */
  function mostrarFicha(nombre) {
    const ficha = document.getElementById("ficha-provincia");
    const fila = porNombre[nombre];
    if (!fila) { ficha.innerHTML = "<h3>" + escapar(nombreVisible(nombre)) + '</h3><p class="nota">El partido no concurre en esta provincia (o el modelo no le calcula voto).</p>'; return; }
    const diferencia = fila.voto2023 === null ? "" : " (" + conSigno(fila.voto - fila.voto2023) + " puntos)";
    ficha.innerHTML = "<h3>" + enlaceDeProvincia(nombre) + ' <small class="nota">' + fila.escanos_de_la_provincia + " escaños</small></h3>" +
      '<table class="tabla-ficha"><tbody>' +
      "<tr><th scope=\"row\">Voto previsto</th><td class=\"num\"><b>" + porcentaje(fila.voto) + "</b></td></tr>" +
      "<tr><th scope=\"row\">Rango del 80 %</th><td class=\"num\">" + rango(fila.p10, fila.p90) + "</td></tr>" +
      "<tr><th scope=\"row\">Rango del 95 %</th><td class=\"num\">" + rango(fila.p025, fila.p975) + "</td></tr>" +
      "<tr><th scope=\"row\">Voto en 2023</th><td class=\"num\">" + (fila.voto2023 === null ? "–" : porcentaje(fila.voto2023) + diferencia) + "</td></tr>" +
      "<tr><th scope=\"row\">Escaños (escenario)</th><td class=\"num\">" + fila.escanos_escenario + (fila.escanos2023 === null ? "" : " (2023: " + fila.escanos2023 + ")") + "</td></tr>" +
      "</tbody></table>";
  }

  function pintarMapa() {
    const contenedor = document.getElementById("mapa-partido");
    contenedor.appendChild(document.getElementById("svg-provincias").content.cloneNode(true));
    const svg = contenedor.querySelector("svg");
    svg.querySelectorAll("g.prov").forEach(function (grupo) {
      const nombre = grupo.getAttribute("data-boe");
      const fila = porNombre[nombre];
      grupo.setAttribute("data-provincia", nombre);
      grupo.setAttribute("tabindex", "0");
      const titulo = grupo.querySelector("title");
      if (fila) {
        grupo.style.setProperty("--relleno", tonoDelVoto(fila.voto));
        if (titulo) { titulo.textContent = nombreVisible(nombre) + ": " + porcentaje(fila.voto) + " (rango del 80 %: " + rango(fila.p10, fila.p90) + ")"; }
      } else if (titulo) {
        titulo.textContent = nombreVisible(nombre) + ": no concurre";
      }
    });
    const alElegir = function (evento) {
      const grupo = evento.target.closest("g.prov");
      if (grupo) { mostrarFicha(grupo.getAttribute("data-provincia")); }
    };
    ["mouseover", "click", "focusin"].forEach(function (nombreDelEvento) { svg.addEventListener(nombreDelEvento, alElegir); });
  }

  function pintarLeyenda() {
    const pasos = 40;
    const tramos = [];
    for (let i = 0; i < pasos; i++) {
      const voto = minimo + (maximo - minimo) * (i + 0.5) / pasos;
      tramos.push(tonoDelVoto(voto) + " " + (100 * i / pasos).toFixed(2) + "%," + tonoDelVoto(voto) + " " + (100 * (i + 1) / pasos).toFixed(2) + "%");
    }
    document.getElementById("leyenda-mapa-partido").innerHTML = '<div class="barra-escala" style="background:linear-gradient(to right,' + tramos.join(",") + ')"></div>' +
      '<div class="marcas-escala"><span style="left:0%;transform:none">' + porcentaje(minimo) + '</span><span style="left:100%;transform:translateX(-100%)">' + porcentaje(maximo) + "</span></div>" +
      '<p class="nota">Voto previsto del partido en cada provincia. La escala va de su peor a su mejor provincia; en gris, donde no concurre.</p>';
  }

  /* ---------- Lista ordenada ---------- */
  function pintarLista() {
    // Escala común de las franjas: del 0 al mayor extremo del rango del 95 % de todas las filas
    const techo = Math.max.apply(null, filas.map((fila) => fila.p975));
    const posicion = (valor) => (100 * Math.max(0, valor) / techo).toFixed(2);
    const cuerpo = filas.map(function (fila, indice) {
      const franja = (desde, hasta, clase) => '<span class="franja ' + clase + '" style="left:' + posicion(desde) + "%;width:" + (posicion(hasta) - posicion(desde)).toFixed(2) + '%"></span>';
      const barra = '<span class="franjas" style="--color:' + color + '" title="Voto previsto ' + porcentaje(fila.voto) + "; rango del 80 %: " + rango(fila.p10, fila.p90) + "; rango del 95 %: " + rango(fila.p025, fila.p975) + '">' +
        franja(fila.p025, fila.p975, "franja-95") + franja(fila.p10, fila.p90, "franja-80") + '<span class="franja-central" style="left:' + posicion(fila.voto) + '%"></span></span>';
      return "<tr><td class=\"num suave\">" + (indice + 1) + "</td><td>" + enlaceDeProvincia(fila.nombre) + ' <small class="suave">' + fila.escanos_de_la_provincia + "</small></td>" +
        '<td class="num"><b>' + porcentaje(fila.voto) + '</b></td><td class="num">' + rango(fila.p10, fila.p90) + '</td><td class="num">' + rango(fila.p025, fila.p975) + "</td><td>" + barra + "</td>" +
        '<td class="num">' + (fila.voto2023 === null ? "–" : porcentaje(fila.voto2023)) + '</td><td class="num">' + (fila.voto2023 === null ? "–" : conSigno(fila.voto - fila.voto2023)) + "</td>" +
        '<td class="num">' + fila.escanos_escenario + '</td><td class="num">' + (fila.escanos2023 === null ? "–" : fila.escanos2023) + "</td></tr>";
    }).join("");
    document.getElementById("partido-tabla").innerHTML = '<div class="tabla-ancha"><table class="tabla-partido"><thead><tr><th class="num">#</th><th>Circunscripción <small class="suave">(escaños)</small></th>' +
      '<th class="num">Voto previsto</th><th class="num">Rango 80 %</th><th class="num">Rango 95 %</th><th>Franjas</th><th class="num">Voto 2023</th><th class="num">Dif.</th><th class="num" title="Escaños del escenario representativo">Esc. 2026</th><th class="num">Esc. 2023</th></tr></thead>' +
      "<tbody>" + cuerpo + "</tbody></table></div>" +
      '<p class="nota">Franjas: la clara es el rango del 95 %, la oscura el del 80 % y la raya, el voto previsto; todas con la misma escala (de 0 a ' + porcentaje(techo) + ").</p>";
  }

  pintarResumen();
  pintarMapa();
  pintarLeyenda();
  pintarLista();
  const notas = window.NOTA_DEL_PARTIDO;
  if (notas) { document.getElementById("partido-notas").innerHTML = notas; }
})();
