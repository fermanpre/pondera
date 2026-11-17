"use strict";
/*
 * Trabajador (Web Worker) del Monte Carlo: recibe los datos del modelo, los objetivos y el número de sorteos, simula con el mismo motor que el hilo principal
 * (motor.js, misma semilla) y devuelve las matrices de escaños de cada sorteo. Así los 10.000 sorteos no bloquean la página mientras se calculan.
 */
importScripts("../motor.js");

self.onmessage = function (evento) {
  const entrada = evento.data;
  const modelo = MotorElectoral.prepararModelo(entrada.datos);
  const simulacion = MotorElectoral.simular(modelo, { sorteos: entrada.sorteos, semilla: entrada.semilla, objetivos: entrada.objetivos });
  self.postMessage({ simulacion: simulacion }, [simulacion.nacionales.buffer, simulacion.provinciales.buffer]);
};
