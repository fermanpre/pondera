"use strict";
/* Segunda cinta de la página de Previsión: marca la sección que se está viendo (los enlaces «#...» de la cinta). */
(function () {
  const cinta = document.querySelector(".subnav");
  if (!cinta || !("IntersectionObserver" in window)) { return; }
  const enlaces = Array.prototype.slice.call(cinta.querySelectorAll('a[href^="#"]'));
  const secciones = enlaces.map(function (enlace) { return document.getElementById(enlace.getAttribute("href").slice(1)); });
  function marcar() {
    // La sección activa es la última cuyo borde superior ya ha pasado por debajo de la cinta
    const umbral = cinta.getBoundingClientRect().bottom + 24;
    let activa = 0;
    secciones.forEach(function (seccion, indice) {
      if (seccion && seccion.getBoundingClientRect().top <= umbral) { activa = indice; }
    });
    enlaces.forEach(function (enlace, indice) {
      if (indice === activa) { enlace.setAttribute("aria-current", "true"); } else { enlace.removeAttribute("aria-current"); }
    });
  }
  let pendiente = false;
  window.addEventListener("scroll", function () {
    if (pendiente) { return; }
    pendiente = true;
    window.requestAnimationFrame(function () { pendiente = false; marcar(); });
  }, { passive: true });
  window.addEventListener("resize", marcar);
  marcar();
})();
