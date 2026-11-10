"use strict";

const modelo = MotorElectoral.prepararModelo(DATOS_MODELO);
const K = modelo.numeroDePartidos;
const P = modelo.numeroDeProvincias;
let objetivosActuales = Object.assign({}, DATOS_MODELO.objetivos);
let ultimoResultado = null;
let temporizador = null;
const SORTEOS_POR_DEFECTO = 2000;

function partidosPorVoto() {
  return modelo.partidos.slice().sort((a, b) => objetivosActuales[b] - objetivosActuales[a]);
}

/* ---------- Cálculo ---------- */

function recalcular() {
  const selectorDeSorteos = document.getElementById("numero-sorteos");
  const sorteos = selectorDeSorteos ? parseInt(selectorDeSorteos.value, 10) : SORTEOS_POR_DEFECTO;
  const estado = document.getElementById("estado-calculo") || document.createElement("span");
  estado.textContent = "Calculando…";
  setTimeout(function () {
    const inicio = performance.now();
    const central = MotorElectoral.repartoSinRuido(modelo, objetivosActuales);
    const simulacion = MotorElectoral.simular(modelo, { sorteos: sorteos, semilla: 20261129, objetivos: objetivosActuales });
    ultimoResultado = { central: central, simulacion: simulacion, sorteos: sorteos };
    estado.textContent = "Calculado en " + ((performance.now() - inicio) / 1000).toFixed(1).replace(".", ",") + " s";
    pintarNacional();
    pintarProvincia();
  }, 20);
}

function recalcularConRetraso() {
  clearTimeout(temporizador);
  temporizador = setTimeout(recalcular, 200);
}

/* ---------- Sección nacional ---------- */

function escanosCentrales() {
  const total = {};
  const escanos = ultimoResultado.central.escanos;
  modelo.partidos.forEach(function (partido, k) {
    let suma = 0;
    for (let p = 0; p < P; p++) suma += escanos[p * K + k];
    total[partido] = suma;
  });
  return total;
}

function pintarNacional() {
  if (!document.getElementById("barra-escanos")) return;
  const resumen = MotorElectoral.resumirNacional(modelo, ultimoResultado.simulacion);
  const centrales = escanosCentrales();

  const barra = document.getElementById("barra-escanos");
  barra.innerHTML = "";
  ORDEN_EN_LA_BARRA.forEach(function (partido) {
    const cantidad = centrales[partido] || 0;
    if (!cantidad) return;
    const trozo = document.createElement("div");
    trozo.style.width = (100 * cantidad / 350) + "%";
    trozo.style.background = COLORES[partido];
    trozo.title = NOMBRES[partido] + ": " + cantidad;
    trozo.textContent = cantidad >= 8 ? cantidad : "";
    barra.appendChild(trozo);
  });
  const marca = document.createElement("div");
  marca.className = "linea176";
  marca.style.left = (100 * 176 / 350) + "%";
  barra.appendChild(marca);
  document.getElementById("leyenda176").textContent = "Línea discontinua: mayoría absoluta (176 escaños). Barra: reparto central, sin ruido.";

  const pDerecha3 = MotorElectoral.probabilidadDeSuma(modelo, ultimoResultado.simulacion, ["PP", "VOX", "UPN"]);
  const pDerecha = MotorElectoral.probabilidadDeSuma(modelo, ultimoResultado.simulacion, DERECHA_AMPLIADA);
  const pIzquierda = MotorElectoral.probabilidadDeSuma(modelo, ultimoResultado.simulacion, IZQUIERDA_Y_NACIONALISTAS);
  document.getElementById("mayorias").innerHTML =
    '<div class="dato"><b>' + porcentaje(100 * pDerecha3) + '</b><span>PP + Vox + UPN suman 176 o más</span></div>' +
    '<div class="dato"><b>' + porcentaje(100 * pDerecha) + '</b><span>Derecha ampliada (PP, Vox, UPN, CC y SALF) suma 176 o más</span></div>' +
    '<div class="dato"><b>' + porcentaje(100 * pIzquierda) + '</b><span>Izquierda y nacionalistas (PSOE, Frente Amplio, Podemos, FV, Adelante, ERC, Junts, Bildu, PNV, BNG) suman 176 o más</span></div>';

  const cuerpo = document.querySelector("#tabla-nacional tbody");
  cuerpo.innerHTML = "";
  partidosPorVoto().forEach(function (partido) {
    if (partido === "OTROS") return;
    const r = resumen[partido];
    const fila = document.createElement("tr");
    fila.innerHTML = '<td>' + ficha(partido) + NOMBRES[partido] + '</td><td>' + porcentaje(100 * objetivosActuales[partido]) + '</td><td>' + entero(r.mediana) +
      '</td><td>' + entero(r.p10) + " a " + entero(r.p90) + '</td><td>' + entero(r.p025) + " a " + entero(r.p975) + '</td><td>' + porcentaje(100 * r.pAlMenos1) + '</td>';
    cuerpo.appendChild(fila);
  });
  document.getElementById("nota-sorteos").textContent = entero(ultimoResultado.sorteos) + " sorteos. Los rangos del 80 % y del 95 % dejan fuera el 10 % y el 2,5 % de los sorteos por cada extremo.";
}

/* ---------- Deslizadores ---------- */

