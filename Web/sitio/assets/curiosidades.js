"use strict";
/*
 * Datos curiosos. (20/11/2026)
 *   - redactarCuriosidad(dato): texto (HTML) y enlace de cada dato; lo usan el cuadro «¿Sabías que…?» de Inicio y la página con el listado completo (curiosidades.html).
 *   - Cuadro de Inicio (#curiosidad): un dato al azar en cada visita, con un botón para ver otro.
 * Usa CURIOSIDADES (curiosidades.js, que genera datos_curiosos.js con las mismas simulaciones que el resto de la web) y NOMBRES y COLORES de comun.js.
 */
const TIPOS_DE_CURIOSIDAD = {
  barrera: { titulo: "Fuera por la barrera", explicacion: "Partidos que se quedan sin escaño en una provincia por no llegar al 3 % de los votos válidos aunque por cociente les tocaría uno. En cada simulación se repite el reparto D'Hondt sin barrera: solo cuentan las simulaciones en las que, sin barrera, el partido habría sacado al menos un escaño y, con ella, se queda fuera. Se muestran los que lo sufren en el 5 % de las simulaciones o más." },
  margen: { titulo: "Votos que separan de un escaño", explicacion: "En el reparto central (sin ruido), cuántos votos le faltan al primer partido que se queda fuera para quitarle el último escaño de la provincia al último que entra. Se muestran las provincias con el margen más pequeño." },
  incierta: { titulo: "Provincias con el reparto más incierto", explicacion: "Probabilidad de que el reparto central de escaños de una provincia (entre 3 y 10 escaños) sea exactamente el que sale en una simulación. Cuanto más baja, más puede moverse el resultado. Las provincias grandes no se cuentan: allí cualquier reparto exacto es improbable y el dato no dice nada." },
  nacional: { titulo: "Partidos que pueden quedarse sin diputados", explicacion: "Probabilidad de que un partido no saque ningún escaño en toda España, para los partidos cuya probabilidad está entre el 5 y el 95 %." },
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
      return { texto: etiquetaDe(dato.partido, dato.provincia) + " se queda sin escaño en " + escapar(dato.provincia) + " por la barrera del " + barrera + " % en el " + porcentaje(dato.probabilidad) + " de las simulaciones: saca los votos para un escaño por cociente, pero no llega al " + barrera + " %." +
        ultimo + " En total queda por debajo del " + barrera + " % en el " + porcentaje(dato.debajo_de_la_barrera) + " de las simulaciones.", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "margen") {
      return { texto: "En " + escapar(dato.provincia) + ", " + formatoEntero.format(dato.votos) + " votos separan a " + etiquetaDe(dato.partido_fuera, dato.provincia) + " de arrebatarle el último escaño a " + etiquetaDe(dato.partido_dentro, dato.provincia) + ", en el reparto central (" + dato.escanos + " escaños en juego).", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "incierta") {
      return { texto: "En " + escapar(dato.provincia) + " (" + dato.escanos + " escaños), el reparto central solo se repite en el " + porcentaje(dato.probabilidad) + " de las simulaciones: es una de las provincias donde más puede moverse el resultado.", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "nacional") {
      return { texto: etiquetaDe(dato.partido, "") + " se queda sin ningún diputado en toda España en el " + porcentaje(dato.probabilidad) + " de las simulaciones.", enlace: "index.html#nacional", rotulo: "Ver los escaños" };
    }
    if (dato.tipo === "voto") {
      return { texto: "Un voto a " + etiquetaDe(dato.partido, dato.provincia) + " en " + escapar(dato.provincia) + " vale ×" + formatoDecimal.format(dato.valor) + " el voto medio de España: es de los votos que más pesan en el reparto de escaños.", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
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
})();
