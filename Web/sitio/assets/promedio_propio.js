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

  // Partidos de las encuestas (nombre en la tabla de Wikipedia, identificador del modelo), en el mismo orden que la tabla de encuestas del día: primero los de ámbito estatal
  // (con Front Valencià y Podemos pegados a Frente Amplio) y después los periféricos
  const COLUMNAS = [["PP", "PP"], ["PSOE", "PSOE"], ["Vox", "VOX"], ["Sumar", "SUMAR"], ["FV", "FV"], ["UPC", "UPC"], ["Podemos", "PODEMOS"], ["SALF", "SALF"], ["ERC", "ERC"],
    ["Adelante Andalucía", "ADELANTE"], ["EH Bildu", "BILDU"], ["Junts", "JUNTS"], ["BNG", "BNG"], ["PNV", "PNV"], ["UPN", "UPN"], ["CCa", "CC"]];
  const NOMBRE_DE_COLUMNA = { SUMAR: "Frente Amplio", BILDU: "Bildu", CC: "CC", ADELANTE: "Adelante" };
  const formato = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const formatoPeso = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
        if (partido === "UPC") return; // se reparte desde el total de Sumar con la proporción del modelo, no se promedia
        suma[partido] = (suma[partido] || 0) + fila.peso * valores[partido];
        pesos[partido] = (pesos[partido] || 0) + fila.peso;
      });
    });
    const promedio = {};
    Object.keys(suma).forEach(function (partido) { promedio[partido] = suma[partido] / pesos[partido]; });
    // Partidos que ninguna encuesta incluida publica (40dB, por ejemplo, solo detalla siete y agrupa el resto en «Otro + Blanco»): se toman del promedio del modelo. Sin esto, el reparto
    // de 100 dejaría sin voto a esos partidos y inflaría a todos los demás (con solo 40dB, el PP y el PSOE saldrían tres puntos por encima de lo que la encuesta dice).
    const delModelo = DATOS.promedio_modelo || {};
    partidosRellenados = [];
    Object.keys(delModelo).forEach(function (partido) {
      if (promedio[partido] === undefined) { promedio[partido] = delModelo[partido]; partidosRellenados.push(partido); }
    });
    return promedio;
  }
  let partidosRellenados = [];

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
    // Unidad del Pueblo Canario: ninguna encuesta publica su porcentaje; es su parte del Frente Amplio en la base de partida (la misma que usa calcular_objetivos)
    objetivos.UPC = objetivos.SUMAR * proporcionUPC();
    objetivos.SUMAR -= objetivos.UPC;
    const c = TRADUCCION.coalicion;
    const crecimientoPP = objetivos[c.socio] / (c.votos_pp_fuera + c.votos_pp_dentro);
    const objetivoCoalicion = c.votos_coalicion_base * crecimientoPP;
    objetivos[c.columna] = objetivoCoalicion;
    objetivos[c.socio] -= objetivoCoalicion * (c.votos_pp_dentro / c.votos_coalicion_base);
    let sumaDeEncuestas = 0;
    Object.keys(objetivos).forEach(function (clave) { sumaDeEncuestas += objetivos[clave]; });
    const escala = (1 - TRADUCCION.cuota_pacma - TRADUCCION.cuota_otros - TRADUCCION.cuota_existe - (TRADUCCION.cuota_gbai || 0)) / sumaDeEncuestas;
    Object.keys(objetivos).forEach(function (clave) { objetivos[clave] *= escala; });
    objetivos.PACMA = TRADUCCION.cuota_pacma;
    objetivos.EXISTE = TRADUCCION.cuota_existe;
    objetivos.GBAI = TRADUCCION.cuota_gbai || 0;
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

  // En las encuestas que publican Front Valencià por separado, «Sumar» es el total (Frente Amplio + Front Valencià, y la UPC si la casa la publica): para mostrarlas sin contar dos veces, la columna de Frente Amplio enseña el total menos FV y menos UPC
  function valorMostradoDeEncuesta(valores, nombre) {
    const valor = valores[nombre];
    if (nombre === "Sumar" && valor !== undefined) return Math.max(0, valor - (valores.FV || 0) - (valores.UPC || 0));
    return valor;
  }

  // En un promedio, el total de Sumar se reparte entre Frente Amplio y Front Valencià con la misma proporción que usa el modelo (FV / Sumar con FV)
  function proporcionUPC() {
    return typeof DATOS_MODELO !== "undefined" && DATOS_MODELO.proporcion_upc_en_frente_amplio ? DATOS_MODELO.proporcion_upc_en_frente_amplio : 0;
  }

  // El total de Sumar de un promedio se reparte entre Front Valencià, Unidad del Pueblo Canario y Frente Amplio: FV con la proporción FV / Sumar con FV; UPC con su parte de la base (ninguna encuesta la publica)
  function valorMostradoDePromedio(promedio, nombre) {
    if (nombre !== "Sumar" && nombre !== "FV" && nombre !== "UPC") return promedio[nombre];
    if (promedio.Sumar === undefined) return promedio[nombre];
    const proporcion = promedio.Sumar_con_FV && promedio.FV !== undefined ? promedio.FV / promedio.Sumar_con_FV : 0;
    if (nombre === "FV") return promedio.FV === undefined ? undefined : promedio.Sumar * proporcion;
    const frenteAmplioYUpc = promedio.Sumar * (1 - proporcion);
    return nombre === "UPC" ? frenteAmplioYUpc * proporcionUPC() : frenteAmplioYUpc * (1 - proporcionUPC());
  }

  let cabeceraHtml = "";

  function cabecera() {
    const partidos = COLUMNAS.map(function (par) {
      const id = par[1];
      const nombre = NOMBRE_DE_COLUMNA[id] === "Frente Amplio" ? "Frente Amplio" : (NOMBRES[id] || id);
      return '<th class="num col-partido">' + (logoDePartido(id, nombre) || ficha(id) + nombre) + "</th>";
    }).join("");
    cabeceraHtml = '<tr><th>Incluir</th><th>Encuestadora</th><th>Campo</th><th class="num">Muestra</th><th class="num">Peso del modelo</th><th class="num">Tu peso (%)</th>' + partidos + "</tr>";
    tabla.querySelector("thead").innerHTML = cabeceraHtml;
  }

  function textoDeCampo(campo) { return campo.replace(/\s\d{4}$/, ""); }

  function cuerpo() {
    const html = filas.map(function (fila, indice) {
      const encuesta = fila.encuesta;
      const valores = valoresDe(encuesta);
      const celdas = COLUMNAS.map(function (par) {
        const valor = valorMostradoDeEncuesta(valores, par[0]);
        return '<td class="num col-partido">' + (valor === undefined ? "–" : formato.format(valor)) + "</td>";
      }).join("");
      const cliente = encuesta.cliente ? ' <span class="nota">(' + encuesta.cliente + ")</span>" : "";
      const deParte = encuesta.de_parte ? ' <span class="nota">(de parte)</span>' : "";
      return '<tr' + (fila.incluida ? "" : ' class="excluida"') + '><td><input type="checkbox" data-incluir="' + indice + '"' + (fila.incluida ? " checked" : "") + ' aria-label="Incluir la encuesta de ' + encuesta.firma + '"></td>' +
        "<td>" + encuesta.firma + cliente + deParte + "</td><td>" + textoDeCampo(encuesta.campo) + '</td><td class="num">' + (encuesta.muestra ? entero(encuesta.muestra) : "–") + "</td>" +
        '<td class="num">' + formatoPeso.format(encuesta.peso_modelo) + '</td><td class="celda-peso"><input type="range" class="deslizador-peso" data-deslizador="' + indice + '" min="0" max="100" step="0.1" value="' + fila.peso.toFixed(1) +
        '"' + (fila.incluida ? "" : " disabled") + ' aria-label="Deslizador del peso de la encuesta de ' + encuesta.firma + '"> <input type="number" class="peso-propio" data-peso="' + indice + '" min="0" max="100" step="0.1" value="' + fila.peso.toFixed(1) +
        '"' + (fila.incluida ? "" : " disabled") + ' aria-label="Peso de la encuesta de ' + encuesta.firma + '"></td>' + celdas + "</tr>";
    }).join("");
    tabla.querySelector("tbody").innerHTML = html;
  }

  // Las filas «Tu promedio» y «Promedio del modelo» van en la parte superior de la tabla, justo debajo de la cabecera
  function pie() {
    const promedio = promedioDeLosPartidos();
    const suma = incluidas().reduce(function (total, fila) { return total + fila.peso; }, 0);
    const celdaDePromedio = function (valores, negrita) {
      return COLUMNAS.map(function (par) {
        const valor = valorMostradoDePromedio(valores, par[0]);
        const texto = valor === undefined ? "–" : formato.format(valor);
        const relleno = negrita && (partidosRellenados.indexOf(par[0]) >= 0 || (par[0] === "Sumar" && partidosRellenados.indexOf("Sumar") >= 0));
        if (relleno) return '<td class="num col-partido"><i class="valor-del-modelo" title="Ninguna encuesta incluida publica este partido: se toma del promedio del modelo">' + texto + "</i></td>";
        return '<td class="num col-partido">' + (negrita ? "<b>" + texto + "</b>" : texto) + "</td>";
      }).join("");
    };
    const promedioDelModelo = DATOS.promedio_modelo || {};
    tabla.querySelector("thead").innerHTML = cabeceraHtml +
      '<tr class="fila-promedio"><th colspan="5">Tu promedio</th><th class="num" id="pp-suma" title="Suma de tus pesos">' + formato.format(suma) + "</th>" + celdaDePromedio(promedio, true) + "</tr>" +
      '<tr class="fila-promedio"><th colspan="4">Promedio del modelo (' + DATOS.dia.split("-").reverse().join("/") + ')</th><th class="num">100,0</th><th></th>' + celdaDePromedio(promedioDelModelo, false) + "</tr>";
    notaDeRelleno();
    sincronizarCasillaDeTodas();
  }

  // Aviso bajo la tabla: partidos que ninguna encuesta incluida publica y que se han tomado del promedio del modelo
  function notaDeRelleno() {
    let nota = document.getElementById("pp-relleno");
    if (!nota) {
      nota = document.createElement("p");
      nota.id = "pp-relleno";
      nota.className = "nota";
      tabla.insertAdjacentElement("afterend", nota);
    }
    const nombres = COLUMNAS.filter(function (par) { return partidosRellenados.indexOf(par[0]) >= 0 && par[0] !== "Sumar"; }).map(function (par) { return NOMBRES[par[1]] || par[1]; });
    nota.hidden = nombres.length === 0;
    nota.textContent = nombres.length ? "Ninguna de las encuestas incluidas publica el voto de " + nombres.join(", ") + ": en «Tu promedio» (cursiva) se toma su valor del promedio del modelo, para que el reparto no deje a esos partidos sin voto e infle a los demás." : "";
  }

  // La casilla «Incluir todas» refleja el estado de las encuestas: marcada si están todas, indeterminada si hay mezcla
  function sincronizarCasillaDeTodas() {
    const casilla = document.getElementById("pp-todas");
    if (!casilla) return;
    const cuantas = incluidas().length;
    casilla.checked = cuantas === filas.length;
    casilla.indeterminate = cuantas > 0 && cuantas < filas.length;
  }

  function refrescar() { cuerpo(); pie(); }

  /* ---------- Cálculo ---------- */

  let calculoPendiente = false;

  function calcular() {
    if (!incluidas().length) {
      document.getElementById("pp-estado").textContent = "Incluye al menos una encuesta.";
      return;
    }
    const promedio = promedioDeLosPartidos();
    const objetivos = traducirAObjetivos(promedio);
    objetivosActuales = Object.assign({}, objetivos);
    calculoPendiente = true;
    const sorteos = document.getElementById("pp-sorteos").value;
    const selectorGeneral = document.getElementById("numero-sorteos");
    if (selectorGeneral) selectorGeneral.value = sorteos;
    crearDeslizadores();
    document.getElementById("pp-estado").textContent = "Calculando…";
    recalcular();
  }

  // app_prevision.js llama a esta función cuando termina cada cálculo: si venía de este botón, se avisa y se lleva al visitante al resultado nacional
  window.alTerminarElCalculo = function () {
    if (!calculoPendiente) return;
    calculoPendiente = false;
    document.getElementById("pp-estado").textContent = "Listo: " + entero(ultimoResultado.sorteos) + " simulaciones.";
    const destino = document.getElementById("nacional");
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
  const casillaDeTodas = document.getElementById("pp-todas");
  if (casillaDeTodas) {
    casillaDeTodas.addEventListener("change", function () {
      if (casillaDeTodas.checked) { pesosDelModelo(); }
      else { filas.forEach(function (fila) { fila.incluida = false; fila.peso = 0; }); }
      refrescar();
    });
  }
  document.getElementById("pp-modelo").addEventListener("click", function () { pesosDelModelo(); refrescar(); });
  document.getElementById("pp-iguales").addEventListener("click", function () { pesosIguales(); refrescar(); });
  document.getElementById("pp-calcular").addEventListener("click", calcular);

  cabecera();
  pesosDelModelo();
  refrescar();
})();
