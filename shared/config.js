// shared/config.js
// Config compartida entre el frontend (src/App.jsx) y las serverless functions
// (api/*.js). Sin dependencias de Node ni de browser — solo constantes y funciones puras.

export const CONFIG = {
  andres: {
    nombre: "Andrés",
    // Planilla nueva "Gastos Andrés", rediseñada por el usuario el 26/06/2026 (reemplaza
    // la vieja, muy "toqueteada"). Layout confirmado inspeccionando el sheet real:
    sheetId: "1MBJIekg5jA46YHcgzwXl6qcPClTI93ZNUxCsY9P5TC4",
    personalTab: "Gastos",
    personalHeaderRow: 1, // fila 2 (0-indexed) — ahí están los headers de mes (fecha)
    personalCatCol: 1, // columna B — ahí están las categorías
    tarjetaTab: "Tarjeta",
    // La celda "Gastos varios" de la grilla principal es una FÓRMULA (=-TOTAL del bloque
    // "Variables" itemizado a la derecha) — nunca hay que escribirla directo, se rompería.
    // Esta categoría (y cualquier otra que no tenga fila propia en la grilla, según pidió
    // el usuario: "si hay alguno que no sabes donde va ponelo ahí") se itemiza en ese
    // bloque en vez de pisar una celda. Ver findVariablesBlock/appendVariableExpense en
    // lib/googleSheets.js.
    variablesCategoria: "Gastos varios",
  },
  clarita: {
    nombre: "Clarita",
    sheetId: "12pbyZQoizcscAVw0-QmHFNyJSPusxqnV73ylkGHYm9w",
    // Sheet nuevo/simple: Detalle en col A, headers de mes en fila 1. Clarita lo va a
    // personalizar después — personalTab=null hace que el backend use el primer tab visible.
    personalTab: null,
    personalHeaderRow: 0,
    personalCatCol: 0,
    tarjetaTab: null,
  },
};

// Sheet compartido real (confirmado por el usuario — el ID viejo hardcodeado era un
// sheet vacío sin datos, este es el que tiene los datos reales de Ingresos/Principio
// del mes/Resto del mes).
export const SHARED_SHEET_ID = "1Q_n2aWCg3BQJC0z_x_VIpEEqjaZ15KwmfJ1P7snabWE";
export const SHARED_SHEET_TAB = "Hoja 1";

// El usuario unificó las tablas "Principio del mes" y "Resto del mes" en una sola
// tabla (confirmado inspeccionando el sheet real el 25/06/2026). Categorías reales
// de esa tabla única (fila de encabezado, columnas B en adelante): Alquiler,
// Servicios, Supermercado, Verduleria, Carniceria, Tarjeta, Perris, Varios.
// "Casa" ya no es una columna del sheet compartido (sigue existiendo como categoría
// personal en CATEGORIES_ANDRES/CATEGORIES_CLARITA, pero no se comparte).
export const ALL_SHARED_CATS = ["Alquiler", "Servicios", "Supermercado", "Verduleria", "Carniceria", "Tarjeta", "Perris", "Varios"];

export const CATEGORIES_ANDRES = [
  // "Rescate Fima" → "Reintegro Clari": la planilla nueva renombró esa fila (confirmado
  // inspeccionando el sheet real el 26/06/2026).
  "Sueldo", "Otros ingresos", "Reintegro tarjeta", "Reintegro Clari",
  "Tarjeta", "Alquiler", "Agua", "EPE", "Internet", "Gas",
  "Casa", "Peluquería", "Combustible", "Supermercado", "Verduleria",
  "Gastos comidas", "Inversiones", "Plataformas y seguros", "Gastos varios", "Regalos",
];
export const CATEGORIES_CLARITA = [
  "Sueldo", "Otros ingresos", "Tarjeta", "Alquiler", "Servicios",
  "Supermercado", "Verduleria", "Carniceria", "Casa", "Peluquería",
  "Combustible", "Gastos comidas", "Inversiones", "Gastos varios", "Regalos",
];

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Antes NOW_MONTH/NOW_YEAR estaban hardcodeados ("Junio"/2026) — ahora se derivan
// de la fecha real para que la app no quede desactualizada.
export function getNowMesAnio() {
  const d = new Date();
  return { mes: MESES[d.getMonth()], anio: d.getFullYear(), mesIdx: d.getMonth() + 1 };
}

// Tarjetas Galicia VISA conocidas (para reconciliación de PDF)
export const TARJETAS = {
  "1504": "andres",
  "0044": "clarita",
};
