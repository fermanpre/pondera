"use strict";
/*
 * Datos curiosos. (20/11/2026)
 *   - redactarCuriosidad(dato): texto (HTML) y enlace de cada dato; lo usan el cuadro «¿Sabías que…?» de Inicio y la página con el listado completo (curiosidades.html).
 *   - Cuadro de Inicio (#curiosidad): un dato al azar en cada visita, con un botón para ver otro.
 * Usa CURIOSIDADES (curiosidades.js, que genera datos_curiosos.js con las mismas simulaciones que el resto de la web) y NOMBRES y COLORES de comun.js.
 */
const TIPOS_DE_CURIOSIDAD = {
  barrera: { titulo: "Fuera por la barrera", explicacion: "Partidos que se quedan sin escaño en una provincia por no llegar al 3 % de los votos válidos aunque por cociente les tocaría uno. En cada simulación se repite el reparto D'Hondt sin barrera: solo cuentan las simulaciones en las que, sin barrera, el partido habría sacado al menos un escaño y, con ella, se queda fuera. Solo en las provincias donde el último escaño cuesta menos del 3 % del voto (hoy Madrid): en las demás, el propio reparto D'Hondt exige más de un 3 % y la barrera no actúa. Se muestran los que lo sufren en el 5 % de las simulaciones o más." },
  margen: { titulo: "Votos que separan de un escaño", explicacion: "En el reparto central (sin ruido), cuántos votos le faltan al primer partido que se queda fuera para quitarle el último escaño de la provincia al último que entra. Se muestran las provincias con el margen más pequeño." },
  incierta: { titulo: "Provincias con el reparto más incierto", explicacion: "Probabilidad de que el reparto central de escaños de una provincia (entre 3 y 10 escaños) sea exactamente el que sale en una simulación. Cuanto más baja, más puede moverse el resultado. Las provincias grandes no se cuentan: allí cualquier reparto exacto es improbable y el dato no dice nada." },
  nacional: { titulo: "Partidos que pueden quedarse sin diputados", explicacion: "Probabilidad de que un partido no saque ningún escaño en toda España, para los partidos cuya probabilidad está entre el 5 y el 95 %." },
  primera: { titulo: "Disputa por la primera plaza", explicacion: "Provincias de cuatro escaños o más donde dos partidos se disputan ser el que más escaños saca: probabilidad de cada uno de quedar primero en las simulaciones (los empates no cuentan), con la segunda opción por encima del 15 %. Se muestran las más igualadas." },
  giro: { titulo: "Los mayores giros desde 2023", explicacion: "El mayor cambio en el porcentaje de votos válidos de cada partido respecto a las generales de 2023 (resultado real) en una provincia, comparado con el reparto central de 2026. Solo partidos con al menos un 3 % en 2023, un dato por partido." },
  entra: { titulo: "¿Entra o no entra?", explicacion: "Partidos con una probabilidad de sacar al menos un escaño en una provincia entre el 30 y el 70 % y un voto central de al menos el 1 %. Se muestran los más cercanos al 50 %." },
  voto: { titulo: "Los votos que más pesan", explicacion: "Los votos con mayor valor frente al voto medio de España (el «valor de un voto» de la sección de voto útil), solo de partidos con al menos un 1 % del voto en la provincia y un valor de ×2 o más." },
};

