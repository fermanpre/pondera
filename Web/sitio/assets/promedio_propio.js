"use strict";
/*
 * «Crea tu propio promedio» (página del simulador).
 * Una tabla con la encuesta más reciente de cada encuestadora (ENCUESTAS_RECIENTES, de encuestas_recientes.js): el visitante da un peso a cada una (los pesos suman siempre 100)
 * o la excluye; con ellos se calcula el promedio de cada partido, se traduce a objetivos por candidatura igual que hace el modelo y se recalculan el reparto, el Monte Carlo y todo lo
 * demás de la página (objetivosActuales, recalcular y crearDeslizadores son de app_prevision.js).
 */
(function () {
  const tabla = document.getElementById("tabla-promedio-propio");
  if (!tabla || typeof ENCUESTAS_RECIENTES === "undefined" || typeof objetivosActuales === "undefined") return;
  const DATOS = ENCUESTAS_RECIENTES;
  const TRADUCCION = DATOS.traduccion;

  // Partidos de las encuestas (nombre en la tabla de Wikipedia, identificador del modelo), en el orden de su resultado de 2023; los que no tuvieron resultado propio, al final
  const COLUMNAS = [["PP", "PP"], ["PSOE", "PSOE"], ["Vox", "VOX"], ["Sumar", "SUMAR"], ["ERC", "ERC"], ["Junts", "JUNTS"], ["EH Bildu", "BILDU"], ["PNV", "PNV"], ["BNG", "BNG"],
    ["CCa", "CC"], ["UPN", "UPN"], ["Adelante Andalucía", "ADELANTE"], ["Podemos", "PODEMOS"], ["SALF", "SALF"], ["FV", "FV"]];
  const NOMBRE_DE_COLUMNA = { SUMAR: "Frente Amplio", BILDU: "Bildu", CC: "CC", ADELANTE: "Adelante" };
  const formato = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const formatoEntero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

  const filas = DATOS.encuestas.map(function (encuesta) { return { encuesta: encuesta, incluida: true, peso: encuesta.peso_modelo }; });

  /* ---------- Pesos ---------- */

  function incluidas() { return filas.filter(function (fila) { return fila.incluida; }); }

  // Deja la suma de los pesos de las encuestas incluidas en 100, manteniendo la proporción entre ellas
  function normalizar(excepto, valorFijo) {
    const resto = incluidas().filter(function (fila) { return fila !== excepto; });
    const objetivoDelResto = excepto ? 100 - valorFijo : 100;
    const sumaDelResto = resto.reduce(function (suma, fila) { return suma + fila.peso; }, 0);
    resto.forEach(function (fila) {
      fila.peso = sumaDelResto > 0 ? fila.peso * objetivoDelResto / sumaDelResto : objetivoDelResto / resto.length;
    });
    if (excepto) excepto.peso = valorFijo;
  }

  function fijarPeso(fila, valor) {
    if (!fila.incluida) return;
    const hayOtras = incluidas().some(function (otra) { return otra !== fila; });
    const limitado = hayOtras ? Math.max(0, Math.min(100, isNaN(valor) ? 0 : valor)) : 100;
    normalizar(fila, limitado);
  }

  function incluirOExcluir(fila, incluida) {
    if (incluida === fila.incluida) return;
    if (!incluida) {
      fila.incluida = false;
      fila.peso = 0;
      if (incluidas().length) normalizar(null, 0);
    } else {
      fila.incluida = true;
      const n = incluidas().length;
      fila.peso = 100 / n;
      normalizar(fila, 100 / n);
    }
  }

  function pesosDelModelo() {
    filas.forEach(function (fila) { fila.incluida = true; fila.peso = fila.encuesta.peso_modelo; });
    normalizar(null, 0);
  }

  function pesosIguales() {
    filas.forEach(function (fila) { fila.incluida = true; fila.peso = 100 / filas.length; });
  }

  /* ---------- Promedio y traducción a objetivos ---------- */

  function valoresDe(encuesta) {
    const correccion = document.getElementById("pp-correccion");
    return correccion && correccion.checked && encuesta.valores_modelo ? encuesta.valores_modelo : encuesta.valores;
  }

  // Promedio ponderado de cada partido entre las encuestas incluidas que lo publican (el peso se reajusta partido a partido, como en el modelo)
  function promedioDeLosPartidos() {
    const suma = {}, pesos = {};
    incluidas().forEach(function (fila) {
      if (fila.peso <= 0) return;
      const valores = valoresDe(fila.encuesta);
      Object.keys(valores).forEach(function (partido) {
        suma[partido] = (suma[partido] || 0) + fila.peso * valores[partido];
        pesos[partido] = (pesos[partido] || 0) + fila.peso;
      });
    });
    const promedio = {};
    Object.keys(suma).forEach(function (partido) { promedio[partido] = suma[partido] / pesos[partido]; });
    return promedio;
  }

  // Misma traducción que calcular_prevision_base.calcular_objetivos: porcentajes de voto válido a porcentajes de votos a candidaturas, Front Valencià como parte de Sumar,
  // coalición UPN-PP, cuotas fijas de PACMA, Existe y Otros, y reescalado para sumar 100.
  function traducirAObjetivos(promedio) {
    const p = {};
    Object.keys(promedio).forEach(function (nombre) { p[nombre] = promedio[nombre] / 100; });
    const objetivos = {};
    Object.keys(TRADUCCION.equivalencias).forEach(function (nombre) { objetivos[TRADUCCION.equivalencias[nombre]] = (p[nombre] || 0) / TRADUCCION.factor_de_blancos; });
    const proporcionFV = p.Sumar_con_FV ? (p.FV || 0) / p.Sumar_con_FV : 0;
    objetivos.FV = objetivos.SUMAR * proporcionFV;
    objetivos.SUMAR -= objetivos.FV;
    const c = TRADUCCION.coalicion;
    const crecimientoPP = objetivos[c.socio] / (c.votos_pp_fuera + c.votos_pp_dentro);
    const objetivoCoalicion = c.votos_coalicion_base * crecimientoPP;
    objetivos[c.columna] = objetivoCoalicion;
    objetivos[c.socio] -= objetivoCoalicion * (c.votos_pp_dentro / c.votos_coalicion_base);
    let sumaDeEncuestas = 0;
    Object.keys(objetivos).forEach(function (clave) { sumaDeEncuestas += objetivos[clave]; });
    const escala = (1 - TRADUCCION.cuota_pacma - TRADUCCION.cuota_otros - TRADUCCION.cuota_existe) / sumaDeEncuestas;
    Object.keys(objetivos).forEach(function (clave) { objetivos[clave] *= escala; });
    objetivos.PACMA = TRADUCCION.cuota_pacma;
    objetivos.EXISTE = TRADUCCION.cuota_existe;
    objetivos.OTROS = TRADUCCION.cuota_otros;
    // Solo los partidos del modelo, normalizados a 1; los que ninguna encuesta incluida publica se quedan en un valor mínimo para no romper el reparto
    const resultado = {};
    let suma = 0;
    modelo.partidos.forEach(function (partido) {
      resultado[partido] = Math.max(objetivos[partido] || 0, 1e-6);
      suma += resultado[partido];
    });
    modelo.partidos.forEach(function (partido) { resultado[partido] /= suma; });
    return resultado;
  }

  /* ---------- Tabla ---------- */

  function cabecera() {
    const partidos = COLUMNAS.map(function (par) {
      const id = par[1];
      return '<th class="num">' + ficha(id) + (NOMBRE_DE_COLUMNA[id] || NOMBRES[id] || id) + "</th>";
    }).join("");
    tabla.querySelector("thead").innerHTML = '<tr><th>Incluir</th><th>Encuestadora</th><th>Campo</th><th class="num">Entrevistados</th><th class="num">Peso del modelo</th><th class="num">Tu peso (%)</th>' + partidos + "</tr>";
  }

  function textoDeCampo(campo) { return campo.replace(/\s\d{4}$/, ""); }

  function cuerpo() {
    const html = filas.map(function (fila, indice) {
      const encuesta = fila.encuesta;
      const valores = valoresDe(encuesta);
      const celdas = COLUMNAS.map(function (par) {
        const valor = valores[par[0]];
        return '<td class="num">' + (valor === undefined ? "–" : formato.format(valor)) + "</td>";
      }).join("");
      const cliente = encuesta.cliente ? ' <span class="nota">(' + encuesta.cliente + ")</span>" : "";
      const deParte = encuesta.de_parte ? ' <span class="nota">(de parte)</span>' : "";
      return '<tr' + (fila.incluida ? "" : ' class="excluida"') + '><td><input type="checkbox" data-incluir="' + indice + '"' + (fila.incluida ? " checked" : "") + ' aria-label="Incluir la encuesta de ' + encuesta.firma + '"></td>' +
        "<td>" + encuesta.firma + cliente + deParte + "</td><td>" + textoDeCampo(encuesta.campo) + '</td><td class="num">' + (encuesta.muestra ? formatoEntero.format(encuesta.muestra) : "–") + "</td>" +
        '<td class="num">' + formato.format(encuesta.peso_modelo) + '</td><td class="celda-peso"><input type="range" class="deslizador-peso" data-deslizador="' + indice + '" min="0" max="100" step="0.1" value="' + fila.peso.toFixed(1) +
        '"' + (fila.incluida ? "" : " disabled") + ' aria-label="Deslizador del peso de la encuesta de ' + encuesta.firma + '"> <input type="number" class="peso-propio" data-peso="' + indice + '" min="0" max="100" step="0.1" value="' + fila.peso.toFixed(1) +
        '"' + (fila.incluida ? "" : " disabled") + ' aria-label="Peso de la encuesta de ' + encuesta.firma + '"></td>' + celdas + "</tr>";
    }).join("");
    tabla.querySelector("tbody").innerHTML = html;
  }

  function pie() {
    const promedio = promedioDeLosPartidos();
    const suma = incluidas().reduce(function (total, fila) { return total + fila.peso; }, 0);
    const celdasPromedio = COLUMNAS.map(function (par) { return '<td class="num"><b>' + (promedio[par[0]] === undefined ? "–" : formato.format(promedio[par[0]])) + "</b></td>"; }).join("");
    const celdasModelo = COLUMNAS.map(function (par) {
      const valor = DATOS.promedio_modelo ? DATOS.promedio_modelo[par[0]] : undefined;
      return '<td class="num">' + (valor === undefined ? "–" : formato.format(valor)) + "</td>";
    }).join("");
    tabla.querySelector("tfoot").innerHTML = '<tr><th colspan="5">Suma de los pesos</th><th class="num" id="pp-suma">' + formato.format(suma) + '</th><td colspan="' + COLUMNAS.length + '"></td></tr>' +
      '<tr><th colspan="6">Tu promedio</th>' + celdasPromedio + "</tr>" +
      '<tr><th colspan="6">Promedio del modelo (' + DATOS.dia.split("-").reverse().join("/") + ")</th>" + celdasModelo + "</tr>";
  }

  function refrescar() { cuerpo(); pie(); }

  /* ---------- Resultado ---------- */

  function pintarResumen(promedio, objetivos) {
    const contenedor = document.getElementById("pp-resultado");
    if (!contenedor) return;
    const partidos = modelo.partidos.slice().sort(function (a, b) { return objetivos[b] - objetivos[a]; }).filter(function (partido) { return objetivos[partido] > 0.0005; });
    const nombreEnEncuestas = {};
    COLUMNAS.forEach(function (par) { nombreEnEncuestas[par[1]] = par[0]; });
    const filasHtml = partidos.map(function (partido) {
      const crudo = nombreEnEncuestas[partido] !== undefined && promedio[nombreEnEncuestas[partido]] !== undefined ? formato.format(promedio[nombreEnEncuestas[partido]]) + "%" : "–";
      const escanos = ultimoResultado && ultimoResultado.central ? centralesDe(partido) : "";
      return "<tr><td>" + ficha(partido) + (NOMBRE_DE_COLUMNA[partido] || NOMBRES[partido]) + "</td><td class=\"num\">" + crudo + "</td><td class=\"num\">" + formato.format(100 * objetivos[partido]) + "%</td><td class=\"num\">" + escanos + "</td></tr>";
    }).join("");
    contenedor.innerHTML = '<h3>Tu promedio y la proyección</h3><div class="tabla-ancha"><table><thead><tr><th>Partido</th><th class="num">Promedio de tus encuestas (voto válido)</th>' +
      '<th class="num">Voto que usa el modelo (votos a candidaturas)</th><th class="num">Escaños (reparto central)</th></tr></thead><tbody>' + filasHtml + "</tbody></table></div>" +
      '<p class="nota">Debajo están el hemiciclo, las mayorías y las tablas por provincia con tu promedio; los deslizadores de «Voto por partido» ya valen lo mismo y se pueden afinar a partir de ahí.</p>';
  }

  function centralesDe(partido) {
    const centrales = typeof escanosCentrales === "function" ? escanosCentrales() : {};
    return centrales[partido] === undefined ? "0" : String(centrales[partido]);
  }

  let promedioPendiente = null;
  let objetivosPendientes = null;

  function calcular() {
    if (!incluidas().length) {
      document.getElementById("pp-estado").textContent = "Incluye al menos una encuesta.";
      return;
    }
    const promedio = promedioDeLosPartidos();
    const objetivos = traducirAObjetivos(promedio);
    objetivosActuales = Object.assign({}, objetivos);
    promedioPendiente = promedio;
    objetivosPendientes = objetivos;
    const sorteos = document.getElementById("pp-sorteos").value;
    const selectorGeneral = document.getElementById("numero-sorteos");
    if (selectorGeneral) selectorGeneral.value = sorteos;
    crearDeslizadores();
    document.getElementById("pp-estado").textContent = "Calculando…";
    recalcular();
  }

  // app_prevision.js llama a esta función cuando termina cada cálculo: si venía de este botón, se completa el resumen
  window.alTerminarElCalculo = function () {
    if (!promedioPendiente) return;
    pintarResumen(promedioPendiente, objetivosPendientes);
    document.getElementById("pp-estado").textContent = "Listo: " + formatoEntero.format(ultimoResultado.sorteos) + " simulaciones.";
    promedioPendiente = null;
    const destino = document.getElementById("pp-resultado");
    if (destino && destino.scrollIntoView) destino.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ---------- Eventos ---------- */

  // Pone en todos los campos de peso (deslizador y número) el valor actual, sin reconstruir la tabla, para no perder el foco mientras se arrastra
  function actualizarPesos() {
    filas.forEach(function (fila, indice) {
      const valor = fila.peso.toFixed(1);
      const numero = tabla.querySelector('input[data-peso="' + indice + '"]');
      const deslizador = tabla.querySelector('input[data-deslizador="' + indice + '"]');
      if (numero && numero !== document.activeElement) numero.value = valor;
      if (deslizador && deslizador !== document.activeElement) deslizador.value = valor;
    });
    pie();
  }

  tabla.addEventListener("input", function (evento) {
    const objetivo = evento.target;
    if (objetivo.hasAttribute("data-deslizador")) {
      fijarPeso(filas[parseInt(objetivo.getAttribute("data-deslizador"), 10)], parseFloat(objetivo.value));
      actualizarPesos();
    }
  });
  tabla.addEventListener("change", function (evento) {
    const objetivo = evento.target;
    if (objetivo.hasAttribute("data-incluir")) {
      incluirOExcluir(filas[parseInt(objetivo.getAttribute("data-incluir"), 10)], objetivo.checked);
      refrescar();
    } else if (objetivo.hasAttribute("data-peso")) {
      fijarPeso(filas[parseInt(objetivo.getAttribute("data-peso"), 10)], parseFloat(objetivo.value));
      refrescar();
    } else if (objetivo.hasAttribute("data-deslizador")) {
      refrescar();
    }
  });
  const correccion = document.getElementById("pp-correccion");
  if (correccion) correccion.addEventListener("change", refrescar);
  document.getElementById("pp-modelo").addEventListener("click", function () { pesosDelModelo(); refrescar(); });
  document.getElementById("pp-iguales").addEventListener("click", function () { pesosIguales(); refrescar(); });
  document.getElementById("pp-calcular").addEventListener("click", calcular);

  cabecera();
  pesosDelModelo();
  refrescar();
})();
