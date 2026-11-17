"use strict";
/* Aviso de veda de sondeos (art. 69.7 de la LOREG: durante los cinco días anteriores al de la votación queda prohibida la publicación y difusión o reproducción de sondeos electorales).
   Desde el 24/11/2026 (hora de Madrid) la web no se actualiza (la tarea automática se detiene) y se muestra este aviso en todas las páginas. Con ?veda=1 en la dirección se ve en cualquier fecha (prueba). */
(function () {
  const INICIO_DE_LA_VEDA = Date.parse("2026-11-24T00:00:00+01:00");
  const CIERRE_DE_LOS_COLEGIOS = Date.parse("2026-11-29T20:00:00+01:00");
  let prueba = false;
  try { prueba = /[?&]veda=1/.test(window.location.search); } catch (e) { prueba = false; }
  const ahora = Date.now();
  if (!prueba && ahora < INICIO_DE_LA_VEDA) return;
  const texto = ahora >= CIERRE_DE_LOS_COLEGIOS && !prueba
    ? "Elecciones generales del 29 de noviembre de 2026. PONDERA dejó de actualizarse el 23 de noviembre, último día en que se pueden publicar sondeos: las cifras de esta web son las de esa fecha."
    : "Veda de sondeos (artículo 69.7 de la LOREG): PONDERA ha dejado de actualizarse. Las cifras de esta web son las del 23 de noviembre, último día en que se pueden publicar sondeos.";
  const aviso = document.createElement("div");
  aviso.className = "aviso-veda";
  aviso.setAttribute("role", "status");
  aviso.textContent = texto;
  function colocar() {
    const cabecera = document.querySelector("header");
    if (cabecera && cabecera.parentNode) cabecera.parentNode.insertBefore(aviso, cabecera);
    else document.body.insertBefore(aviso, document.body.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", colocar); else colocar();
})();
