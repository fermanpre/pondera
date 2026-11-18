"use strict";

const modelo = MotorElectoral.prepararModelo(DATOS_MODELO);
const K = modelo.numeroDePartidos;
const P = modelo.numeroDeProvincias;
let objetivosActuales = Object.assign({}, DATOS_MODELO.objetivos);

// Fecha del promedio de encuestas con el que se calcularon los objetivos nacionales (se renueva cada día con el flujo de actualización)
(function mostrarFechaDelPromedio() {
  const elemento = document.getElementById("fecha-promedio");
  if (!elemento || !DATOS_MODELO.fecha_promedio) return;
  const fecha = new Date(DATOS_MODELO.fecha_promedio + "T12:00:00");
  elemento.innerHTML = "Los objetivos nacionales son los del <a href=\"index.html#promedio\">promedio de encuestas</a> a " +
    fecha.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) + ", y la previsión se recalcula cada día con él.";
})();
let ultimoResultado = null;
let temporizador = null;
// Sorteos del Monte Carlo en las páginas sin selector (previsión, provincias y comunidades): 10.000 desde el 17/11/2026. El simulador deja elegir (por defecto 2.000, para que los deslizadores respondan al momento).
const SORTEOS_POR_DEFECTO = 10000;
const SORTEOS_RAPIDOS = 2000;  // primera pasada en el hilo principal mientras un trabajador calcula el resto
let generacionDeCalculo = 0;
let trabajadorDeSimulacion = null;

function partidosPorVoto() {
  return modelo.partidos.slice().sort((a, b) => objetivosActuales[b] - objetivosActuales[a]);
}

/* ---------- Cálculo ---------- */

function pintarTodoConElResultado() {
  pintarNacional();
  pintarProvincia();
  pintarComunidad();
  if (typeof actualizarMapasConResultado === "function") actualizarMapasConResultado();  // app_mapa.js: los mapas siguen al reparto central con los objetivos de ese momento
}

function textoDeSegundos(inicio) { return ((performance.now() - inicio) / 1000).toFixed(1).replace(".", ","); }

