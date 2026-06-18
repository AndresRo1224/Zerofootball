/**
 * engine/index.js — Punto de entrada del motor de predicción.
 * Reexporta todo para importar desde un solo lugar: `import * as Engine from "./engine/index.js"`.
 */
export * from "./elo.js";
export * from "./poisson.js";
export * from "./prediction.js";
export * from "./tournament.js";
export * from "./league.js";
