"use strict";
/*
 * Página de Previsión: carga los datos pesados de cada sección solo cuando se acerca a la pantalla y maneja las pestañas de Sondeos.
 *   - Promedio: serie_promedio.js, encuestas_promedio.js y grafico_promedio.js (unos 470 KB sin comprimir).
 *   - Sondeos nacionales: listado_sondeos.js y su script (unos 300 KB). Subnacionales: listado_regional.js y su script (unos 185 KB), al abrir su pestaña.
 * Los scripts se cargan en orden (los datos antes que el código que los usa). Con #sondeos-subnacionales en la dirección se abre la pestaña de subnacionales.
 */
(function () {
  const cargados = {};

  function cargarEnOrden(rutas, alTerminar) {
    let posicion = 0;
    function siguiente() {
      if (posicion >= rutas.length) { if (alTerminar) { alTerminar(); } return; }
      const script = document.createElement("script");
      script.src = rutas[posicion];
      posicion += 1;
      script.onload = siguiente;
      script.onerror = function () { console.error("No se pudo cargar " + script.src); siguiente(); };
      document.body.appendChild(script);
    }
    siguiente();
  }

  function cargarUnaVez(clave, rutas, alTerminar) {
    if (cargados[clave]) { return; }
    cargados[clave] = true;
    cargarEnOrden(rutas, alTerminar);
  }

  function cuandoSeAcerque(identificador, accion) {
    const elemento = document.getElementById(identificador);
    if (!elemento) { return; }
    if (!("IntersectionObserver" in window)) { accion(); return; }
    const observador = new IntersectionObserver(function (entradas) {
      if (entradas.some(function (entrada) { return entrada.isIntersecting; })) { observador.disconnect(); accion(); }
    }, { rootMargin: "700px 0px" });
    observador.observe(elemento);
  }

  function cargarPromedio() {
    cargarUnaVez("promedio", ["serie_promedio.js", "encuestas_promedio.js", "grafico_promedio.js"], function () {
      const aviso = document.getElementById("cargando-promedio");
      if (aviso) { aviso.remove(); }
    });
  }
  function cargarSondeosNacionales() {
    cargarUnaVez("sondeos", ["listado_sondeos.js", "assets/listado_sondeos.js"], function () {
      const aviso = document.getElementById("cargando-sondeos");
      if (aviso) { aviso.remove(); }
    });
  }
  function cargarSondeosSubnacionales() {
    cargarUnaVez("subnacionales", ["listado_regional.js", "assets/listado_regional.js"]);
  }

  function elegirPestana(nombre) {
    const nacionales = nombre === "nacionales";
    document.getElementById("pestana-nacionales").setAttribute("aria-selected", nacionales ? "true" : "false");
    document.getElementById("pestana-subnacionales").setAttribute("aria-selected", nacionales ? "false" : "true");
    document.getElementById("panel-nacionales").hidden = !nacionales;
    document.getElementById("panel-subnacionales").hidden = nacionales;
    if (nacionales) { cargarSondeosNacionales(); } else { cargarSondeosSubnacionales(); }
  }

  cuandoSeAcerque("promedio", cargarPromedio);
  if (document.getElementById("pestana-nacionales")) {
    document.getElementById("pestana-nacionales").addEventListener("click", function () { elegirPestana("nacionales"); });
    document.getElementById("pestana-subnacionales").addEventListener("click", function () { elegirPestana("subnacionales"); });
    cuandoSeAcerque("sondeos", function () {
      if (location.hash === "#sondeos-subnacionales") { elegirPestana("subnacionales"); } else { cargarSondeosNacionales(); }
    });
    if (location.hash === "#sondeos-subnacionales") {
      elegirPestana("subnacionales");
      const seccion = document.getElementById("sondeos");
      if (seccion) { seccion.scrollIntoView(); }
    }
  }
  if (location.hash === "#promedio") { cargarPromedio(); }
})();
