"use strict";
/*
 * «¿Sabías que…?»: un dato curioso al azar en cada visita de Inicio, con un botón para ver otro.
 * Usa CURIOSIDADES (curiosidades.js, que genera datos_curiosos.js con las mismas simulaciones que el resto de la web) y NOMBRES y COLORES de comun.js.
 */
(function () {
  const contenedor = document.getElementById("curiosidad");
  if (!contenedor || typeof CURIOSIDADES === "undefined" || !CURIOSIDADES.datos.length) { return; }
  const datos = CURIOSIDADES.datos;
  const nombreDe = (partido, provincia) => {
    if (partido === "UPN" && provincia === "Navarra") { return "UPN-PP"; }
    return (typeof NOMBRES !== "undefined" && NOMBRES[partido]) || partido;
  };
  const colorDe = (partido) => (typeof COLORES !== "undefined" && COLORES[partido]) || "#7a7a75";
  const porcentaje = (probabilidad) => Math.round(100 * probabilidad) + " %";
  const formatoEntero = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
  const formatoDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const formatoVoto = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function escapar(texto) { return String(texto).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  const etiquetaDe = (partido, provincia) => '<b class="curio-partido" style="--c:' + colorDe(partido) + '">' + escapar(nombreDe(partido, provincia)) + "</b>";

  // Texto de cada tipo de dato: devuelve { texto (HTML), enlace (página donde profundizar) }
  function redactar(dato) {
    const barrera = formatoDecimal.format(100 * (dato.barrera || 0.03)).replace(",0", "");
    if (dato.tipo === "barrera") {
      const central = formatoDecimal.format(100 * dato.voto_central);
      const sinVoto = dato.probabilidad >= 0.5
        ? "El escenario central lo deja por debajo, con un " + central + " % de los votos válidos: se queda sin escaño en el " + porcentaje(dato.probabilidad) + " de las simulaciones."
        : "En el escenario central queda justo por encima, con un " + central + " % de los votos válidos, pero en el " + porcentaje(dato.probabilidad) + " de las simulaciones no llega.";
      return { texto: etiquetaDe(dato.partido, dato.provincia) + " no entra en el reparto de " + escapar(dato.provincia) + " si no llega al " + barrera + " % de los votos válidos. " + sinVoto, enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "margen") {
      return { texto: "En " + escapar(dato.provincia) + ", " + formatoEntero.format(dato.votos) + " votos separan a " + etiquetaDe(dato.partido_fuera, dato.provincia) + " de arrebatarle el último escaño a " + etiquetaDe(dato.partido_dentro, dato.provincia) + ", en el reparto central (" + dato.escanos + " escaños en juego).", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "incierta") {
      return { texto: "En " + escapar(dato.provincia) + " (" + dato.escanos + " escaños), el reparto central solo se repite en el " + porcentaje(dato.probabilidad) + " de las simulaciones: es una de las provincias donde más puede moverse el resultado.", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    if (dato.tipo === "nacional") {
      return { texto: etiquetaDe(dato.partido, "") + " se queda sin ningún diputado en toda España en el " + porcentaje(dato.probabilidad) + " de las simulaciones.", enlace: "#nacional", rotulo: "Ver los escaños" };
    }
    if (dato.tipo === "voto") {
      return { texto: "Un voto a " + etiquetaDe(dato.partido, dato.provincia) + " en " + escapar(dato.provincia) + " vale ×" + formatoVoto.format(dato.valor) + " el voto medio de España: es de los votos que más pesan en el reparto de escaños.", enlace: "provincias.html", rotulo: "Ver la página de provincias" };
    }
    return null;
  }

  let ultimo = -1;
  function mostrar() {
    let indice = Math.floor(Math.random() * datos.length);
    if (datos.length > 1 && indice === ultimo) { indice = (indice + 1 + Math.floor(Math.random() * (datos.length - 1))) % datos.length; }
    ultimo = indice;
    const redaccion = redactar(datos[indice]);
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