(function () {
  if (typeof CURIOSIDADES === "undefined" || !CURIOSIDADES.datos.length) { return; }
  const nombreDe = (partido, provincia) => {
    if (partido === "UPN" && provincia === "Navarra") { return "UPN-PP"; }
    return (typeof NOMBRES !== "undefined" && NOMBRES[partido]) || partido;
  };
  const colorDe = (partido) => (typeof COLORES !== "undefined" && COLORES[partido]) || "#7a7a75";
  const porcentaje = (probabilidad) => Math.round(100 * probabilidad) + " %";
  // «en el 95 % de las simulaciones» o, en el modo de frecuencias, «en 19 de cada 20 simulaciones»
  const enSimulaciones = (probabilidad) => PROBABILIDAD.enLasSimulaciones(probabilidad, porcentaje(probabilidad));
  const formatoEntero = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
  const formatoDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function escapar(texto) { return String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  const etiquetaDe = (partido, provincia) => '<b class="curio-partido" style="--c:' + colorDe(partido) + '">' + escapar(nombreDe(partido, provincia)) + "</b>";
  const porcentajeDeVoto = (fraccion) => formatoDecimal.format(100 * fraccion);

  // Texto de cada tipo de dato: { texto (HTML), enlace (página donde profundizar), rotulo }
  window.redactarCuriosidad = function (dato) {
    if (dato.tipo === "barrera") {
      const barrera = formatoDecimal.format(100 * dato.barrera).replace(",0", "");
      const ultimo = dato.ultimo_escano ? " El último escaño de " + escapar(dato.provincia) + " cuesta un " + porcentajeDeVoto(dato.ultimo_escano) + " % de los votos válidos en el reparto central, y " + escapar(nombreDe(dato.partido, dato.provincia)) + " tiene un " + porcentajeDeVoto(dato.voto_central) + " %." : "";
      return { texto: etiquetaDe(dato.partido, dato.provincia) + " se queda sin escaño en " + escapar(dato.provincia) + " por la barrera del " + barrera + " % " + enSimulaciones(dato.probabilidad) + ": saca los votos para un escaño por cociente, pero no llega al " + barrera + " %." +
        ultimo + " En total queda por debajo del " + barrera + " % " + enSimulaciones(dato.debajo_de_la_barrera) + ".", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "margen") {
      return { texto: "En " + escapar(dato.provincia) + ", " + formatoEntero.format(dato.votos) + " votos separan a " + etiquetaDe(dato.partido_fuera, dato.provincia) + " de arrebatarle el último escaño a " + etiquetaDe(dato.partido_dentro, dato.provincia) + ", en el reparto central (" + dato.escanos + " escaños en juego).", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "incierta") {
      return { texto: "En " + escapar(dato.provincia) + " (" + escanosEnTexto(dato.escanos) + "), el reparto central solo se repite " + enSimulaciones(dato.probabilidad) + ": es una de las provincias donde más puede moverse el resultado.", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "nacional") {
      return { texto: etiquetaDe(dato.partido, "") + " se queda sin ningún diputado en toda España " + enSimulaciones(dato.probabilidad) + ".", enlace: "index.html#nacional", rotulo: "Ver los escaños" };
    }
    if (dato.tipo === "voto") {
      return { texto: "Un voto a " + etiquetaDe(dato.partido, dato.provincia) + " en " + escapar(dato.provincia) + " vale ×" + formatoDecimal.format(dato.valor) + " el voto medio de España: es de los votos que más pesan en el reparto de escaños.", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "primera") {
      return { texto: "En " + escapar(dato.provincia) + " (" + escanosEnTexto(dato.escanos) + ") la primera plaza está disputada: " + etiquetaDe(dato.partido_a, dato.provincia) + " queda primero " + enSimulaciones(dato.probabilidad_a) + " y " + etiquetaDe(dato.partido_b, dato.provincia) + " " + enSimulaciones(dato.probabilidad_b) + ".", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "giro") {
      const sube = dato.puntos > 0;
      return { texto: etiquetaDe(dato.partido, dato.provincia) + " " + (sube ? "sube" : "baja") + " " + formatoDecimal.format(Math.abs(dato.puntos)) + " puntos en " + escapar(dato.provincia) + " respecto a 2023: pasa del " + porcentajeDeVoto(dato.de) + " % al " + porcentajeDeVoto(dato.a) + " % de los votos válidos. Es el mayor giro de este partido en cualquier provincia.", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "entra") {
      return { texto: etiquetaDe(dato.partido, dato.provincia) + (PROBABILIDAD.activo() ? " saca al menos un escaño en " + escapar(dato.provincia) + " (" + escanosEnTexto(dato.escanos) + " en juego) " + enSimulaciones(dato.probabilidad) + "." : " tiene un " + porcentaje(dato.probabilidad) + " de probabilidad de sacar al menos un escaño en " + escapar(dato.provincia) + " (" + dato.escanos + " escaños en juego)."), enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    return null;
  };

  // Cuadro de Inicio
  const contenedor = document.getElementById("curiosidad");
  if (!contenedor) { return; }
  const datos = CURIOSIDADES.datos;
  let ultimo = -1;
  function mostrar() {
    let indice = Math.floor(Math.random() * datos.length);
    if (datos.length > 1 && indice === ultimo) { indice = (indice + 1 + Math.floor(Math.random() * (datos.length - 1))) % datos.length; }
    ultimo = indice;
    const redaccion = window.redactarCuriosidad(datos[indice]);
    if (!redaccion) { return; }
    contenedor.querySelector(".curio-texto").innerHTML = redaccion.texto;
    const enlace = contenedor.querySelector(".curio-enlace");
    enlace.href = redaccion.enlace;
    enlace.textContent = redaccion.rotulo;
  }
  contenedor.hidden = false;
  contenedor.querySelector(".curio-otro").addEventListener("click", mostrar);
  mostrar();
  // Al cambiar el modo de las probabilidades se redacta de nuevo el dato que se está viendo
  PROBABILIDAD.alCambiar(function () {
    const redaccion = ultimo >= 0 ? window.redactarCuriosidad(datos[ultimo]) : null;
    if (redaccion) { contenedor.querySelector(".curio-texto").innerHTML = redaccion.texto; }
  });
})();
