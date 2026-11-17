"use strict";
(function () {
  const FILAS_INICIALES = 15;
  const FILAS_POR_TRAMO = 100;
  const datos = LISTADO_SONDEOS;
  const cuerpo = document.querySelector("#tabla-listado tbody");
  const cabecera = document.querySelector("#tabla-listado thead");
  const selectorFirma = document.getElementById("filtro-firma");
  const selectorAnio = document.getElementById("filtro-anio");
  const cajaTexto = document.getElementById("filtro-texto");
  const botonMas = document.getElementById("mostrar-mas");
  const cuenta = document.getElementById("cuenta-listado");
  let filtrados = [];
  let mostradas = 0;

  // Logos cuadrados de comun.js (logoDePartido). Si no hay logo, ficha de color y siglas.
  const CLAVE_DE_COLOR = { "Vox": "VOX", "Sumar/FA": "SUMAR", "EH Bildu": "BILDU", "CCa": "CC", "Adelante Andalucía": "ADELANTE" };
  const NOMBRE_LARGO = { "Sumar/FA": "Frente Amplio (Sumar hasta octubre de 2026)", "CCa": "Coalición Canaria", "FV": "Front Valencià", "SALF": "Se Acabó La Fiesta", "PNV": "PNV (EAJ)", "EH Bildu": "EH Bildu", "Adelante Andalucía": "Adelante Andalucía" };
  function cabeceraDePartido(partido) {
    const logo = logoDePartido(partido, NOMBRE_LARGO[partido] || partido);
    if (logo) return logo;
    const color = (typeof COLORES !== "undefined" && COLORES[CLAVE_DE_COLOR[partido] || partido.toUpperCase()]) || "#7a7a75";
    return '<span class="ficha" style="background:' + color + '"></span> ' + escapar(partido);
  }

  const escapar = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const dominio = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return "fuente"; } };
  const fechaCorta = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

  function enlaceDeFuente(fuente) {
    const esPdf = /\.pdf(\?|$)/i.test(fuente.url);
    const etiqueta = esPdf ? "PDF" : dominio(fuente.url);
    return '<a href="' + escapar(fuente.url) + '" target="_blank" rel="noopener noreferrer nofollow" title="' + escapar(fuente.titulo || fuente.url) + '">' + escapar(etiqueta) + "</a>";
  }

  function fila(sondeo) {
    const celdasPartidos = datos.partidos.map((partido) => {
      const valor = sondeo.valores[partido];
      return '<td class="num">' + (valor === undefined ? "" : formatoPorcentaje.format(valor)) + "</td>";
    }).join("");
    return "<tr><td>" + escapar(sondeo.firma) + (sondeo.de_parte ? ' <span class="etiqueta-de-parte" title="Encargada o publicada por un partido o una entidad electoral, según la tabla de Wikipedia">de parte: ' + escapar(sondeo.de_parte) + "</span>" : "") + (sondeo.cliente ? '<br><span class="nota">' + escapar(sondeo.cliente) + "</span>" : "") + "</td>" +
      "<td>" + escapar(sondeo.campo) + "<br><span class=\"nota\">" + fechaCorta(sondeo.fin) + "</span></td>" +
      '<td class="num">' + (sondeo.muestra ? entero(sondeo.muestra) : "") + "</td>" + celdasPartidos +
      "<td>" + sondeo.fuentes.map(enlaceDeFuente).join("<br>") + "</td></tr>";
  }

  function pintarTramo() {
    const hasta = Math.min(mostradas + (mostradas === 0 ? FILAS_INICIALES : FILAS_POR_TRAMO), filtrados.length);
    cuerpo.insertAdjacentHTML("beforeend", filtrados.slice(mostradas, hasta).map(fila).join(""));
    mostradas = hasta;
    botonMas.hidden = mostradas >= filtrados.length;
    cuenta.textContent = entero(filtrados.length) + " sondeos (se muestran " + entero(mostradas) + ")";
  }

  function aplicarFiltros() {
    const texto = cajaTexto.value.trim().toLowerCase();
    filtrados = datos.sondeos.filter((s) =>
      (!selectorFirma.value || s.firma === selectorFirma.value) &&
      (!selectorAnio.value || s.fin.slice(0, 4) === selectorAnio.value) &&
      (!texto || (s.firma + " " + s.cliente).toLowerCase().includes(texto)));
    cuerpo.innerHTML = "";
    mostradas = 0;
    pintarTramo();
  }

  cabecera.innerHTML = "<tr><th>Casa / medio</th><th>Campo</th><th>Muestra</th>" + datos.partidos.map((p) => "<th>" + cabeceraDePartido(p) + "</th>").join("") + "<th>Fuentes</th></tr>";
  [...new Set(datos.sondeos.map((s) => s.firma))].sort((a, b) => a.localeCompare(b, "es")).forEach((firma) => selectorFirma.insertAdjacentHTML("beforeend", '<option>' + escapar(firma) + "</option>"));
  [...new Set(datos.sondeos.map((s) => s.fin.slice(0, 4)))].sort().reverse().forEach((anio) => selectorAnio.insertAdjacentHTML("beforeend", "<option>" + anio + "</option>"));
  [selectorFirma, selectorAnio].forEach((elemento) => elemento.addEventListener("change", aplicarFiltros));
  cajaTexto.addEventListener("input", aplicarFiltros);
  botonMas.addEventListener("click", pintarTramo);
  aplicarFiltros();
})();
