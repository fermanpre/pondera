"use strict";
(function () {
  const datos = LISTADO_REGIONAL;
  const cuerpo = document.querySelector("#tabla-regional tbody");
  const cabecera = document.querySelector("#tabla-regional thead");
  const selectorAmbito = document.getElementById("filtro-ambito");
  const selectorTipo = document.getElementById("filtro-tipo");
  const cuenta = document.getElementById("cuenta-regional");
  const escapar = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const dominio = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return "fuente"; } };
  const fechaCorta = (iso) => (iso && iso.slice(8) !== "00" ? iso.split("-").reverse().join("/") : (iso ? iso.slice(0, 7).split("-").reverse().join("/") : ""));

  function enlaceDeFuente(url) {
    const etiqueta = /\.pdf(\?|$)/i.test(url) ? "PDF" : dominio(url);
    return '<a href="' + escapar(url) + '" target="_blank" rel="noopener noreferrer nofollow">' + escapar(etiqueta) + "</a>";
  }

  function partidosDelAmbito(ambito) {
    const orden = [];
    ambito.sondeos.forEach((s) => Object.keys(s.valores).concat(Object.keys(s.escanos)).forEach((p) => { if (!orden.includes(p)) orden.push(p); }));
    return orden;
  }

  function celdaDePartido(sondeo, partido) {
    const valor = sondeo.valores[partido];
    const escanos = sondeo.escanos[partido];
    let texto = valor === undefined ? "" : formatoPorcentaje.format(valor);
    if (escanos) {
      const rango = escanos[0] === escanos[1] ? String(escanos[0]) : escanos[0] + "–" + escanos[1];
      texto += (texto ? ' <span class="nota">(' : '<span class="nota">') + rango + (texto ? ")" : "") + "</span>";
    }
    return '<td class="num">' + texto + "</td>";
  }

  function pintar() {
    const ambito = datos.ambitos[Number(selectorAmbito.value)];
    const partidos = partidosDelAmbito(ambito);
    const tipo = selectorTipo.value;
    const sondeos = ambito.sondeos.filter((s) => !tipo || s.tipo === tipo || s.tipo === "resultado");
    cabecera.innerHTML = "<tr><th>Casa / medio</th><th>Campo</th><th>Muestra</th>" + partidos.map((p) => "<th>" + escapar(p) + "</th>").join("") + "<th>Fuentes</th></tr>";
    cuerpo.innerHTML = sondeos.map((s) =>
      "<tr" + (s.tipo === "resultado" ? ' class="fila-resultado"' : "") + "><td>" + escapar(s.firma) + (s.de_parte ? ' <span class="etiqueta-de-parte" title="Encargada o publicada por un partido o una entidad electoral, según la tabla de Wikipedia">de parte: ' + escapar(s.de_parte) + "</span>" : "") + (s.cliente ? '<br><span class="nota">' + escapar(s.cliente) + "</span>" : "") +
      "</td><td>" + escapar(s.campo) + (s.fin ? '<br><span class="nota">' + fechaCorta(s.fin) + "</span>" : "") + '</td><td class="num">' + (s.muestra ? entero(s.muestra) : "") + "</td>" +
      partidos.map((p) => celdaDePartido(s, p)).join("") + "<td>" + s.fuentes.map(enlaceDeFuente).join("<br>") + "</td></tr>").join("");
    const encuestas = sondeos.filter((s) => s.tipo !== "resultado");
    cuenta.textContent = entero(encuestas.length) + " encuestas (" + entero(encuestas.filter((s) => s.tipo === "porcentajes").length) + " con porcentajes)";
  }

  datos.ambitos.forEach((a, i) => {
    const total = a.sondeos.filter((s) => s.tipo !== "resultado").length;
    const conPorcentajes = a.sondeos.filter((s) => s.tipo === "porcentajes").length;
    selectorAmbito.insertAdjacentHTML("beforeend", '<option value="' + i + '">' + escapar(a.nombre) + (a.tipo === "provincia" ? " (provincia)" : "") + " · " + total + " (" + conPorcentajes + ")</option>");
  });
  const parametro = new URLSearchParams(location.search).get("ambito");
  const inicial = datos.ambitos.findIndex((a) => a.nombre === parametro);
  selectorAmbito.value = inicial >= 0 ? inicial : 0;
  selectorAmbito.addEventListener("change", pintar);
  selectorTipo.addEventListener("change", pintar);
  pintar();
})();
