"use strict";
/*
 * Listado completo de datos curiosos, agrupado por tipo. Usa CURIOSIDADES, TIPOS_DE_CURIOSIDAD y redactarCuriosidad (assets/curiosidades.js).
 */
(function () {
  const contenedor = document.getElementById("listado-curiosidades");
  if (!contenedor || typeof CURIOSIDADES === "undefined") { return; }
  const datos = CURIOSIDADES.datos;
  const fecha = new Date(CURIOSIDADES.fecha_promedio + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  const tipos = Object.keys(TIPOS_DE_CURIOSIDAD);
  PROBABILIDAD.alCambiar(function () { location.reload(); });
  document.getElementById("curiosidades-resumen").textContent = datos.length + " datos de " + tipos.length + " tipos. Promedio a " + fecha + ", " + entero(CURIOSIDADES.sorteos) + " simulaciones.";
  contenedor.innerHTML = tipos.map(function (tipo) {
    const delTipo = datos.filter(function (dato) { return dato.tipo === tipo; });
    const elementos = delTipo.length
      ? "<ol>" + delTipo.map(function (dato) { const r = redactarCuriosidad(dato); return r ? "<li>" + r.texto + "</li>" : ""; }).join("") + "</ol>"
      : '<p class="nota">Hoy no hay ningún dato de este tipo que cumpla las condiciones.</p>';
    return "<section><h2>" + TIPOS_DE_CURIOSIDAD[tipo].titulo + " <small>(" + delTipo.length + ")</small></h2><p class=\"nota\">" + TIPOS_DE_CURIOSIDAD[tipo].explicacion + "</p>" + elementos + "</section>";
  }).join("");
})();
