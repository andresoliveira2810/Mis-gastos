// shared/config.js
// Config compartida entre el frontend (src/App.jsx) y las serverless functions
// (api/*.js). Sin dependencias de Node ni de browser — solo constantes y funciones puras.

export const CONFIG = {
  andres: {
    nombre: "Andrés",
    sheetId: "1FYHDh53HE_4o_zCNoHinEf_iuSLPqcpX",
    // Layout real de "GASTOS PERSONALES.xlsx" (confirmado inspeccionando el sheet real):
    personalTab: "Gastos",
    personalHeaderRow: 1, // fila 2 (0-indexed) — ahí están los headers de mes
    personalCatCol: 1, // columna B — ahí están las categorías
    tarjetaTab: "Tarjeta",
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

// Mapeo exacto de categorías a tabla en el sheet compartido.
// Tabla "Principio del mes": Alquiler, Servicios, Supermercado, Verduleria, Carniceria, Tarjeta, Varios
// Tabla "Resto del mes": Servicios, Supermercado, Verduleria, Carniceria, Perris, Varios, Casa
export const SHARED_CATS_PRINCIPIO = ["Alquiler", "Servicios", "Supermercado", "Verduleria", "Carniceria", "Tarjeta", "Varios"];
export const SHARED_CATS_RESTO = ["Servicios", "Supermercado", "Verduleria", "Carniceria", "Perris", "Varios", "Casa"];
export const ALL_SHARED_CATS = [...new Set([...SHARED_CATS_PRINCIPIO, ...SHARED_CATS_RESTO])];

export const CATEGORIES_ANDRES = [
  "Sueldo", "Otros ingresos", "Reintegro tarjeta", "Rescate Fima",
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