// Con más de SORTEOS_RAPIDOS sorteos se calcula en dos pasadas: primero 2.000 en el hilo principal (la página se pinta enseguida) y, a continuación, el total pedido en un
// trabajador (Web Worker) para no bloquear la página; al llegar, se repinta todo. Si el navegador no admite el trabajador, el total se calcula en el hilo principal.
function recalcular() {
  const selectorDeSorteos = document.getElementById("numero-sorteos");
  const sorteos = selectorDeSorteos ? parseInt(selectorDeSorteos.value, 10) : SORTEOS_POR_DEFECTO;
  const estado = document.getElementById("estado-calculo") || document.createElement("span");
  const generacion = ++generacionDeCalculo;
  if (trabajadorDeSimulacion) { trabajadorDeSimulacion.terminate(); trabajadorDeSimulacion = null; }
  estado.textContent = "Calculando…";
  setTimeout(function () {
    if (generacion !== generacionDeCalculo) return;
    const inicio = performance.now();
    const central = MotorElectoral.repartoSinRuido(modelo, objetivosActuales);
    const primeros = Math.min(sorteos, SORTEOS_RAPIDOS);
    const simulacion = MotorElectoral.simular(modelo, { sorteos: primeros, semilla: 20261129, objetivos: objetivosActuales });
    ultimoResultado = { central: central, simulacion: simulacion, sorteos: primeros };
    pintarTodoConElResultado();
    if (sorteos <= primeros) {
      estado.textContent = "Calculado en " + textoDeSegundos(inicio) + " s";
      if (typeof alTerminarElCalculo === "function") alTerminarElCalculo();
      return;
    }
    estado.textContent = "Mostrando " + entero(primeros) + " sorteos; calculando " + entero(sorteos) + "…";
    const terminar = function (resultadoCompleto) {
      if (generacion !== generacionDeCalculo) return;
      ultimoResultado = { central: central, simulacion: resultadoCompleto, sorteos: sorteos };
      estado.textContent = "Calculado en " + textoDeSegundos(inicio) + " s";
      pintarTodoConElResultado();
      if (typeof alTerminarElCalculo === "function") alTerminarElCalculo();
    };
    const enElHiloPrincipal = function () {
      setTimeout(function () { terminar(MotorElectoral.simular(modelo, { sorteos: sorteos, semilla: 20261129, objetivos: objetivosActuales })); }, 20);
    };
    try {
      const trabajador = new Worker("assets/trabajador_simulacion.js");
      trabajadorDeSimulacion = trabajador;
      trabajador.onmessage = function (evento) { trabajador.terminate(); if (trabajadorDeSimulacion === trabajador) trabajadorDeSimulacion = null; terminar(evento.data.simulacion); };
      trabajador.onerror = function () { trabajador.terminate(); if (trabajadorDeSimulacion === trabajador) trabajadorDeSimulacion = null; enElHiloPrincipal(); };
      trabajador.postMessage({ datos: DATOS_MODELO, objetivos: objetivosActuales, sorteos: sorteos, semilla: 20261129 });
    } catch (error) {
      enElHiloPrincipal();
    }
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

/* ---------- Probabilidad de mayoría absoluta de cada combinación ---------- */

// Cada combinación suma los escaños de sus partidos en cada sorteo del Monte Carlo; se cuenta la proporción de sorteos con 176 o más.
// UPN va con el PP porque concurren en coalición en Navarra (los escaños de esa lista se reparten por orden entre ambos).
const IZQUIERDA_ESTATAL = ["PSOE", "SUMAR", "FV", "UPC"];
const NACIONALISTAS_DE_IZQUIERDA = ["ERC", "BILDU", "BNG", "ADELANTE"];
const BLOQUE_DE_2023_SIN_JUNTS = IZQUIERDA_ESTATAL.concat(["PODEMOS", "PNV", "ERC", "BILDU", "BNG"]);
const COLOR_DERECHA = "#1d6fb8";
const COLOR_IZQUIERDA = "#d4141c";
const COLOR_OTRAS = "#7b3f9e";
const PROBABILIDAD_MINIMA_DE_MAYORIA = 0.001;
const COMBINACIONES_DE_MAYORIA = [
  { nombre: "PP (con UPN) solo", partidos: ["PP", "UPN"], color: COLOR_DERECHA },
  { nombre: "PP + Vox", partidos: ["PP", "UPN", "VOX"], color: COLOR_DERECHA },
  { nombre: "Derecha ampliada: PP + Vox + CC + SALF", partidos: ["PP", "UPN", "VOX", "CC", "SALF"], color: COLOR_DERECHA },
  { nombre: "PSOE solo", partidos: ["PSOE"], color: COLOR_IZQUIERDA },
  { nombre: "Izquierda estatal: PSOE + Frente Amplio + FV + UPC", partidos: IZQUIERDA_ESTATAL, color: COLOR_IZQUIERDA },
  { nombre: "Izquierda estatal con Podemos", partidos: IZQUIERDA_ESTATAL.concat(["PODEMOS"]), color: COLOR_IZQUIERDA },
  { nombre: "Izquierda estatal con Podemos y nacionalistas de izquierda (ERC, Bildu, BNG, Adelante)", partidos: IZQUIERDA_ESTATAL.concat(["PODEMOS"], NACIONALISTAS_DE_IZQUIERDA), color: COLOR_IZQUIERDA },
  // Adelante Andalucía no obtuvo representación en 2023 y no pudo apoyar la investidura: el «bloque de 2023» no la incluye, y las variantes con Adelante se muestran aparte.
  { nombre: "Bloque de 2023 sin Junts", partidos: BLOQUE_DE_2023_SIN_JUNTS, color: COLOR_IZQUIERDA },
  { nombre: "Bloque de 2023 sin Junts + Adelante", partidos: BLOQUE_DE_2023_SIN_JUNTS.concat(["ADELANTE"]), color: COLOR_IZQUIERDA },
  { nombre: "Bloque de 2023 completo", partidos: BLOQUE_DE_2023_SIN_JUNTS.concat(["JUNTS"]), color: COLOR_IZQUIERDA },
  { nombre: "Bloque de 2023 completo + Adelante", partidos: BLOQUE_DE_2023_SIN_JUNTS.concat(["JUNTS", "ADELANTE"]), color: COLOR_IZQUIERDA },
];
const COMBINACION_OTRAS = { nombre: "PP + PSOE", partidos: ["PP", "UPN", "PSOE"], color: COLOR_OTRAS };

function textoDeProbabilidad(p) {
  if (p === 0) return "0%";
  if (p < 0.001) return "< 0,1%";
  return porcentaje(100 * p);
}

// Diputados que suma la combinación en el reparto central (sin ruido)
function escanosDeLaCombinacion(combinacion, centrales) {
  return combinacion.partidos.reduce(function (suma, partido) { return suma + (centrales[partido] || 0); }, 0);
}

// Horquilla del 95% de los escaños que suma la combinación en las simulaciones (percentiles 2,5 y 97,5 de la suma de sus partidos en cada sorteo)
function horquillaDeLaCombinacion(combinacion) {
  const K = modelo.numeroDePartidos;
  const sorteos = ultimoResultado.sorteos;
  const columnas = combinacion.partidos.map(function (partido) { return modelo.partidos.indexOf(partido); }).filter(function (k) { return k >= 0; });
  const sumas = [];
  for (let s = 0; s < sorteos; s++) {
    let suma = 0;
    columnas.forEach(function (k) { suma += ultimoResultado.simulacion.nacionales[s * K + k]; });
    sumas.push(suma);
  }
  sumas.sort(function (a, b) { return a - b; });
  return { desde: Math.round(MotorElectoral.percentil(sumas, 0.025)), hasta: Math.round(MotorElectoral.percentil(sumas, 0.975)) };
}

function filaDeMayoria(combinacion, p, centrales) {
  const escanos = escanosDeLaCombinacion(combinacion, centrales);
  const horquilla = horquillaDeLaCombinacion(combinacion);
  return '<div class="barra-prob" title="' + combinacion.partidos.map(function (x) { return NOMBRES[x] || x; }).join(" + ") + ': horquilla del 95% de ' + entero(horquilla.desde) + ' a ' + entero(horquilla.hasta) + ' escaños; ' + entero(escanos) + ' en el reparto central">' +
    '<span class="barra-prob-nombre">' + combinacion.nombre + '</span>' +
    '<span class="barra-prob-pista"><span class="barra-prob-relleno" style="width:' + (100 * p).toFixed(2) + '%;background:' + combinacion.color + '"></span></span>' +
    '<b>' + textoDeProbabilidad(p) + '</b>' +
    '<span class="barra-prob-escanos">' + entero(horquilla.desde) + '-' + entero(horquilla.hasta) + ' (<span class="' + (escanos >= 176 ? "mayoria" : "") + '">' + entero(escanos) + '</span>)</span></div>';
}

function pintarMayorias() {
  const contenedor = document.getElementById("mayorias");
  if (!contenedor) return;
  const probabilidad = function (combinacion) { return MotorElectoral.probabilidadDeSuma(modelo, ultimoResultado.simulacion, combinacion.partidos); };
  const centrales = escanosCentrales();
  const calculadas = COMBINACIONES_DE_MAYORIA.map(function (combinacion) { return { combinacion: combinacion, p: probabilidad(combinacion) }; });
  const visibles = calculadas.filter(function (elemento) { return elemento.p >= PROBABILIDAD_MINIMA_DE_MAYORIA; })
    .sort(function (a, b) { return b.p - a.p; });
  let html = '<h3>Probabilidad de mayoría absoluta (176 escaños o más)</h3><div class="grupo-mayorias"><div class="barra-prob barra-prob-cabecera"><span></span><span></span><b>Prob.</b><span class="barra-prob-escanos" title="Horquilla del 95% de los escaños que suma la combinación en las simulaciones y, entre paréntesis, los que suma en el reparto central (sin ruido); en negrita si llega a 176">Rango 95% (central)</span></div>';
  visibles.forEach(function (elemento) { html += filaDeMayoria(elemento.combinacion, elemento.p, centrales); });
  html += '</div>';
  if (visibles.length < calculadas.length) {
    html += '<p class="nota">Todas las demás mayorías razonablemente posibles no alcanzan el 0,1% de las simulaciones.</p>';
  }
  html += '<div class="grupo-mayorias"><h4>Otras</h4>' + filaDeMayoria(COMBINACION_OTRAS, probabilidad(COMBINACION_OTRAS), centrales) + '</div>';
  contenedor.innerHTML = html;
}

/* ---------- Tabla nacional: 2026 frente a 2023 ---------- */

// Clave de cada partido del modelo en resultados_2023.js. Podemos, SALF y Front Valencià no tuvieron candidatura propia en 2023 (Podemos y Compromís iban dentro de Sumar).
const CLAVE_EN_2023 = { PP: "PP", PSOE: "PSOE", VOX: "VOX", SUMAR: "SUMAR", FV: "FV", UPC: "UPC", ERC: "ERC", JUNTS: "JUNTS", BILDU: "BILDU", PNV: "PNV", BNG: "BNG", CC: "CC", UPN: "UPN", EXISTE: "EXISTE", ADELANTE: "ADELANTE", PACMA: "PACMA" };

function resultadosNacionalesDe2023() {
  if (typeof RESULTADOS_2023_NACIONAL === "undefined" || typeof MAPA_2023 === "undefined") return null;
  const votos = {};
  const escanos = {};
  Object.keys(RESULTADOS_2023_NACIONAL).forEach(function (clave) {
    votos[clave] = RESULTADOS_2023_NACIONAL[clave].votos;
    escanos[clave] = RESULTADOS_2023_NACIONAL[clave].escanos;
  });
  let total = 0;
  Object.keys(MAPA_2023).forEach(function (provincia) { total += MAPA_2023[provincia].total; });
  // Front Valencià (2026) equivale, a grandes rasgos, a lo que fue Sumar en la Comunitat Valenciana en 2023 (con Compromís dentro), y las encuestas publican el Frente Amplio sin ella:
  // para comparar, el «FV de 2023» es el voto y los escaños de Sumar en sus tres provincias y el Frente Amplio de 2023 es el total de Sumar menos esa parte.
  if (typeof RESULTADOS_2023 !== "undefined") {
    let votosEnLaValenciana = 0, escanosEnLaValenciana = 0;
    ["Alicante/Alacant", "Castellón/Castelló", "Valencia/València"].forEach(function (provincia) {
      const sumar = RESULTADOS_2023[provincia] && RESULTADOS_2023[provincia].candidaturas.find(function (c) { return c.clave === "SUMAR"; });
      if (sumar) { votosEnLaValenciana += sumar.votos; escanosEnLaValenciana += sumar.escanos; }
    });
    votos.FV = votosEnLaValenciana;
    escanos.FV = escanosEnLaValenciana;
    votos.SUMAR -= votosEnLaValenciana;
    escanos.SUMAR -= escanosEnLaValenciana;
    // Unidad del Pueblo Canario (2026: Podemos, Nueva Canarias e IU) equivale a Sumar en Canarias en 2023 más Nueva Canarias, que concurrió aparte; el Frente Amplio de 2023 es el total de Sumar menos la parte de Canarias
    let votosEnCanarias = 0, escanosEnCanarias = 0, votosSumarEnCanarias = 0;
    PROVINCIAS_CANARIAS.forEach(function (provincia) {
      const candidaturas = RESULTADOS_2023[provincia] ? RESULTADOS_2023[provincia].candidaturas : [];
      candidaturas.forEach(function (c) {
        if (c.clave === "SUMAR") { votosSumarEnCanarias += c.votos; votosEnCanarias += c.votos; escanosEnCanarias += c.escanos; }
        else if (c.clave === "X:NC- bc") votosEnCanarias += c.votos;
      });
    });
    votos.UPC = votosEnCanarias;
    escanos.UPC = escanosEnCanarias;
    votos.SUMAR -= votosSumarEnCanarias;
    escanos.SUMAR -= escanosEnCanarias;
  }
  return { votos: votos, escanos: escanos, total: total };
}

function conSigno(valor, decimales) {
  const redondeado = Math.round(valor * Math.pow(10, decimales)) / Math.pow(10, decimales);
  if (redondeado === 0) return decimales ? formatoPorcentaje.format(0) : "0";
  const texto = decimales ? formatoPorcentaje.format(Math.abs(redondeado)) : entero(Math.abs(redondeado));
  return (redondeado > 0 ? "+" : "−") + texto;
}

// Diferencia con signo y triángulo: ▲ verde si sube, ▼ rojo si baja (el signo se mantiene para quien no distinga los colores)
function conTriangulo(valor, decimales) {
  const texto = conSigno(valor, decimales);
  if (texto.charAt(0) === "+") return '<span class="sube"><span class="triangulo" aria-hidden="true">▲</span>' + texto + "</span>";
  if (texto.charAt(0) === "−") return '<span class="baja"><span class="triangulo" aria-hidden="true">▼</span>' + texto + "</span>";
  return '<span class="igual" title="Sin cambio">=</span>';
}

function textoDeRango(minimo, maximo) {
  return minimo === maximo ? entero(minimo) : entero(minimo) + "-" + entero(maximo);
}

/* Histograma nacional de un partido: tramo de escaños que reúne el 50% central de los sorteos (de su percentil 25 al 75), con al menos tres valores para que se vea la forma. */
function histogramaNacional(partido, indice, central) {
  const sorteos = ultimoResultado.sorteos;
  const K = modelo.numeroDePartidos;
  const cuentas = {};
  const valores = [];
  for (let s = 0; s < sorteos; s++) {
    const escanos = ultimoResultado.simulacion.nacionales[s * K + indice];
    cuentas[escanos] = (cuentas[escanos] || 0) + 1;
    valores.push(escanos);
  }
  valores.sort(function (a, b) { return a - b; });
  let desde = valores[Math.floor(0.25 * (sorteos - 1))];
  let hasta = valores[Math.ceil(0.75 * (sorteos - 1))];
  while (hasta - desde < 2) { if (desde > 0) desde -= 1; hasta += 1; if (hasta - desde >= 2) break; }
  let masProbable = desde;
  Object.keys(cuentas).forEach(function (n) { if (cuentas[n] > (cuentas[masProbable] || 0)) masProbable = Number(n); });
  return histogramaDeEscanos({ partido: partido, cuentas: cuentas, central: central, masProbable: masProbable }, sorteos, { desde: desde, hasta: hasta, ancho: 180, compacto: true });
}

function cabeceraDeLaTablaNacional() {
  return '<tr><th rowspan="2">Partido</th><th colspan="3" class="grupo-columnas">Voto (%)</th><th colspan="3" class="grupo-columnas">Escaños</th><th colspan="2" class="grupo-columnas">Rango de escaños</th><th rowspan="2" class="col-histograma" title="Probabilidad de cada total de escaños en el 50% central de las simulaciones (del percentil 25 al 75). La banda oscura es el reparto central.">Distribución (50% central)</th></tr>' +
    '<tr><th>2023</th><th>2026</th><th>Dif.</th><th>2023</th><th>2026</th><th>Dif.</th><th>80%</th><th>95%</th></tr>';
}

// Orden fijo de la tabla nacional: primero los partidos de ámbito estatal (con Front Valencià, Unidad del Pueblo Canario y Podemos pegados a Frente Amplio, para comparar con 2023) y después los
// periféricos por voto estimado (orden del 18/11/2026: ERC, Adelante, Bildu, Junts, BNG, PNV, UPN, CC y Existe), con PACMA al final
const ORDEN_DE_LA_TABLA = ["PP", "PSOE", "VOX", "SUMAR", "FV", "UPC", "PODEMOS", "SALF", "ERC", "ADELANTE", "BILDU", "JUNTS", "BNG", "PNV", "UPN", "CC", "EXISTE", "PACMA"];

function partidosEnElOrdenDeLaTabla() {
  const resto = partidosPorVoto().filter(function (partido) { return ORDEN_DE_LA_TABLA.indexOf(partido) < 0; });
  return ORDEN_DE_LA_TABLA.filter(function (partido) { return modelo.partidos.indexOf(partido) >= 0; }).concat(resto);
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
  if (typeof pintarHemiciclo === "function") pintarHemiciclo(document.getElementById("hemiciclo"), centrales);
  const marca = document.createElement("div");
  marca.className = "linea176";
  marca.style.left = (100 * 176 / 350) + "%";
  barra.appendChild(marca);
  document.getElementById("leyenda176").textContent = "Línea negra: mayoría absoluta (176 escaños). Barra: reparto central, sin ruido.";

  pintarMayorias();

  document.querySelector("#tabla-nacional thead").innerHTML = cabeceraDeLaTablaNacional();
  const cuerpo = document.querySelector("#tabla-nacional tbody");
  cuerpo.innerHTML = "";
  const de2023 = resultadosNacionalesDe2023();
  // Total comparable con Sumar 2023: Frente Amplio + Front Valencià + Unidad del Pueblo Canario + Podemos frente al Sumar de 2023 (con Podemos, Compromís y sus socios territoriales dentro). Adelante Andalucía no entra: en 2023 concurrió aparte, solo en Cádiz.
  // Va justo debajo de Podemos, en cursiva y en gris (fila-subtotal).
  function filaDeTotalComparable() {
    if (!(de2023 && typeof RESULTADOS_2023_NACIONAL !== "undefined" && RESULTADOS_2023_NACIONAL.SUMAR)) return null;
    const familia = ["SUMAR", "FV", "UPC", "PODEMOS"].filter(function (partido) { return modelo.partidos.indexOf(partido) >= 0; });
    const voto2026 = familia.reduce(function (suma, partido) { return suma + 100 * objetivosActuales[partido]; }, 0);
    const escanos2026 = familia.reduce(function (suma, partido) { return suma + (centrales[partido] || 0); }, 0);
    const voto2023 = 100 * RESULTADOS_2023_NACIONAL.SUMAR.votos / de2023.total;
    const escanos2023 = RESULTADOS_2023_NACIONAL.SUMAR.escanos;
    const filaTotal = document.createElement("tr");
    filaTotal.className = "fila-subtotal";
    filaTotal.innerHTML = '<td class="etiqueta-subtotal">Total comparable con Sumar 2023<br><span class="detalle-subtotal">Frente Amplio + FV + UPC + Podemos</span></td><td>' + porcentaje(voto2023) + '</td><td>' + porcentaje(voto2026) + '</td><td>' + conTriangulo(voto2026 - voto2023, 1) + '</td>' +
      '<td>' + entero(escanos2023) + '</td><td>' + entero(escanos2026) + '</td><td>' + conTriangulo(escanos2026 - escanos2023, 0) + '</td><td colspan="3"></td>';
    return filaTotal;
  }
  let totalColocado = false;
  partidosEnElOrdenDeLaTabla().forEach(function (partido) {
    if (partido === "OTROS") return;
    const r = resumen[partido];
    const voto = 100 * objetivosActuales[partido];
    const escanos = centrales[partido] || 0;
    const clave = CLAVE_EN_2023[partido];
    let celdasDe2023 = ["–", "–", "–", "–"];  // voto 2023, dif. de voto, escaños 2023, dif. de escaños
    if (de2023 && clave) {
      const voto2023 = 100 * (de2023.votos[clave] || 0) / de2023.total;
      const escanos2023 = de2023.escanos[clave] || 0;
      celdasDe2023 = [porcentaje(voto2023), conTriangulo(voto - voto2023, 1), entero(escanos2023), conTriangulo(escanos - escanos2023, 0)];
    }
    const fila = document.createElement("tr");
    // Orden de columnas: voto 2023, voto 2026, dif. voto, escaños 2023, escaños 2026, dif. escaños, rango 80%, rango 95%
    fila.innerHTML = '<td>' + ficha(partido) + NOMBRES[partido] + '</td><td>' + celdasDe2023[0] + '</td><td>' + porcentaje(voto) + '</td><td>' + celdasDe2023[1] + '</td>' +
      '<td>' + celdasDe2023[2] + '</td><td>' + entero(escanos) + '</td><td>' + celdasDe2023[3] + '</td>' +
      '<td>' + textoDeRango(r.p10, r.p90) + '</td><td>' + textoDeRango(r.p025, r.p975) + '</td><td class="col-histograma">' + histogramaNacional(partido, modelo.partidos.indexOf(partido), escanos) + '</td>';
    cuerpo.appendChild(fila);
    if (partido === "PODEMOS") {
      const total = filaDeTotalComparable();
      if (total) { cuerpo.appendChild(total); totalColocado = true; }
    }
  });
  if (!totalColocado) { const total = filaDeTotalComparable(); if (total) cuerpo.appendChild(total); }
  document.getElementById("nota-sorteos").textContent = entero(ultimoResultado.sorteos) + " sorteos. Los rangos del 80% y del 95% dejan fuera el 10% y el 2,5% de los sorteos por cada extremo.";
}

/* ---------- Deslizadores ---------- */

// Tope de voto de cada partido: no puede sumar más que los votos a candidaturas de las provincias donde se presenta (en 2023, como proporción del total nacional).
// Un partido regional, como ERC o Adelante, queda así limitado al voto de su comunidad: 14,4% y 17,7% como máximo, y no el 30% de toda España.
const TOPE_DE_VOTO = (function () {
  let total = 0;
  DATOS_MODELO.provincias.forEach(function (provincia) { total += provincia.peso; });
  const topes = {};
  DATOS_MODELO.partidos.forEach(function (partido) {
    let suma = 0;
    DATOS_MODELO.provincias.forEach(function (provincia) { if ((provincia.cuotas[partido] || 0) > 0) suma += provincia.peso; });
    topes[partido] = suma / total;
  });
  return topes;
})();
const MAXIMO_DEL_DESLIZADOR = 45;

function topeEnPorcentaje(partido) {
  return Math.min(MAXIMO_DEL_DESLIZADOR, Math.floor(1000 * TOPE_DE_VOTO[partido]) / 10);
}

// Si el reajuste proporcional empuja a algún partido por encima de su tope, se le deja en el tope y el sobrante se reparte, en proporción, entre los que aún tienen margen (sin tocar al partido que mueve el visitante).
function aplicarTopes(partidoFijo) {
  for (let ronda = 0; ronda < 12; ronda++) {
    let sobrante = 0;
    const conMargen = [];
    modelo.partidos.forEach(function (partido) {
      if (partido === partidoFijo) return;
      const tope = TOPE_DE_VOTO[partido];
      if (objetivosActuales[partido] > tope) { sobrante += objetivosActuales[partido] - tope; objetivosActuales[partido] = tope; }
      else if (objetivosActuales[partido] < tope - 1e-9) conMargen.push(partido);
    });
    if (sobrante < 1e-9) return;
    let sumaConMargen = 0;
    conMargen.forEach(function (partido) { sumaConMargen += objetivosActuales[partido]; });
    if (!conMargen.length || sumaConMargen <= 0) return;
    conMargen.forEach(function (partido) { objetivosActuales[partido] += sobrante * objetivosActuales[partido] / sumaConMargen; });
  }
}

function notaDeTopes() {
  const regionales = modelo.partidos.filter(function (partido) { return TOPE_DE_VOTO[partido] < 0.5; })
    .sort(function (a, b) { return TOPE_DE_VOTO[b] - TOPE_DE_VOTO[a]; });
  return "Un partido que solo se presenta en parte de España no puede pasar de los votos de esa parte. Topes de voto nacional: " +
    regionales.map(function (partido) { return NOMBRES[partido] + " " + porcentaje(Math.floor(1000 * TOPE_DE_VOTO[partido]) / 10); }).join(", ") + ".";
}

function crearDeslizadores() {
  const contenedor = document.getElementById("deslizadores");
  if (!contenedor) return;
  contenedor.innerHTML = "";
  const notaTopes = document.getElementById("nota-topes");
  if (notaTopes) notaTopes.textContent = notaDeTopes();
  partidosEnElOrdenDeLaTabla().forEach(function (partido) {
    if (partido === "OTROS") return;
    const bloque = document.createElement("div");
    bloque.className = "deslizador";
    bloque.innerHTML = '<label for="d-' + partido + '">' + ficha(partido) + NOMBRES[partido] + '</label>' +
      '<input type="range" id="d-' + partido + '" min="0" max="' + topeEnPorcentaje(partido) + '" step="0.1" value="' + (100 * objetivosActuales[partido]).toFixed(1) + '">' +
      '<output id="v-' + partido + '">' + porcentaje(100 * objetivosActuales[partido]) + '</output>';
    contenedor.appendChild(bloque);
    bloque.querySelector("input").addEventListener("input", function (evento) {
      moverPartido(partido, parseFloat(evento.target.value));
    });
  });
}

function moverPartido(partido, nuevoPorcentaje) {
  const nuevo = Math.min(nuevoPorcentaje / 100, TOPE_DE_VOTO[partido]);
  const anterior = objetivosActuales[partido];
  const restoAntes = 1 - anterior;
  const restoDespues = 1 - nuevo;
  if (restoAntes <= 0 || restoDespues < 0) return;
  modelo.partidos.forEach(function (otro) {
    if (otro !== partido) objetivosActuales[otro] = objetivosActuales[otro] * restoDespues / restoAntes;
  });
  objetivosActuales[partido] = nuevo;
  aplicarTopes(partido);
  modelo.partidos.forEach(function (otro) {
    document.getElementById("d-" + otro).value = (100 * objetivosActuales[otro]).toFixed(1);
    document.getElementById("v-" + otro).textContent = porcentaje(100 * objetivosActuales[otro]);
  });
  recalcularConRetraso();
}

/* ---------- Provincias y comunidades ---------- */

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

/* Comunidades autónomas: nombre y índices de sus provincias, en orden alfabético */
function comunidadesDelModelo() {
  const porNombre = {};
  modelo.provincias.forEach(function (provincia, p) {
    if (!porNombre[provincia.comunidad]) porNombre[provincia.comunidad] = [];
    porNombre[provincia.comunidad].push(p);
  });
  return Object.keys(porNombre).sort(function (a, b) { return a.localeCompare(b, "es"); }).map(function (nombre) {
    const indices = porNombre[nombre];
    const escanos = indices.reduce(function (suma, p) { return suma + modelo.provincias[p].escanos; }, 0);
    return { nombre: nombre, indices: indices, escanos: escanos };
  });
}
const COMUNIDADES = comunidadesDelModelo();

function crearSelectorDeComunidades() {
  const selector = document.getElementById("selector-comunidad");
  if (!selector) return;
  COMUNIDADES.forEach(function (comunidad, c) {
    const opcion = document.createElement("option");
    opcion.value = c;
    opcion.textContent = comunidad.nombre + " (" + comunidad.escanos + ")";
    selector.appendChild(opcion);
  });
  selector.addEventListener("change", pintarComunidad);
}

// Votos a candidaturas de 2023 (sin blancos ni nulos) de un conjunto de provincias, que es la base del voto previsto de 2026; null si no están los datos
function candidaturasDe2023(nombresDeProvincias) {
  if (typeof MAPA_2023 === "undefined") return null;
  let total = 0;
  nombresDeProvincias.forEach(function (nombre) { total += MAPA_2023[nombre] ? MAPA_2023[nombre].total : 0; });
  return total > 0 ? total : null;
}

// Front Valencià (2026) se compara con lo que fue Sumar en la Comunitat Valenciana en 2023: en esas provincias, la candidatura de Sumar de 2023 pasa a la clave FV
const PROVINCIAS_VALENCIANAS = ["Alicante/Alacant", "Castellón/Castelló", "Valencia/València"];
// Unidad del Pueblo Canario (2026) se compara con Sumar en Canarias en 2023 más Nueva Canarias (que concurrió aparte)
const PROVINCIAS_CANARIAS = ["Palmas (Las)", "Santa Cruz de Tenerife"];

function pintarProvincia() {
  if (!ultimoResultado || !document.getElementById("selector-provincia")) return;
  const p = parseInt(document.getElementById("selector-provincia").value, 10);
  const provincia = modelo.provincias[p];
  document.getElementById("resumen-provincia").textContent = provincia.comunidad + ": " + provincia.escanos + " escaños, " + entero(provincia.votos_validos) + " votos válidos (base 2023 sobre residentes).";
  pintarTablaDeTerritorio({
    idTabla: "tabla-provincia", indices: [p], territorio: "esta provincia",
    resultados2023: typeof RESULTADOS_2023 !== "undefined" ? RESULTADOS_2023[provincia.nombre] : null,
    candidaturas2023: candidaturasDe2023([provincia.nombre]),
  });
}

function pintarComunidad() {
  if (!ultimoResultado || !document.getElementById("selector-comunidad")) return;
  const comunidad = COMUNIDADES[parseInt(document.getElementById("selector-comunidad").value, 10)];
  const votosValidos = comunidad.indices.reduce(function (suma, p) { return suma + modelo.provincias[p].votos_validos; }, 0);
  document.getElementById("resumen-comunidad").textContent = comunidad.indices.length + (comunidad.indices.length === 1 ? " provincia" : " provincias") + ", " + comunidad.escanos + " escaños, " + entero(votosValidos) + " votos válidos (base 2023 sobre residentes).";
  pintarTablaDeTerritorio({
    idTabla: "tabla-comunidad", indices: comunidad.indices, territorio: "esta comunidad",
    resultados2023: typeof RESULTADOS_2023_COMUNIDADES !== "undefined" ? RESULTADOS_2023_COMUNIDADES[comunidad.nombre] : null,
    candidaturas2023: candidaturasDe2023(comunidad.indices.map(function (p) { return modelo.provincias[p].nombre; })),
  });
}

/* Tabla de un territorio (una provincia o varias, sumadas): voto previsto = media de las cuotas de sus provincias ponderada por su peso;
   escaños centrales = suma de los de sus provincias; distribución = suma de los escaños de sus provincias en cada sorteo. */
function pintarTablaDeTerritorio(config) {
  const indices = config.indices;
  const cuotas = ultimoResultado.central.cuotas;
  const escanosCentrales = ultimoResultado.central.escanos;
  const sorteos = ultimoResultado.sorteos;
  const pesoTotal = indices.reduce(function (suma, p) { return suma + modelo.provincias[p].peso; }, 0);
  const filas = [];
  modelo.partidos.forEach(function (partido, k) {
    if (partido === "OTROS" || !indices.some(function (p) { return modelo.presente[p * K + k]; })) return;
    let cuota = 0;
    let central = 0;
    let nombreDeCoalicion = null;
    let coalicionDeLaFila = null;
    indices.forEach(function (p) {
      cuota += cuotas[p * K + k] * modelo.provincias[p].peso / pesoTotal;
      central += escanosCentrales[p * K + k];
      // Coalición (UPN-PP en Navarra): la fila de la columna suma los escaños de su socio; el socio no tiene fila propia en esa provincia
      modelo.coaliciones.forEach(function (coalicion) {
        if (coalicion.provincia !== p) return;
        if (coalicion.columna === k) { central += escanosCentrales[p * K + coalicion.socio]; nombreDeCoalicion = coalicion.nombre; coalicionDeLaFila = { socio: modelo.partidos[coalicion.socio] }; }
        if (coalicion.socio === k) central -= escanosCentrales[p * K + k];
      });
    });
    const cuentas = {};
    for (let s = 0; s < sorteos; s++) {
      let cantidad = 0;
      indices.forEach(function (p) {
        cantidad += ultimoResultado.simulacion.provinciales[(s * P + p) * K + k];
        modelo.coaliciones.forEach(function (coalicion) {
          if (coalicion.provincia !== p) return;
          if (coalicion.columna === k) cantidad += ultimoResultado.simulacion.provinciales[(s * P + p) * K + coalicion.socio];
          if (coalicion.socio === k) cantidad -= ultimoResultado.simulacion.provinciales[(s * P + p) * K + k];
        });
      });
      cuentas[cantidad] = (cuentas[cantidad] || 0) + 1;
    }
    let masProbable = 0;
    let mejor = -1;
    Object.keys(cuentas).forEach(function (cantidad) {
      if (cuentas[cantidad] > mejor) { mejor = cuentas[cantidad]; masProbable = parseInt(cantidad, 10); }
    });
    filas.push({ partido: partido, nombre: nombreDeCoalicion || NOMBRES[partido], cuota: cuota, central: central, masProbable: masProbable, cuentas: cuentas, coalicion: coalicionDeLaFila });
  });
  filas.sort(function (a, b) { return b.cuota - a.cuota; });
  const tabla = document.getElementById(config.idTabla);
  const tablaConResultados2023 = tabla.hasAttribute("data-con-2023") && !!config.resultados2023;
  const resultados2023 = tablaConResultados2023 ? config.resultados2023 : null;
  const porClave2023 = {};
  if (resultados2023) resultados2023.candidaturas.forEach(function (c) { porClave2023[c.clave] = c; });
  const nombresDeProvincias = indices.map(function (p) { return modelo.provincias[p].nombre; });
  const todoEnLaValenciana = nombresDeProvincias.every(function (nombre) { return PROVINCIAS_VALENCIANAS.indexOf(nombre) >= 0; });
  if (todoEnLaValenciana && porClave2023.SUMAR) { porClave2023.FV = porClave2023.SUMAR; delete porClave2023.SUMAR; }
  const todoEnCanarias = nombresDeProvincias.every(function (nombre) { return PROVINCIAS_CANARIAS.indexOf(nombre) >= 0; });
  if (todoEnCanarias && porClave2023.SUMAR) {
    const nuevaCanarias = porClave2023["X:NC- bc"];
    porClave2023.UPC = { votos: porClave2023.SUMAR.votos + (nuevaCanarias ? nuevaCanarias.votos : 0), escanos: porClave2023.SUMAR.escanos };
    delete porClave2023.SUMAR;
    delete porClave2023["X:NC- bc"];  // sus votos ya cuentan en Unidad del Pueblo Canario
  }
  // 2023 de una fila de la previsión: votos y escaños de su candidatura; en una coalición (UPN-PP en Navarra), la suma de los dos socios
  function datosDe2023ParaLaDiferencia(f) {
    const propia = porClave2023[f.partido];
    if (!f.coalicion) return propia || null;
    const socio = porClave2023[f.coalicion.socio];
    if (!propia && !socio) return null;
    return { votos: (propia ? propia.votos : 0) + (socio ? socio.votos : 0), escanos: (propia ? propia.escanos : 0) + (socio ? socio.escanos : 0) };
  }
  // Diferencia de voto (puntos, con 2023 sobre votos a candidaturas, la misma base que el voto previsto) y de escaños (reparto central menos los de 2023)
  function diferenciaDeVoto(f) {
    const dato = resultados2023 && config.candidaturas2023 ? datosDe2023ParaLaDiferencia(f) : null;
    return '<td>' + (dato ? conTriangulo(100 * f.cuota - 100 * dato.votos / config.candidaturas2023, 1) : "–") + '</td>';
  }
  function diferenciaDeEscanos(f) {
    const dato = resultados2023 ? datosDe2023ParaLaDiferencia(f) : null;
    return '<td>' + (dato ? conTriangulo(f.central - dato.escanos, 0) : "–") + '</td>';
  }
  const cuerpo = tabla.querySelector("tbody");
  cuerpo.innerHTML = "";
  const orden2023 = ordenElegidoDeLos2023();
  construirCabeceraConPasado(tabla, orden2023);
  const marcaDeInicio = orden2023 === "final" ? " borde-izq" : "";
  function celdas2023(clave) {
    if (!tablaConResultados2023) return "";
    const c = porClave2023[clave];
    if (!c) return '<td class="num2023' + marcaDeInicio + '">–</td><td class="num2023">–</td><td class="num2023 borde-der">–</td>';
    return '<td class="num2023' + marcaDeInicio + '">' + c.votos.toLocaleString("es-ES", { useGrouping: "always" }) + '</td><td class="num2023">' + porcentaje(100 * c.votos / resultados2023.validos) + '</td><td class="num2023 borde-der">' + c.escanos + '</td>';
  }
  function ordenarFila(celdaPartido, celdasPrevision, celdasPasado) {
    if (!tablaConResultados2023) return celdaPartido + celdasPrevision;
    if (orden2023 === "antes") return celdasPasado + celdaPartido + celdasPrevision;
    if (orden2023 === "tras-partido") return celdaPartido + celdasPasado + celdasPrevision;
    return celdaPartido + celdasPrevision + celdasPasado;
  }
  filas.forEach(function (f) {
    const fila = document.createElement("tr");
    const celdaPartido = '<td class="col-partido">' + ficha(f.partido) + f.nombre + '</td>';
    const celdasPrevision = '<td>' + porcentaje(100 * f.cuota) + '</td>' + diferenciaDeVoto(f) + '<td>' + f.central + '</td>' + diferenciaDeEscanos(f) + '<td>' + f.masProbable +
      '</td><td style="text-align:left">' + histogramaDeEscanos(f, sorteos) + '</td>';
    fila.innerHTML = ordenarFila(celdaPartido, celdasPrevision, celdas2023(f.partido));
    cuerpo.appendChild(fila);
  });
  if (resultados2023) {
    // Candidaturas de 2023 sin fila en 2026 (partidos que ya no concurren o que no tienen lista aquí): al final, con la previsión vacía
    const mostradas = {};
    filas.forEach(function (f) { mostradas[f.partido] = true; });
    resultados2023.candidaturas.forEach(function (c) {
      if (mostradas[c.clave]) return;
      if (c.clave === "X:NC- bc" && porClave2023.UPC) return;  // sus votos ya cuentan en la fila de Unidad del Pueblo Canario
      const nombre = NOMBRES[c.clave] || c.siglas || c.clave;
      const color = COLORES[c.clave] || "#9a9a94";
      const fila = document.createElement("tr");
      fila.className = "solo-2023";
      fila.innerHTML = ordenarFila('<td class="col-partido"><span class="ficha" style="background:' + color + '"></span>' + nombre + '</td>', '<td colspan="6" class="suave">Sin previsión en ' + config.territorio + '</td>', celdas2023(c.clave));
      cuerpo.appendChild(fila);
    });
  }
}

/* Distribución de escaños de un partido en una provincia: una barra por número de escaños, con la altura proporcional a su probabilidad.
   La banda oscura marca el reparto central (sin ruido). Cada barra lleva su probabilidad en el texto emergente. */
function histogramaDeEscanos(f, sorteos, opciones) {
  opciones = opciones || {};
  const UMBRAL_VISIBLE = 0.005;
  const numeros = Object.keys(f.cuentas).map(Number).sort(function (a, b) { return a - b; });
  const visibles = numeros.filter(function (n) { return f.cuentas[n] / sorteos >= UMBRAL_VISIBLE; });
  // Con opciones.desde y opciones.hasta se dibuja solo ese tramo (por ejemplo, el 50% central de las simulaciones)
  const desde = opciones.desde !== undefined ? opciones.desde : Math.max(0, Math.min(visibles[0], f.central) - 1);
  const hasta = opciones.hasta !== undefined ? opciones.hasta : Math.max(visibles[visibles.length - 1], f.central) + 1;
  const cantidad = hasta - desde + 1;
  const ANCHO = opciones.ancho || 260, ALTO_BARRAS = opciones.compacto ? 26 : 44, MARGEN_ARRIBA = opciones.compacto ? 11 : 12, ALTO_EJE = opciones.compacto ? 12 : 16;
  const anchoDeBarra = ANCHO / cantidad;
  let probabilidadMaxima = 0;
  for (let n = desde; n <= hasta; n++) probabilidadMaxima = Math.max(probabilidadMaxima, (f.cuentas[n] || 0) / sorteos);
  const color = COLORES[f.partido];
  let svg = '<svg viewBox="0 0 ' + ANCHO + " " + (MARGEN_ARRIBA + ALTO_BARRAS + ALTO_EJE) + '" width="' + ANCHO + '" role="img" aria-label="Distribución de escaños de ' + NOMBRES[f.partido] + '" style="max-width:100%;height:auto">';
  let etiquetaDeLaMasProbable = '';
  for (let n = desde; n <= hasta; n++) {
    const probabilidad = (f.cuentas[n] || 0) / sorteos;
    if (probabilidad === 0) continue;
    const altura = Math.max(1, ALTO_BARRAS * probabilidad / probabilidadMaxima);
    const x = (n - desde) * anchoDeBarra;
    svg += '<rect x="' + (x + 0.5).toFixed(1) + '" y="' + (MARGEN_ARRIBA + ALTO_BARRAS - altura).toFixed(1) + '" width="' + Math.max(1, anchoDeBarra - 1).toFixed(1) + '" height="' + altura.toFixed(1) +
      '" fill="' + color + '" opacity="0.9"><title>' + n + " escaños: " + porcentaje(100 * probabilidad) + '</title></rect>';
    if (n === f.masProbable) {
      etiquetaDeLaMasProbable = '<text x="' + (x + anchoDeBarra / 2).toFixed(1) + '" y="' + (MARGEN_ARRIBA + ALTO_BARRAS - altura - 2).toFixed(1) + '" text-anchor="middle" font-size="10" fill="var(--suave)">' + entero(100 * probabilidad) + '%</text>';
    }
  }
  if (f.central >= desde && f.central <= hasta) {
    const bandaCentral = (f.central - desde) * anchoDeBarra;
    svg += '<rect x="' + bandaCentral.toFixed(1) + '" y="' + (MARGEN_ARRIBA - 6) + '" width="' + anchoDeBarra.toFixed(1) + '" height="' + (ALTO_BARRAS + 6) + '" fill="var(--texto)" opacity="0.35"><title>Reparto central: ' + f.central + ' escaños</title></rect>';
  }
  svg += etiquetaDeLaMasProbable;
  svg += '<line x1="0" x2="' + ANCHO + '" y1="' + (MARGEN_ARRIBA + ALTO_BARRAS + 0.5) + '" y2="' + (MARGEN_ARRIBA + ALTO_BARRAS + 0.5) + '" stroke="var(--linea)" />';
  const salto = cantidad <= 8 ? 1 : (cantidad <= 16 ? 2 : (cantidad <= 40 ? 5 : 10));
  for (let n = desde; n <= hasta; n++) {
    if (opciones.compacto && n !== desde && n !== hasta) continue;  // en el histograma compacto solo se rotulan los extremos del tramo
    if (n % salto !== 0 && n !== desde && n !== hasta) continue;
    if (n !== desde && n !== hasta && (n - desde < salto / 2 || hasta - n < salto / 2)) continue;
    const ancla = opciones.compacto ? (n === desde ? "start" : "end") : "middle";  // en el histograma compacto, los extremos se alinean al borde para que no se corten
    const posicionX = opciones.compacto ? (n === desde ? 0 : ANCHO) : (n - desde) * anchoDeBarra + anchoDeBarra / 2;
    svg += '<text x="' + posicionX.toFixed(1) + '" y="' + (MARGEN_ARRIBA + ALTO_BARRAS + 11) + '" text-anchor="' + ancla + '" font-size="10" fill="var(--suave)">' + n + '</text>';
  }
  return svg + "</svg>";
}


/* Posición del bloque de resultados de 2023 en la tabla de provincias: por defecto a la izquierda del partido; la elección del visitante se recuerda */
function ordenElegidoDeLos2023() {
  const selector = document.getElementById("posicion-2023");
  return selector ? selector.value : "final";
}

function construirCabeceraConPasado(tabla, orden) {
  const cabecera = tabla.querySelector("thead");
  if (!cabecera || !tabla.hasAttribute("data-con-2023")) return;
  const marcaDeInicio = orden === "final" ? " borde-izq" : "";
  const grupoPasado = '<th colspan="3" class="grupo2023' + marcaDeInicio + ' borde-der">Resultado de 2023 (definitivo)</th>';
  const subPasado = '<th class="' + marcaDeInicio.trim() + '">Votos</th><th>%</th><th class="borde-der">Escaños</th>';
  const grupoPrevision = '<th colspan="6" style="text-align:center">Previsión 2026</th>';
  const subPrevision = '<th>Voto previsto</th><th title="Puntos de voto respecto a 2023 (sobre votos a candidaturas)">Dif.</th><th>Escaños</th><th title="Escaños respecto a 2023">Dif.</th><th>Más probable</th><th style="text-align:left">Distribución (oscuro: central)</th>';
  const partido = '<th rowspan="2" class="col-partido">Partido</th>';
  let primeraFila, segundaFila;
  if (orden === "antes") { primeraFila = grupoPasado + partido + grupoPrevision; segundaFila = subPasado + subPrevision; }
  else if (orden === "tras-partido") { primeraFila = partido + grupoPasado + grupoPrevision; segundaFila = subPasado + subPrevision; }
  else { primeraFila = partido + grupoPrevision + grupoPasado; segundaFila = subPrevision + subPasado; }
  cabecera.innerHTML = "<tr>" + primeraFila + "</tr><tr>" + segundaFila + "</tr>";
}

function activarSelectorDePosicion2023() {
  const selector = document.getElementById("posicion-2023");
  if (!selector) return;
  try {
    const guardada = localStorage.getItem("pondera-posicion-2023");
    if (guardada && selector.querySelector('option[value="' + guardada + '"]')) selector.value = guardada;
  } catch (error) { /* sin almacenamiento: se usa el valor por defecto */ }
  selector.addEventListener("change", function () {
    try { localStorage.setItem("pondera-posicion-2023", selector.value); } catch (error) { /* ignorar */ }
    pintarProvincia();
    pintarComunidad();
  });
}

/* ---------- Arranque ---------- */

activarSelectorDePosicion2023();
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
crearSelectorDeComunidades();
recalcular();
