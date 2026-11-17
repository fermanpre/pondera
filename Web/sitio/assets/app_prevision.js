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
    pintarComunidad();
    if (typeof alTerminarElCalculo === "function") alTerminarElCalculo();
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
const IZQUIERDA_ESTATAL = ["PSOE", "SUMAR", "FV"];
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
  { nombre: "Izquierda estatal: PSOE + Frente Amplio + FV", partidos: IZQUIERDA_ESTATAL, color: COLOR_IZQUIERDA },
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

function filaDeMayoria(combinacion, p) {
  return '<div class="barra-prob" title="' + combinacion.partidos.map(function (x) { return NOMBRES[x] || x; }).join(" + ") + '">' +
    '<span class="barra-prob-nombre">' + combinacion.nombre + '</span>' +
    '<span class="barra-prob-pista"><span class="barra-prob-relleno" style="width:' + (100 * p).toFixed(2) + '%;background:' + combinacion.color + '"></span></span>' +
    '<b>' + textoDeProbabilidad(p) + '</b></div>';
}

function pintarMayorias() {
  const contenedor = document.getElementById("mayorias");
  if (!contenedor) return;
  const probabilidad = function (combinacion) { return MotorElectoral.probabilidadDeSuma(modelo, ultimoResultado.simulacion, combinacion.partidos); };
  const calculadas = COMBINACIONES_DE_MAYORIA.map(function (combinacion) { return { combinacion: combinacion, p: probabilidad(combinacion) }; });
  const visibles = calculadas.filter(function (elemento) { return elemento.p >= PROBABILIDAD_MINIMA_DE_MAYORIA; })
    .sort(function (a, b) { return b.p - a.p; });
  let html = '<h3>Probabilidad de mayoría absoluta (176 escaños o más)</h3><div class="grupo-mayorias">';
  visibles.forEach(function (elemento) { html += filaDeMayoria(elemento.combinacion, elemento.p); });
  html += '</div>';
  if (visibles.length < calculadas.length) {
    html += '<p class="nota">Todas las demás mayorías razonablemente posibles no alcanzan el 0,1% de las simulaciones.</p>';
  }
  html += '<div class="grupo-mayorias"><h4>Otras</h4>' + filaDeMayoria(COMBINACION_OTRAS, probabilidad(COMBINACION_OTRAS)) + '</div>';
  contenedor.innerHTML = html;
}

/* ---------- Tabla nacional: 2026 frente a 2023 ---------- */

// Clave de cada partido del modelo en resultados_2023.js. Podemos, SALF y Front Valencià no tuvieron candidatura propia en 2023 (Podemos y Compromís iban dentro de Sumar).
const CLAVE_EN_2023 = { PP: "PP", PSOE: "PSOE", VOX: "VOX", SUMAR: "SUMAR", ERC: "ERC", JUNTS: "JUNTS", BILDU: "BILDU", PNV: "PNV", BNG: "BNG", CC: "CC", UPN: "UPN", EXISTE: "EXISTE", ADELANTE: "ADELANTE", PACMA: "PACMA" };

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
  return texto;
}

function textoDeRango(minimo, maximo) {
  return minimo === maximo ? entero(minimo) : entero(minimo) + "-" + entero(maximo);
}

