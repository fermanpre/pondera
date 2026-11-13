"use strict";
(function () {
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
    return "<tr><td>" + escapar(sondeo.firma) + (sondeo.cliente ? '<br><span class="nota">' + escapar(sondeo.cliente) + "</span>" : "") + "</td>" +
      "<td>" + escapar(sondeo.campo) + "<br><span class=\"nota\">" + fechaCorta(sondeo.fin) + "</span></td>" +
      '<td class="num">' + (sondeo.muestra ? entero(sondeo.muestra) : "") + "</td>" + celdasPartidos +
      "<td>" + sondeo.fuentes.map(enlaceDeFuente).join("<br>") + "</td></tr>";
  }

  function pintarTramo() {
    const hasta = Math.min(mostradas + FILAS_POR_TRAMO, filtrados.length);
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

  cabecera.innerHTML = "<tr><th>Casa / medio</th><th>Campo</th><th>Muestra</th>" + datos.partidos.map((p) => "<th>" + escapar(p) + "</th>").join("") + "<th>Fuentes</th></tr>";
  [...new Set(datos.sondeos.map((s) => s.firma))].sort((a, b) => a.localeCompare(b, "es")).forEach((firma) => selectorFirma.insertAdjacentHTML("beforeend", '<option>' + escapar(firma) + "</option>"));
  [...new Set(datos.sondeos.map((s) => s.fin.slice(0, 4)))].sort().reverse().forEach((anio) => selectorAnio.insertAdjacentHTML("beforeend", "<option>" + anio + "</option>"));
  [selectorFirma, selectorAnio].forEach((elemento) => elemento.addEventListener("change", aplicarFiltros));
  cajaTexto.addEventListener("input", aplicarFiltros);
  botonMas.addEventListener("click", pintarTramo);
  aplicarFiltros();
})();
