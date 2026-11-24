"use strict";
/*
 * Página de un partido: voto previsto en cada circunscripción con sus franjas, y mapa de España con el voto como tono del color del partido. (23/11/2026)
 * Datos: datos_partidos.js (Web/datos_partidos.js: 50.000 simulaciones desde el 24/11/2026, semilla 20261129). La página la fija window.PARTIDO_INICIAL (la clave del partido en el modelo, por ejemplo «PP»).
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

  const simulacionesTexto = new Intl.NumberFormat("es-ES").format(DATOS_PARTIDOS.sorteos || 10000);   // las que calculó datos_partidos.js
  const filas = datos.provincias.slice();           // ya vienen por voto previsto decreciente
  const porNombre = {};
  filas.forEach(function (fila) { porNombre[fila.nombre] = fila; });
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
  const LUZ_CLARA = 100, LUZ_OSCURA = 24;   // el blanco es el 0 % de voto y el tono más oscuro, la mejor provincia del partido (23/11/2026; antes el blanco era la peor)
  function tonoDelVoto(voto) {
    const posicion = maximo > 0 ? Math.min(1, Math.max(0, voto / maximo)) : 0;
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
      tarjeta("Escaños (mediana)", String(nacional.mediana), "Rango del 95 %: " + nacional.p025 + "–" + nacional.p975 + ". En el escenario (reparto central), " + nacional.escenario + "." + escanos2023) +
      tarjeta("Dónde concurre", total + (total === 1 ? " circunscripción" : " circunscripciones"), "De las 52 de España." + (total < 52 ? " No concurre, o no se le calcula voto, en las otras " + (52 - total) + "." : "")) +
      tarjeta("Su mejor circunscripción", escapar(nombreVisible(mejor.nombre)), porcentaje(mejor.voto) + (total > 1 ? ". La peor: " + escapar(nombreVisible(peor.nombre)) + ", " + porcentaje(peor.voto) + "." : "")) +
      "</div>";
  }

  /* ---------- Escaños en disputa ---------- */
  // Los mismos umbrales que las páginas de provincia (voto_util_provincias.js): casi seguro 95 %, probable 75 %; por debajo, «en el aire», que aquí se enseña desde el 10 %.
  const UMBRAL_CASI_SEGURO = 0.95, UMBRAL_PROBABLE = 0.75, UMBRAL_MINIMO_EN_EL_AIRE = 0.10;
  const textoDeProbabilidadEnCuadro = (probabilidad) => String(Math.min(99, Math.round(100 * probabilidad))) + " %";   // el 100 % se sustituye por el número de escaño (ver más abajo)
  // Una fila por circunscripción con un cuadrado por cada escaño que el partido tiene al menos al 10 % de probabilidad de sacar («al menos k escaños»)
  function filasDeEscanosEnDisputa() {
    const resultado = [];
    filas.forEach(function (fila) {
      const probabilidades = [];
      let acumulado = 0;   // probabilidad de sacar menos de k escaños
      for (let k = 1; k < fila.distribucion_de_escanos.length; k++) {
        acumulado += fila.distribucion_de_escanos[k - 1];
        const probabilidad = Math.min(1, Math.max(0, 1 - acumulado));
        if (probabilidad < UMBRAL_MINIMO_EN_EL_AIRE) { break; }
        probabilidades.push(probabilidad);
      }
      if (!probabilidades.length) { return; }
      resultado.push({
        nombre: fila.nombre, probabilidades: probabilidades,
        seguros: probabilidades.filter((p) => p >= UMBRAL_CASI_SEGURO).length,
        probables: probabilidades.filter((p) => p >= UMBRAL_PROBABLE && p < UMBRAL_CASI_SEGURO).length,
        esperados: probabilidades.reduce((suma, p) => suma + p, 0),
      });
    });
    // Orden: más escaños casi seguros primero; a igualdad, más probables; después, más escaños esperados
    resultado.sort((a, b) => b.seguros - a.seguros || b.probables - a.probables || b.esperados - a.esperados || nombreVisible(a.nombre).localeCompare(nombreVisible(b.nombre), "es"));
    return resultado;
  }
  function pintarEscanosEnDisputa() {
    const contenedor = document.getElementById("partido-disputa");
    if (!contenedor) { return; }
    const lista = filasDeEscanosEnDisputa();
    if (!lista.length) {
      contenedor.innerHTML = "<h2>Escaños en disputa</h2><p class=\"nota\">En ninguna circunscripción tiene este partido un 10 % de probabilidad o más de sacar escaño.</p>";
      return;
    }
    const total = (clave) => lista.reduce((suma, fila) => suma + fila[clave], 0);
    const seguros = total("seguros"), probables = total("probables");
    const enElAire = lista.reduce((suma, fila) => suma + fila.probabilidades.length, 0) - seguros - probables;
    const pluralDe = (cantidad, singular, plural) => cantidad + " " + (cantidad === 1 ? singular : plural);
    const resumen = [];
    if (seguros) { resumen.push(pluralDe(seguros, "casi seguro", "casi seguros")); }
    if (probables) { resumen.push(pluralDe(probables, "probable", "probables")); }
    if (enElAire) { resumen.push(pluralDe(enElAire, "en el aire", "en el aire")); }
    let html = "<h2>Escaños en disputa</h2>" +
      '<p class="nota">' + escapar(resumen.join(", ").replace(/, ([^,]*)$/, " y $1")) + ". Cada cuadrado es un escaño del partido en esa circunscripción, con la probabilidad de que saque al menos ese número de escaños: el segundo cuadrado de Sevilla es el 2.º por Sevilla. " +
      "Las circunscripciones van ordenadas por escaños casi seguros y, a igualdad, por probables y por escaños esperados.</p>" +
      '<div class="vu-rejilla-escanos disputa-rejilla">';
    lista.forEach(function (fila) {
      const horquilla = fila.seguros === fila.probabilidades.length ? String(fila.seguros) : fila.seguros + "–" + fila.probabilidades.length;
      html += '<div class="vu-rejilla-fila"><span class="vu-rejilla-partido"><span>' + enlaceDeProvincia(fila.nombre) + ' <b title="Escaños casi seguros y, tras el guion, todos los que se pintan">' + horquilla + "</b></span></span><span class=\"vu-rejilla-cuadros\">";
      fila.probabilidades.forEach(function (probabilidad, indice) {
        const seguro = probabilidad >= UMBRAL_CASI_SEGURO;
        const relleno = seguro ? 100 : Math.max(6, Math.round(100 * probabilidad));
        const estado = seguro ? "vu-rej-seguro" : "vu-rej-parcial" + (relleno >= 60 ? " vu-rej-fuerte" : "");
        const titulo = (indice + 1) + ".º escaño por " + nombreVisible(fila.nombre) + ": " + (probabilidad >= 0.995 ? "100 %" : textoDeProbabilidadEnCuadro(probabilidad));
        html += '<span class="vu-rej-cuadro ' + estado + '" style="--color:' + color + ";--relleno:" + relleno + '%" title="' + escapar(titulo) + '">' + (probabilidad >= 0.995 ? String(indice + 1) : textoDeProbabilidadEnCuadro(probabilidad)) + "</span>";
      });
      html += "</span></div>";
    });
    html += "</div>" +
      '<p class="nota">Relleno completo y línea continua: casi seguro (' + Math.round(100 * UMBRAL_CASI_SEGURO) + " % o más de las " + simulacionesTexto + " simulaciones); en los que llegan al 100 % el cuadrado lleva el número del escaño en lugar del porcentaje. Línea discontinua: probable (desde el " + Math.round(100 * UMBRAL_PROBABLE) + " %) o en el aire; cuanto más pálido, menos probable. " +
      "Junto al nombre, la horquilla: los escaños casi seguros y, tras el guion, todos los que se pintan (si son los mismos, un solo número). Solo se enseñan los escaños con un " + Math.round(100 * UMBRAL_MINIMO_EN_EL_AIRE) + " % o más. Los mismos umbrales que las páginas de provincia.</p>";
    contenedor.innerHTML = html;
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
      const voto = maximo * (i + 0.5) / pasos;
      tramos.push(tonoDelVoto(voto) + " " + (100 * i / pasos).toFixed(2) + "%," + tonoDelVoto(voto) + " " + (100 * (i + 1) / pasos).toFixed(2) + "%");
    }
    document.getElementById("leyenda-mapa-partido").innerHTML = '<div class="barra-escala" style="background:linear-gradient(to right,' + tramos.join(",") + ')"></div>' +
      '<div class="marcas-escala"><span style="left:0%;transform:none">' + porcentaje(0) + '</span><span style="left:100%;transform:translateX(-100%)">' + porcentaje(maximo) + "</span></div>" +
      '<p class="nota">Voto previsto del partido en cada provincia. La escala va del 0 % (blanco) a su mejor provincia (el tono más oscuro); en gris, donde no concurre.</p>';
  }

  /* ---------- Lista ordenada ---------- */
  // Vista de las columnas de rangos y de distribución: de escaños (por defecto) o de voto. Es la misma elección, y se guarda con la misma clave, que en las tablas de provincia y comunidad.
  let vista = "escanos";
  const selectorDeVista = document.getElementById("vista-partido");
  if (selectorDeVista) {
    try {
      const guardada = localStorage.getItem("pondera-vista-territorio");
      if (guardada && selectorDeVista.querySelector('option[value="' + guardada + '"]')) { selectorDeVista.value = guardada; }
    } catch (error) { /* sin almacenamiento: se usa el valor por defecto */ }
    vista = selectorDeVista.value;
    selectorDeVista.addEventListener("change", function () {
      vista = selectorDeVista.value;
      try { localStorage.setItem("pondera-vista-territorio", vista); } catch (error) { /* ignorar */ }
      pintarLista();
    });
  }
  const rangoDeEscanos = (desde, hasta) => (desde === hasta ? String(desde) : desde + "–" + hasta);

  // Distribución de probabilidad de cada número de escaños en la circunscripción: una barra por número, con el más probable en tono pleno
  function distribucionDeEscanos(fila) {
    const probabilidades = fila.distribucion_de_escanos;
    const maxima = Math.max.apply(null, probabilidades);
    const ANCHO = 112, ALTO = 28, MARGEN = 1;
    const ancho = ANCHO / probabilidades.length;
    let svg = '<svg viewBox="0 0 ' + ANCHO + " " + ALTO + '" width="' + ANCHO + '" height="' + ALTO + '" role="img" aria-label="Distribución de escaños de ' + escapar(nombreVisible(fila.nombre)) + '">';
    probabilidades.forEach(function (probabilidad, escanos) {
      const alto = Math.max(probabilidad > 0 ? 1 : 0, (ALTO - 2) * probabilidad / maxima);
      svg += '<rect x="' + (escanos * ancho + MARGEN / 2).toFixed(1) + '" y="' + (ALTO - alto).toFixed(1) + '" width="' + Math.max(1, ancho - MARGEN).toFixed(1) + '" height="' + alto.toFixed(1) + '" fill="' + color +
        '" opacity="' + (escanos === fila.escanos.mas_probable ? "1" : "0.55") + '"><title>' + escanos + (escanos === 1 ? " escaño: " : " escaños: ") + porcentaje(100 * probabilidad) + "</title></rect>";
    });
    return svg + "</svg>";
  }

  function pintarLista() {
    // Escala común de las franjas de voto: del 0 al mayor extremo del rango del 95 % de todas las filas
    const techo = Math.max.apply(null, filas.map((fila) => fila.p975));
    const posicion = (valor) => (100 * Math.max(0, valor) / techo).toFixed(2);
    const deVoto = vista === "voto";
    const cuerpo = filas.map(function (fila, indice) {
      const franja = (desde, hasta, clase) => '<span class="franja ' + clase + '" style="left:' + posicion(desde) + "%;width:" + (posicion(hasta) - posicion(desde)).toFixed(2) + '%"></span>';
      const barra = '<span class="franjas" style="--color:' + color + '" title="Voto previsto ' + porcentaje(fila.voto) + "; rango del 80 %: " + rango(fila.p10, fila.p90) + "; rango del 95 %: " + rango(fila.p025, fila.p975) + '">' +
        franja(fila.p025, fila.p975, "franja-95") + franja(fila.p10, fila.p90, "franja-80") + '<span class="franja-central" style="left:' + posicion(fila.voto) + '%"></span></span>';
      const comunes = '<tr><td class="num suave">' + (indice + 1) + "</td><td>" + enlaceDeProvincia(fila.nombre) + ' <small class="suave">' + fila.escanos_de_la_provincia + "</small></td>" +
        '<td class="num"><b>' + porcentaje(fila.voto) + "</b></td>";
      const escanos2023 = '<td class="num">' + (fila.escanos2023 === null ? "–" : fila.escanos2023) + "</td></tr>";
      if (deVoto) {
        return comunes + '<td class="num">' + rango(fila.p10, fila.p90) + '</td><td class="num">' + rango(fila.p025, fila.p975) + "</td><td>" + barra + "</td>" +
          '<td class="num">' + (fila.voto2023 === null ? "–" : porcentaje(fila.voto2023)) + '</td><td class="num">' + (fila.voto2023 === null ? "–" : conSigno(fila.voto - fila.voto2023)) + "</td>" +
          '<td class="num">' + fila.escanos_escenario + "</td>" + escanos2023;
      }
      return comunes + '<td class="num"><b>' + fila.escanos.mediana + '</b></td><td class="num">' + fila.escanos_escenario + '</td><td class="num">' + fila.escanos.mas_probable + "</td>" +
        '<td class="num">' + rangoDeEscanos(fila.escanos.p10, fila.escanos.p90) + '</td><td class="num">' + rangoDeEscanos(fila.escanos.p025, fila.escanos.p975) + "</td><td>" + distribucionDeEscanos(fila) + "</td>" +
        '<td class="num">' + porcentaje(100 * fila.probabilidad_de_escano) + "</td>" + escanos2023;
    }).join("");
    const cabeceraDeVoto = '<th class="num">Rango 80 %</th><th class="num">Rango 95 %</th><th>Franjas</th><th class="num">Voto 2023</th><th class="num">Dif.</th><th class="num" title="Escaños del escenario (reparto central)">Esc. 2026</th><th class="num">Esc. 2023</th>';
    const cabeceraDeEscanos = '<th class="num" title="Mediana de los escaños de las ' + simulacionesTexto + ' simulaciones">Mediana</th><th class="num" title="Escaños del escenario: D’Hondt con el voto previsto de la circunscripción">Escenario</th><th class="num" title="Número de escaños más probable">Más prob.</th>' +
      '<th class="num">Esc. 80 %</th><th class="num">Esc. 95 %</th><th>Distribución</th><th class="num" title="Probabilidad de sacar al menos un escaño">Prob. ≥ 1</th><th class="num">Esc. 2023</th>';
    const nota = deVoto
      ? '<p class="nota">Franjas: la clara es el rango del 95 %, la oscura el del 80 % y la raya, el voto previsto; todas con la misma escala (de 0 a ' + porcentaje(techo) + ").</p>"
      : '<p class="nota">Mediana: los escaños que quedan en el medio de las ' + simulacionesTexto + ' simulaciones de esa circunscripción. Escenario: D’Hondt con el voto previsto de la circunscripción (el mismo de la previsión, el hemiciclo y las tablas). No tienen por qué coincidir ni sumar el total de España, porque cada mediana sale de sorteos distintos. ' +
        'En la distribución, la barra más oscura es el número de escaños más probable.</p>';
    document.getElementById("partido-tabla").innerHTML = '<div class="tabla-ancha"><table class="tabla-partido"><thead><tr><th class="num">#</th><th>Circunscripción <small class="suave">(escaños)</small></th>' +
      '<th class="num">Voto previsto</th>' + (deVoto ? cabeceraDeVoto : cabeceraDeEscanos) + "</tr></thead><tbody>" + cuerpo + "</tbody></table></div>" + nota;
  }

  pintarResumen();
  pintarEscanosEnDisputa();
  pintarMapa();
  pintarLeyenda();
  pintarLista();
  const notas = window.NOTA_DEL_PARTIDO;
  if (notas) { document.getElementById("partido-notas").innerHTML = notas; }
})();
