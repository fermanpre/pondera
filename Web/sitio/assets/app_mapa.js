"use strict";
/*
 * Página del mapa: margen izquierda-derecha previsto para 2026 por provincia (mapa absoluto) y cuánto ha cambiado ese margen desde 2023 (mapa relativo).
 * 2023: datos_mapa_2023.js (votos a candidaturas agrupados por exportar_mapa_2023.py). 2026: reparto central del motor para los objetivos de datos_modelo.js.
 * La clasificación de partidos de 2026 tiene que decir lo mismo que la de exportar_mapa_2023.py y la tabla de la página.
 */
const BLOQUES_DEL_MAPA = {
  izquierda: ["PSOE", "SUMAR", "PODEMOS", "FV", "ADELANTE", "BILDU", "ERC", "BNG", "PACMA"],
  derecha: ["PP", "VOX", "UPN", "SALF", "JUNTS", "PNV", "CC"],
};
const LIMITE_DE_ESCALA = 40;
const CODO_DE_ESCALA = 10;
const LIMITE_DEL_CAMBIO = 20; // puntos de cambio de margen que saturan la escala del mapa de cambio
const AVANCE_EN_EL_TRAMO_LENTO = 0.2; // parte del recorrido rojo-púrpura que se hace entre |40| y |10| puntos

const formatoMargen = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function textoDeMargen(margen) {
  const redondeado = Math.round(Math.abs(margen) * 10) / 10;
  if (redondeado === 0) return "empate";
  return (margen > 0 ? "I+" : "D+") + formatoMargen.format(redondeado);
}

function colorDeMargen(margen) {
  const distancia = Math.min(Math.abs(margen), LIMITE_DE_ESCALA);
  let avance;
  if (distancia >= CODO_DE_ESCALA) {
    avance = AVANCE_EN_EL_TRAMO_LENTO * (LIMITE_DE_ESCALA - distancia) / (LIMITE_DE_ESCALA - CODO_DE_ESCALA);
  } else {
    avance = AVANCE_EN_EL_TRAMO_LENTO + (0.5 - AVANCE_EN_EL_TRAMO_LENTO) * (CODO_DE_ESCALA - distancia) / CODO_DE_ESCALA;
  }
  const posicion = margen >= 0 ? avance : 1 - avance;
  return "rgb(" + Math.round(255 * (1 - posicion)) + ",0," + Math.round(255 * posicion) + ")";
}

// Mapa de cambio: escala lineal, del rojo (el margen se ha movido hacia la izquierda) al azul (hacia la derecha), con el púrpura en «sin cambio». Los colores extremos son los del mapa de margen.
function colorDeCambio(cambio) {
  const recorrido = Math.max(-1, Math.min(1, cambio / LIMITE_DEL_CAMBIO)); // +1: todo a la izquierda, -1: todo a la derecha
  const posicion = 0.5 - 0.5 * recorrido;
  return "rgb(" + Math.round(255 * (1 - posicion)) + ",0," + Math.round(255 * posicion) + ")";
}

function textoDeCambio(cambio) {
  const redondeado = Math.round(Math.abs(cambio) * 10) / 10;
  if (redondeado === 0) return "sin cambio";
  return (cambio > 0 ? "hacia la izquierda " : "hacia la derecha ") + formatoMargen.format(redondeado) + " puntos";
}

/* ---------- Datos de las dos elecciones ---------- */

function datosDe2023() {
  const resultado = {};
  Object.keys(MAPA_2023).forEach(function (provincia) {
    const v = MAPA_2023[provincia];
    resultado[provincia] = { izq: 100 * v.izq / v.total, der: 100 * v.der / v.total, otros: 100 * v.otros / v.total };
  });
  return resultado;
}

function datosDe2026() {
  const modelo = MotorElectoral.prepararModelo(DATOS_MODELO);
  const central = MotorElectoral.repartoSinRuido(modelo, DATOS_MODELO.objetivos);
  const K = modelo.numeroDePartidos;
  const resultado = {};
  DATOS_MODELO.provincias.forEach(function (provincia, p) {
    let izq = 0, der = 0, otros = 0;
    modelo.partidos.forEach(function (partido, k) {
      const cuota = 100 * central.cuotas[p * K + k];
      if (BLOQUES_DEL_MAPA.izquierda.indexOf(partido) >= 0) izq += cuota;
      else if (BLOQUES_DEL_MAPA.derecha.indexOf(partido) >= 0) der += cuota;
      else otros += cuota;
    });
    resultado[provincia.nombre] = { izq: izq, der: der, otros: otros };
  });
  return resultado;
}

/* ---------- Dibujo ---------- */

function clonarMapa(contenedor) {
  const plantilla = document.getElementById("svg-provincias");
  contenedor.appendChild(plantilla.content.cloneNode(true));
  return contenedor.querySelector("svg");
}

