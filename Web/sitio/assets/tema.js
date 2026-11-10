"use strict";
/* Tema claro/oscuro/automático. El primer paso (aplicar el tema guardado) se hace en el <head> de cada página para evitar el parpadeo. */
(function () {
  const ORDEN = ["auto", "claro", "oscuro"];
  const ETIQUETAS = { auto: "Tema: auto", claro: "Tema: claro", oscuro: "Tema: oscuro" };

  function temaGuardado() {
    try { return localStorage.getItem("pondera-tema") || "auto"; } catch (error) { return "auto"; }
  }
  function aplicar(tema) {
    if (tema === "auto") { document.documentElement.removeAttribute("data-tema"); } else { document.documentElement.setAttribute("data-tema", tema); }
  }

  const boton = document.getElementById("boton-tema");
  if (!boton) { return; }
  let actual = temaGuardado();
  boton.textContent = ETIQUETAS[actual];
  boton.addEventListener("click", function () {
    actual = ORDEN[(ORDEN.indexOf(actual) + 1) % ORDEN.length];
    try { localStorage.setItem("pondera-tema", actual); } catch (error) { /* sin almacenamiento: el cambio vale solo para esta visita */ }
    aplicar(actual);
    boton.textContent = ETIQUETAS[actual];
  });
})();
