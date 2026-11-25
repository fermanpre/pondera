"use strict";
/*
 * Punto final del gráfico de evolución (25/11/2026): resume la previsión vigente (sitio/datos_modelo.json, con la tendencia ya proyectada al día de la votación) con el mismo cálculo
 * que cada día de la serie. Escribe sitio/proyeccion_final.js (const PROYECCION_FINAL), que sitio/grafico_prevision.js dibuja en línea discontinua desde el último día de la serie.
 * Hay que volver a ejecutarlo cada vez que cambie datos_modelo.json. Si la previsión no lleva proyección, escribe null.
 * Uso: node proyeccion_final.js [sorteos]
 */
const fs = require("fs");
const path = require("path");
const { resumirDia } = require("./serie_prevision_simular.js");

const carpetaSitio = path.join(__dirname, "sitio");
const datos = JSON.parse(fs.readFileSync(path.join(carpetaSitio, "datos_modelo.json"), "utf8"));
const sorteos = process.argv[2] ? parseInt(process.argv[2], 10) : 50000;

let proyeccion = null;
if (datos.proyeccion_tendencia) {
  proyeccion = resumirDia(datos, sorteos);
  proyeccion.desde = datos.proyeccion_tendencia.dia_de_corte;
  proyeccion.fecha = "2026-11-29";
}
const texto = JSON.stringify(proyeccion, (clave, valor) => (typeof valor === "number" ? Math.round(valor * 10000) / 10000 : valor));
fs.writeFileSync(path.join(carpetaSitio, "proyeccion_final.js"), "const PROYECCION_FINAL = " + texto + ";\n", "utf8");
if (proyeccion) console.log("Proyección final desde", proyeccion.desde, "| PP", proyeccion.central.PP, "PSOE", proyeccion.central.PSOE, "Vox", proyeccion.central.VOX, "|", sorteos, "sorteos");
