"use strict";
/*
 * Consentimiento de cookies. Google Analytics solo se carga si el visitante lo acepta; la elección se guarda en el navegador (localStorage, clave «pondera-cookies»).
 * Con «Rechazar» (o sin elegir) no se carga nada de Google y se borran las cookies _ga que hubiera de antes.
 */
(function () {
  const ID_DE_MEDICION = "G-EPHEWLQSRW";
  const CLAVE = "pondera-cookies";
  const PAGINA_DE_PRIVACIDAD = "https://fermanpre.github.io/pondera/privacidad.html";

  function leer() { try { return localStorage.getItem(CLAVE); } catch (error) { return null; } }
  function guardar(valor) { try { localStorage.setItem(CLAVE, valor); } catch (error) { /* sin almacenamiento: vale solo para esta visita */ } }

  function borrarCookiesDeAnalytics() {
    window["ga-disable-" + ID_DE_MEDICION] = true;
    document.cookie.split(";").forEach(function (cookie) {
      const nombre = cookie.split("=")[0].trim();
      if (nombre.indexOf("_ga") === 0) {
        document.cookie = nombre + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        document.cookie = nombre + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=" + location.hostname;
      }
    });
  }

  function cargarAnalytics() {
    if (window.__analyticsCargado) { return; }
    window.__analyticsCargado = true;
    window["ga-disable-" + ID_DE_MEDICION] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", ID_DE_MEDICION, { anonymize_ip: true });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + ID_DE_MEDICION;
    document.head.appendChild(script);
  }

  function cerrarAviso() {
    const aviso = document.getElementById("aviso-cookies");
    if (aviso) { aviso.remove(); }
  }

  function mostrarAviso() {
    cerrarAviso();
    const aviso = document.createElement("div");
    aviso.id = "aviso-cookies";
    aviso.setAttribute("role", "dialog");
    aviso.setAttribute("aria-label", "Aviso de cookies");
    aviso.innerHTML = "<p>PONDERA usa Google Analytics para saber cuántas personas visitan la web. Solo se activa si lo aceptas; no hay publicidad ni seguimiento de otro tipo. " +
      "<a href=\"" + PAGINA_DE_PRIVACIDAD + "\">Más información</a>.</p>" +
      "<div class=\"botones-cookies\"><button type=\"button\" id=\"cookies-rechazar\">Rechazar</button><button type=\"button\" id=\"cookies-aceptar\">Aceptar</button></div>";
    document.body.appendChild(aviso);
    document.getElementById("cookies-aceptar").addEventListener("click", function () { guardar("si"); cargarAnalytics(); cerrarAviso(); });
    document.getElementById("cookies-rechazar").addEventListener("click", function () { guardar("no"); borrarCookiesDeAnalytics(); cerrarAviso(); });
  }

  const preferencia = leer();
  if (preferencia === "si") { cargarAnalytics(); } else if (preferencia === "no") { borrarCookiesDeAnalytics(); } else { mostrarAviso(); }
  document.addEventListener("click", function (evento) {
    const enlace = evento.target.closest ? evento.target.closest("#abrir-cookies") : null;
    if (enlace) { evento.preventDefault(); mostrarAviso(); }
  });
})();
