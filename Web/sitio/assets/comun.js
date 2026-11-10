"use strict";
const NOMBRES = {
  PP: "PP", PSOE: "PSOE", VOX: "Vox", SUMAR: "Frente Amplio", PODEMOS: "Podemos", SALF: "Se Acabó La Fiesta", ADELANTE: "Adelante Andalucía", FV: "Front Valencià",
  ERC: "ERC", JUNTS: "Junts", BILDU: "EH Bildu", PNV: "PNV", BNG: "BNG", CC: "Coalición Canaria", UPN: "UPN", PACMA: "PACMA", EXISTE: "Coalición Existe (Teruel Existe y Aragón Existe)", OTROS: "Otros",
};
const COLORES = {
  PP: "#1d6fb8", PSOE: "#d4141c", VOX: "#4e9a1d", SUMAR: "#ee3500", SUMAR_ANTIGUO: "#c4157a", PODEMOS: "#6b2d8f", SALF: "#8a6a3b", ADELANTE: "#0b7a3a", FV: "#f2b08c",
  ERC: "#d98c00", JUNTS: "#0a9e92", BILDU: "#7aa32c", PNV: "#0f7d3f", BNG: "#4b9fd0", CC: "#b8960a", UPN: "#2a4a8c", PACMA: "#9aa800", EXISTE: "#e377c2", OTROS: "#7a7a75",
};
const ORDEN_EN_LA_BARRA = ["PODEMOS", "BILDU", "BNG", "ERC", "ADELANTE", "FV", "SUMAR", "PSOE", "PNV", "CC", "JUNTS", "EXISTE", "UPN", "PP", "VOX", "SALF", "PACMA"];
const DERECHA_AMPLIADA = ["PP", "VOX", "UPN", "CC", "SALF"];
const IZQUIERDA_Y_NACIONALISTAS = ["PSOE", "SUMAR", "PODEMOS", "FV", "ADELANTE", "ERC", "JUNTS", "BILDU", "PNV", "BNG"];

const formatoPorcentaje = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const formatoEntero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const porcentaje = (valor) => formatoPorcentaje.format(valor) + " %";
const entero = (valor) => formatoEntero.format(valor);
const ficha = (partido) => '<span class="ficha" style="background:' + COLORES[partido] + '"></span>';