function cabeceraDeLaTablaNacional() {
  return '<tr><th rowspan="2">Partido</th><th colspan="3" class="grupo-columnas">Voto (%)</th><th colspan="3" class="grupo-columnas">Escaños</th><th colspan="2" class="grupo-columnas">Rango de escaños</th></tr>' +
    '<tr><th>2023</th><th>2026</th><th>Dif.</th><th>2023</th><th>2026</th><th>Dif.</th><th>80%</th><th>95%</th></tr>';
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
  partidosPorVoto().forEach(function (partido) {
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
      '<td>' + textoDeRango(r.p10, r.p90) + '</td><td>' + textoDeRango(r.p025, r.p975) + '</td>';
    cuerpo.appendChild(fila);
  });
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
  partidosPorVoto().forEach(function (partido) {
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

function pintarProvincia() {
  if (!ultimoResultado || !document.getElementById("selector-provincia")) return;
  const p = parseInt(document.getElementById("selector-provincia").value, 10);
  const provincia = modelo.provincias[p];
  document.getElementById("resumen-provincia").textContent = provincia.comunidad + ": " + provincia.escanos + " escaños, " + entero(provincia.votos_validos) + " votos válidos (base 2023 sobre residentes).";
  pintarTablaDeTerritorio({
    idTabla: "tabla-provincia", indices: [p], territorio: "esta provincia",
    resultados2023: typeof RESULTADOS_2023 !== "undefined" ? RESULTADOS_2023[provincia.nombre] : null,
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
    indices.forEach(function (p) {
      cuota += cuotas[p * K + k] * modelo.provincias[p].peso / pesoTotal;
      central += escanosCentrales[p * K + k];
      // Coalición (UPN-PP en Navarra): la fila de la columna suma los escaños de su socio; el socio no tiene fila propia en esa provincia
      modelo.coaliciones.forEach(function (coalicion) {
        if (coalicion.provincia !== p) return;
        if (coalicion.columna === k) { central += escanosCentrales[p * K + coalicion.socio]; nombreDeCoalicion = coalicion.nombre; }
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
    filas.push({ partido: partido, nombre: nombreDeCoalicion || NOMBRES[partido], cuota: cuota, central: central, masProbable: masProbable, cuentas: cuentas });
  });
  filas.sort(function (a, b) { return b.cuota - a.cuota; });
  const tabla = document.getElementById(config.idTabla);
  const tablaConResultados2023 = tabla.hasAttribute("data-con-2023") && !!config.resultados2023;
  const resultados2023 = tablaConResultados2023 ? config.resultados2023 : null;
  const porClave2023 = {};
  if (resultados2023) resultados2023.candidaturas.forEach(function (c) { porClave2023[c.clave] = c; });
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
    const celdasPrevision = '<td>' + porcentaje(100 * f.cuota) + '</td><td>' + f.central + '</td><td>' + f.masProbable +
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
      const nombre = NOMBRES[c.clave] || c.siglas || c.clave;
      const color = COLORES[c.clave] || "#9a9a94";
      const fila = document.createElement("tr");
      fila.className = "solo-2023";
      fila.innerHTML = ordenarFila('<td class="col-partido"><span class="ficha" style="background:' + color + '"></span>' + nombre + '</td>', '<td colspan="4" class="suave">Sin previsión en ' + config.territorio + '</td>', celdas2023(c.clave));
      cuerpo.appendChild(fila);
    });
  }
}

/* Distribución de escaños de un partido en una provincia: una barra por número de escaños, con la altura proporcional a su probabilidad.
   La banda oscura marca el reparto central (sin ruido). Cada barra lleva su probabilidad en el texto emergente. */
function histogramaDeEscanos(f, sorteos) {
  const UMBRAL_VISIBLE = 0.005;
  const numeros = Object.keys(f.cuentas).map(Number).sort(function (a, b) { return a - b; });
  const visibles = numeros.filter(function (n) { return f.cuentas[n] / sorteos >= UMBRAL_VISIBLE; });
  const desde = Math.max(0, Math.min(visibles[0], f.central) - 1);
  const hasta = Math.max(visibles[visibles.length - 1], f.central) + 1;
  const cantidad = hasta - desde + 1;
  const ANCHO = 260, ALTO_BARRAS = 44, MARGEN_ARRIBA = 12, ALTO_EJE = 16;
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
  const bandaCentral = (f.central - desde) * anchoDeBarra;
  svg += '<rect x="' + bandaCentral.toFixed(1) + '" y="' + (MARGEN_ARRIBA - 6) + '" width="' + anchoDeBarra.toFixed(1) + '" height="' + (ALTO_BARRAS + 6) + '" fill="var(--texto)" opacity="0.35"><title>Reparto central: ' + f.central + ' escaños</title></rect>';
  svg += etiquetaDeLaMasProbable;
  svg += '<line x1="0" x2="' + ANCHO + '" y1="' + (MARGEN_ARRIBA + ALTO_BARRAS + 0.5) + '" y2="' + (MARGEN_ARRIBA + ALTO_BARRAS + 0.5) + '" stroke="var(--linea)" />';
  const salto = cantidad <= 8 ? 1 : (cantidad <= 16 ? 2 : (cantidad <= 40 ? 5 : 10));
  for (let n = desde; n <= hasta; n++) {
    if (n % salto !== 0 && n !== desde && n !== hasta) continue;
    if (n !== desde && n !== hasta && (n - desde < salto / 2 || hasta - n < salto / 2)) continue;
    svg += '<text x="' + ((n - desde) * anchoDeBarra + anchoDeBarra / 2).toFixed(1) + '" y="' + (MARGEN_ARRIBA + ALTO_BARRAS + 12) + '" text-anchor="middle" font-size="10" fill="var(--suave)">' + n + '</text>';
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
  const grupoPrevision = '<th colspan="4" style="text-align:center">Previsión 2026</th>';
  const subPrevision = '<th>Voto previsto</th><th>Escaños</th><th>Más probable</th><th style="text-align:left">Distribución (oscuro: central)</th>';
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
