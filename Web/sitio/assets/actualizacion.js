"use strict";
/*
 * Muestra cuándo se actualizaron los datos por última vez (ULTIMA_ACTUALIZACION, de ultima_actualizacion.js, que escribe generar_sitio.py en cada ejecución), en hora de Madrid.
 * Rellena el aviso de arriba de Inicio (#ultima-actualizacion) y la línea del pie de todas las páginas (#actualizacion-pie).
 */
(function () {
  if (typeof ULTIMA_ACTUALIZACION === "undefined") { return; }
  const instante = new Date(ULTIMA_ACTUALIZACION);
  if (isNaN(instante.getTime())) { return; }
  const texto = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(instante).replace(",", "");
  const aviso = "Última actualización de los datos: " + texto + " (hora de Madrid). Se actualizan solos cada pocas horas.";
  ["ultima-actualizacion", "actualizacion-pie"].forEach(function (identificador) {
    const elemento = document.getElementById(identificador);
    if (elemento) { elemento.textContent = aviso; }
  });
})();
