"use strict";
const NOMBRES = {
  PP: "PP", PSOE: "PSOE", VOX: "Vox", SUMAR: "Frente Amplio", PODEMOS: "Podemos", SALF: "SALF", ADELANTE: "Adelante Andalucía", FV: "Front Valencià", UPC: "Unidad del Pueblo Canario",
  ERC: "ERC", JUNTS: "Junts", BILDU: "EH Bildu", PNV: "PNV", BNG: "BNG", CC: "Coalición Canaria", UPN: "UPN", PACMA: "PACMA", EXISTE: "Coalición Existe", OTROS: "Otros",
};
const COLORES = {
  PP: "#1d6fb8", PSOE: "#d4141c", VOX: "#4e9a1d", SUMAR: "#ee3500", SUMAR_ANTIGUO: "#c4157a", PODEMOS: "#6b2d8f", SALF: "#8a6a3b", ADELANTE: "#0b7a3a", FV: "#f2b08c", UPC: "#26c6da",
  ERC: "#d98c00", JUNTS: "#0a9e92", BILDU: "#7aa32c", PNV: "#0f7d3f", BNG: "#4b9fd0", CC: "#b8960a", UPN: "#2a4a8c", PACMA: "#9aa800", EXISTE: "#e377c2", OTROS: "#7a7a75",
};
const ORDEN_EN_LA_BARRA = ["PODEMOS", "BILDU", "BNG", "ERC", "ADELANTE", "FV", "UPC", "SUMAR", "PSOE", "PNV", "CC", "JUNTS", "EXISTE", "UPN", "PP", "VOX", "SALF", "PACMA"];
const DERECHA_AMPLIADA = ["PP", "VOX", "UPN", "CC", "SALF"];
const IZQUIERDA_Y_NACIONALISTAS = ["PSOE", "SUMAR", "PODEMOS", "FV", "UPC", "ADELANTE", "ERC", "JUNTS", "BILDU", "PNV", "BNG"];

const formatoPorcentaje = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// useGrouping «always»: en español, Intl no separa los miles de los números de cuatro cifras (3294) si no se le obliga
const formatoEntero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
const porcentaje = (valor) => formatoPorcentaje.format(valor) + "%";
const entero = (valor) => formatoEntero.format(valor);
// «1 escaño», «2 escaños»
const escanosEnTexto = (cantidad) => cantidad + (cantidad === 1 ? " escaño" : " escaños");
const ficha = (partido) => '<span class="ficha" style="background:' + COLORES[partido] + '"></span>';

// Logos cuadrados de los partidos (solo el emblema, o una ficha con siglas cuando no lo hay), en assets/logos/cuadrados/. Marcas de sus titulares (Wikimedia Commons).
// Se indexan por identificador del modelo (PP, VOX, SUMAR…) y por el nombre de columna del listado de sondeos (EH Bildu, CCa…).
const LOGOS_DE_PARTIDOS = {
  PP: "PP", PSOE: "PSOE", VOX: "Vox", Vox: "Vox", SUMAR: "FA", "Sumar/FA": "FA", SUMAR_ANTIGUO: "Sumar", PODEMOS: "Podemos", Podemos: "Podemos", ERC: "ERC", JUNTS: "Junts", Junts: "Junts",
  BILDU: "Bildu", "EH Bildu": "Bildu", PNV: "PNV", BNG: "BNG", SALF: "SALF", CC: "CCa", CCa: "CCa", UPN: "UPN", FV: "FV", UPC: "UPC", ADELANTE: "Adelante", "Adelante Andalucía": "Adelante"
};
function logoDePartido(clave, nombre) {
  const fichero = LOGOS_DE_PARTIDOS[clave];
  if (!fichero) return "";
  const texto = String(nombre || clave).replace(/[&<>"]/g, "");
  return '<span class="logo-partido"><img src="assets/logos/cuadrados/' + fichero + '.png" alt="' + texto + '" title="' + texto + '" width="28" height="28" loading="lazy"></span>';
}