function pintar(contenedor, datos, anio) {
  const svg = clonarMapa(contenedor);
  svg.querySelectorAll("g.prov").forEach(function (grupo) {
    const nombre = grupo.getAttribute("data-nombre");
    const clave = grupo.getAttribute("data-boe");
    const d = datos[clave];
    if (!d) return;
    const margen = d.izq - d.der;
    grupo.style.setProperty("--relleno", colorDeMargen(margen));
    grupo.setAttribute("tabindex", "0");
    grupo.setAttribute("data-provincia", clave);
    grupo.setAttribute("data-anio", anio);
    const titulo = grupo.querySelector("title");
    if (titulo) titulo.textContent = nombre + " (" + anio + "): " + textoDeMargen(margen);
  });
  return svg;
}

function pintarCambio(contenedor) {
  const svg = clonarMapa(contenedor);
  svg.querySelectorAll("g.prov").forEach(function (grupo) {
    const clave = grupo.getAttribute("data-boe");
    const a = DATOS_PROVINCIAS.a2023[clave];
    const b = DATOS_PROVINCIAS.a2026[clave];
    if (!a || !b) return;
    const cambio = (b.izq - b.der) - (a.izq - a.der);
    grupo.style.setProperty("--relleno", colorDeCambio(cambio));
    grupo.setAttribute("tabindex", "0");
    grupo.setAttribute("data-provincia", clave);
    const titulo = grupo.querySelector("title");
    if (titulo) titulo.textContent = grupo.getAttribute("data-nombre") + ": " + textoDeCambio(cambio);
  });
  return svg;
}

function mostrarFicha(clave, nombre) {
  const ficha = document.getElementById("ficha-provincia");
  const a = DATOS_PROVINCIAS.a2023[clave];
  const b = DATOS_PROVINCIAS.a2026[clave];
  if (!a || !b) return;
  const margenA = a.izq - a.der;
  const margenB = b.izq - b.der;
  const cambio = margenB - margenA;
  const fila = function (anio, d, margen) {
    return "<tr><th scope=\"row\">" + anio + "</th><td class=\"num\">" + porcentaje(d.izq) + "</td><td class=\"num\">" + porcentaje(d.der) + "</td><td class=\"num\">" + porcentaje(d.otros) +
      "</td><td class=\"num\"><span class=\"muestra-color\" style=\"background:" + colorDeMargen(margen) + "\"></span> " + textoDeMargen(margen) + "</td></tr>";
  };
  ficha.innerHTML = "<h3>" + nombre + "</h3><table class=\"tabla-ficha\"><thead><tr><th></th><th class=\"num\">Izquierda</th><th class=\"num\">Derecha</th><th class=\"num\">Sin lado</th><th class=\"num\">Margen</th></tr></thead><tbody>" +
    fila("2023", a, margenA) + fila("2026", b, margenB) + "</tbody></table><p class=\"nota\">Cambio de margen: " + (cambio >= 0 ? "+" : "−") + formatoMargen.format(Math.abs(cambio)) +
    " puntos (" + (Math.abs(cambio) < 0.05 ? "sin cambio" : cambio > 0 ? "hacia la izquierda" : "hacia la derecha") + ").</p>";
}

function activarFicha(svg) {
  svg.addEventListener("mouseover", function (evento) {
    const grupo = evento.target.closest("g.prov");
    if (grupo) mostrarFicha(grupo.getAttribute("data-provincia"), grupo.getAttribute("data-nombre"));
  });
  svg.addEventListener("click", function (evento) {
    const grupo = evento.target.closest("g.prov");
    if (grupo) mostrarFicha(grupo.getAttribute("data-provincia"), grupo.getAttribute("data-nombre"));
  });
  svg.addEventListener("focusin", function (evento) {
    const grupo = evento.target.closest("g.prov");
    if (grupo) mostrarFicha(grupo.getAttribute("data-provincia"), grupo.getAttribute("data-nombre"));
  });
}

function dibujarLeyenda() {
  const contenedor = document.getElementById("leyenda-mapa-2026");
  const tramos = [];
  const pasos = 80;
  for (let i = 0; i < pasos; i++) {
    const margen = LIMITE_DE_ESCALA - (i + 0.5) / pasos * 2 * LIMITE_DE_ESCALA;
    tramos.push(colorDeMargen(margen));
  }
  const gradiente = "linear-gradient(to right," + tramos.map(function (color, i) { return color + " " + (100 * i / pasos).toFixed(2) + "%," + color + " " + (100 * (i + 1) / pasos).toFixed(2) + "%"; }).join(",") + ")";
  const marcas = [[40, "I+40"], [10, "I+10"], [0, "0"], [-10, "D+10"], [-40, "D+40"]].map(function (par) {
    const izquierda = 100 * (LIMITE_DE_ESCALA - par[0]) / (2 * LIMITE_DE_ESCALA);
    return "<span style=\"left:" + izquierda + "%\">" + par[1] + "</span>";
  }).join("");
  contenedor.innerHTML = "<div class=\"barra-escala\" style=\"background:" + gradiente + "\"></div><div class=\"marcas-escala\">" + marcas + "</div>" +
    "<p class=\"nota\">Margen izquierda − derecha, en puntos de porcentaje sobre votos a candidaturas.</p>";
}