function crearDeslizadores() {
  const contenedor = document.getElementById("deslizadores");
  if (!contenedor) return;
  contenedor.innerHTML = "";
  partidosPorVoto().forEach(function (partido) {
    const bloque = document.createElement("div");
    bloque.className = "deslizador";
    bloque.innerHTML = '<label for="d-' + partido + '">' + ficha(partido) + NOMBRES[partido] + '</label>' +
      '<input type="range" id="d-' + partido + '" min="0" max="45" step="0.1" value="' + (100 * objetivosActuales[partido]).toFixed(1) + '">' +
      '<output id="v-' + partido + '">' + porcentaje(100 * objetivosActuales[partido]) + '</output>';
    contenedor.appendChild(bloque);
    bloque.querySelector("input").addEventListener("input", function (evento) {
      moverPartido(partido, parseFloat(evento.target.value));
    });
  });
}

function moverPartido(partido, nuevoPorcentaje) {
  const nuevo = nuevoPorcentaje / 100;
  const anterior = objetivosActuales[partido];
  const restoAntes = 1 - anterior;
  const restoDespues = 1 - nuevo;
  if (restoAntes <= 0 || restoDespues < 0) return;
  modelo.partidos.forEach(function (otro) {
    if (otro !== partido) objetivosActuales[otro] = objetivosActuales[otro] * restoDespues / restoAntes;
  });
  objetivosActuales[partido] = nuevo;
  modelo.partidos.forEach(function (otro) {
    document.getElementById("d-" + otro).value = (100 * objetivosActuales[otro]).toFixed(1);
    document.getElementById("v-" + otro).textContent = porcentaje(100 * objetivosActuales[otro]);
  });
  recalcularConRetraso();
}

/* ---------- Provincias ---------- */

function crearSelectorDeProvincias() {
  const selector = document.getElementById("selector-provincia");
  if (!selector) return;
  modelo.provincias.forEach(function (provincia, p) {
    const opcion = document.createElement("option");
    opcion.value = p;
    opcion.textContent = provincia.nombre + " (" + provincia.escanos + ")";
    selector.appendChild(opcion);
  });
  selector.addEventListener("change", pintarProvincia);
}

function pintarProvincia() {
  if (!ultimoResultado || !document.getElementById("selector-provincia")) return;
  const p = parseInt(document.getElementById("selector-provincia").value, 10);
  const provincia = modelo.provincias[p];
  document.getElementById("resumen-provincia").textContent = provincia.comunidad + ": " + provincia.escanos + " escaños, " + entero(provincia.votos_validos) + " votos válidos (base 2023 sobre residentes).";
  const cuotas = ultimoResultado.central.cuotas;
  const escanosCentrales = ultimoResultado.central.escanos;
  const sorteos = ultimoResultado.sorteos;
  const filas = [];
  modelo.partidos.forEach(function (partido, k) {
    if (!modelo.presente[p * K + k] || partido === "OTROS") return;
    const cuentas = {};
    for (let s = 0; s < sorteos; s++) {
      const cantidad = ultimoResultado.simulacion.provinciales[(s * P + p) * K + k];
      cuentas[cantidad] = (cuentas[cantidad] || 0) + 1;
    }
    let masProbable = 0;
    let mejor = -1;
    Object.keys(cuentas).forEach(function (cantidad) {
      if (cuentas[cantidad] > mejor) { mejor = cuentas[cantidad]; masProbable = parseInt(cantidad, 10); }
    });
    filas.push({ partido: partido, cuota: cuotas[p * K + k], central: escanosCentrales[p * K + k], masProbable: masProbable, cuentas: cuentas });
  });
  filas.sort(function (a, b) { return b.cuota - a.cuota; });
  const cuerpo = document.querySelector("#tabla-provincia tbody");
  cuerpo.innerHTML = "";
  filas.forEach(function (f) {
    const trozos = Object.keys(f.cuentas).map(Number).sort(function (a, b) { return a - b; }).filter(function (n) { return f.cuentas[n] / sorteos >= 0.01; }).map(function (n) {
      const probabilidad = f.cuentas[n] / sorteos;
      return '<span class="prob" style="width:' + Math.max(2, Math.round(60 * probabilidad)) + 'px"></span>' + n + " escaños: " + porcentaje(100 * probabilidad);
    });
    const fila = document.createElement("tr");
    fila.innerHTML = '<td>' + ficha(f.partido) + NOMBRES[f.partido] + '</td><td>' + porcentaje(100 * f.cuota) + '</td><td>' + f.central + '</td><td>' + f.masProbable +
      '</td><td style="text-align:left;white-space:normal">' + trozos.join("<br>") + '</td>';
    cuerpo.appendChild(fila);
  });
}

/* ---------- Arranque ---------- */

const botonRestablecer = document.getElementById("restablecer");
if (botonRestablecer) {
  botonRestablecer.addEventListener("click", function () {
    objetivosActuales = Object.assign({}, DATOS_MODELO.objetivos);
    crearDeslizadores();
    recalcular();
  });
}
const selectorDeSorteosInicial = document.getElementById("numero-sorteos");
if (selectorDeSorteosInicial) { selectorDeSorteosInicial.addEventListener("change", recalcular); }
crearDeslizadores();
crearSelectorDeProvincias();
recalcular();