function dibujarLeyendaDelCambio() {
  const contenedor = document.getElementById("leyenda-mapa-cambio");
  const tramos = [];
  const pasos = 80;
  for (let i = 0; i < pasos; i++) {
    const cambio = LIMITE_DEL_CAMBIO - (i + 0.5) / pasos * 2 * LIMITE_DEL_CAMBIO;
    tramos.push(colorDeCambio(cambio));
  }
  const gradiente = "linear-gradient(to right," + tramos.map(function (color, i) { return color + " " + (100 * i / pasos).toFixed(2) + "%," + color + " " + (100 * (i + 1) / pasos).toFixed(2) + "%"; }).join(",") + ")";
  const marcas = [[LIMITE_DEL_CAMBIO, "izquierda +" + LIMITE_DEL_CAMBIO], [0, "sin cambio"], [-LIMITE_DEL_CAMBIO, "derecha +" + LIMITE_DEL_CAMBIO]].map(function (par) {
    const izquierda = 100 * (LIMITE_DEL_CAMBIO - par[0]) / (2 * LIMITE_DEL_CAMBIO);
    return "<span style=\"left:" + izquierda + "%\">" + par[1] + "</span>";
  }).join("");
  contenedor.innerHTML = "<div class=\"barra-escala\" style=\"background:" + gradiente + "\"></div><div class=\"marcas-escala\">" + marcas + "</div>" +
    "<p class=\"nota\">Cambio del margen izquierda − derecha entre 2023 y 2026, en puntos. Azul: la provincia se mueve hacia la derecha; rojo, hacia la izquierda.</p>";
}

/* ---------- Tabla ---------- */

let ordenActual = { campo: "nombre", sentido: 1 };

function filasDeTabla() {
  return Object.keys(DATOS_PROVINCIAS.a2023).map(function (nombre) {
    const m2023 = DATOS_PROVINCIAS.a2023[nombre].izq - DATOS_PROVINCIAS.a2023[nombre].der;
    const m2026 = DATOS_PROVINCIAS.a2026[nombre].izq - DATOS_PROVINCIAS.a2026[nombre].der;
    return { nombre: nombre, m2023: m2023, m2026: m2026, cambio: m2026 - m2023 };
  });
}

function dibujarTabla() {
  const filas = filasDeTabla();
  filas.sort(function (x, y) {
    if (ordenActual.campo === "nombre") return ordenActual.sentido * x.nombre.localeCompare(y.nombre, "es");
    return ordenActual.sentido * (x[ordenActual.campo] - y[ordenActual.campo]);
  });
  const cuerpo = document.querySelector("#tabla-margenes-mapa tbody");
  cuerpo.innerHTML = filas.map(function (f) {
    const cambioTexto = (f.cambio >= 0 ? "+" : "−") + formatoMargen.format(Math.abs(f.cambio));
    return "<tr><td>" + f.nombre + "</td><td class=\"num\"><span class=\"muestra-color\" style=\"background:" + colorDeMargen(f.m2023) + "\"></span> " + textoDeMargen(f.m2023) +
      "</td><td class=\"num\"><span class=\"muestra-color\" style=\"background:" + colorDeMargen(f.m2026) + "\"></span> " + textoDeMargen(f.m2026) + "</td><td class=\"num\">" + cambioTexto + "</td></tr>";
  }).join("");
}

function activarOrdenDeTabla() {
  document.querySelectorAll("#tabla-margenes-mapa th[data-orden]").forEach(function (cabecera) {
    cabecera.style.cursor = "pointer";
    cabecera.addEventListener("click", function () {
      const campo = cabecera.getAttribute("data-orden");
      ordenActual = { campo: campo, sentido: ordenActual.campo === campo ? -ordenActual.sentido : (campo === "nombre" ? 1 : -1) };
      dibujarTabla();
    });
  });
}

const DATOS_PROVINCIAS = { a2023: datosDe2023(), a2026: datosDe2026() };
activarFicha(pintarCambio(document.getElementById("mapa-cambio")));
activarFicha(pintar(document.getElementById("mapa-2026"), DATOS_PROVINCIAS.a2026, 2026));
dibujarLeyendaDelCambio();
dibujarLeyenda();
activarOrdenDeTabla();
dibujarTabla();
