// lib/googleSheets.js
// Cliente de Google Sheets API v4 vía Service Account + helpers de lectura/escritura
// dinámica (buscan celdas por texto de header en vez de coordenadas fijas, y respetan
// filas/columnas ocultas) para no romper fórmulas ni datos legacy en los sheets reales.

import { google } from "googleapis";

let _sheetsClient = null;

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "Falta la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON (contenido completo del JSON de la Service Account)."
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no contiene un JSON válido.");
  }
}

export async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;
  const creds = getCredentials();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  await auth.authorize();
  _sheetsClient = google.sheets({ version: "v4", auth });
  return _sheetsClient;
}

// ─── utilidades de texto/número ────────────────────────────────────────────

function normalize(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

export function toNumber(v) {
  if (v === "" || v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // saca separador de miles "."
    .replace(",", "."); // coma decimal -> punto
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function colToLetter(n) {
  let s = "";
  let num = n + 1;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

// ─── metadata + lectura de un tab completo ─────────────────────────────────

// Devuelve {sheetId, values, isColHidden(idx), isRowHidden(idx), title}
export async function getTabSnapshot(sheets, spreadsheetId, sheetTitle) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties,data.rowMetadata,data.columnMetadata)",
  });
  const sheet = meta.data.sheets.find((s) => s.properties.title === sheetTitle);
  if (!sheet) {
    const disponibles = meta.data.sheets.map((s) => s.properties.title).join(", ");
    throw new Error(
      `No encontré el tab "${sheetTitle}" en el spreadsheet ${spreadsheetId}. Tabs disponibles: ${disponibles}`
    );
  }
  const sheetId = sheet.properties.sheetId;
  const rowMeta = sheet.data?.[0]?.rowMetadata || [];
  const colMeta = sheet.data?.[0]?.columnMetadata || [];

  const valuesResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetTitle}'`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const values = valuesResp.data.values || [];

  return {
    sheetId,
    title: sheetTitle,
    values,
    isColHidden: (idx) => !!(colMeta[idx]?.hiddenByUser || colMeta[idx]?.hiddenByFilter),
    isRowHidden: (idx) => !!(rowMeta[idx]?.hiddenByUser || rowMeta[idx]?.hiddenByFilter),
  };
}

// Lista los tabs (nombre + si están ocultos) de un spreadsheet
export async function listTabs(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  return meta.data.sheets.map((s) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
    hidden: !!s.properties.hidden,
  }));
}

// Devuelve el nombre de tab a usar: el preferido si existe, sino el primero visible
export async function resolveTabTitle(sheets, spreadsheetId, preferredTitle) {
  const tabs = await listTabs(sheets, spreadsheetId);
  if (preferredTitle && tabs.some((t) => t.title === preferredTitle)) return preferredTitle;
  const visible = tabs.find((t) => !t.hidden) || tabs[0];
  if (!visible) throw new Error(`El spreadsheet ${spreadsheetId} no tiene tabs.`);
  return visible.title;
}

// ─── búsqueda de filas/columnas por texto ──────────────────────────────────

// Busca en una fila (array de celdas) la columna cuyo texto matchea targetText.
// Si onlyVisible=true, ignora columnas ocultas. Si hay más de un match, se queda
// con el PRIMERO (de izquierda a derecha). Importante: para grillas que repiten
// los nombres de mes en varios ciclos de año (ver findMonthColIndex), esta función
// NO alcanza para desambiguar — quedarse con "el último" asumía que la derecha era
// siempre "lo más reciente", pero en los sheets reales la derecha es el año SIGUIENTE
// (planificación a futuro), no el más vigente. Bug confirmado: un gasto de Junio 2026
// se guardaba en la columna de Junio 2027 por este motivo.
export function findColIndex(headerRow, targetText, { onlyVisible = false, isColHidden = () => false, exact = true } = {}) {
  const target = normalize(targetText);
  for (let c = 0; c < headerRow.length; c++) {
    if (onlyVisible && isColHidden(c)) continue;
    const cell = normalize(headerRow[c]);
    const match = exact ? cell === target : cell.includes(target);
    if (match) return c;
  }
  return -1;
}

// Como findColIndex, pero devuelve TODAS las columnas que matchean (en orden), no solo una.
export function findAllColIndices(headerRow, targetText, { onlyVisible = false, isColHidden = () => false, exact = true } = {}) {
  const target = normalize(targetText);
  const out = [];
  for (let c = 0; c < headerRow.length; c++) {
    if (onlyVisible && isColHidden(c)) continue;
    const cell = normalize(headerRow[c]);
    const match = exact ? cell === target : cell.includes(target);
    if (match) out.push(c);
  }
  return out;
}

// Algunas grillas personales repiten los 12 meses para planificar el año siguiente, así
// que un mes (ej. "Junio") puede aparecer dos veces en la misma fila de headers: una vez
// en el bloque del año en curso y otra en el bloque del año que viene. Para no escribir en
// el ciclo equivocado, identificamos los bloques contando los "Enero" de la fila (cada
// "Enero" marca el arranque de un ciclo/año nuevo) y elegimos el bloque según el año real
// del gasto comparado con el año real de hoy — el primer bloque de la grilla siempre
// representa el año en curso al momento de usar la app.
export function findMonthColIndex(headerRow, mesNombre, anio, { onlyVisible = false, isColHidden = () => false } = {}) {
  const matches = findAllColIndices(headerRow, mesNombre, { onlyVisible, isColHidden, exact: true });
  if (matches.length <= 1) return matches.length ? matches[0] : -1;

  const eneroCols = findAllColIndices(headerRow, "Enero", { onlyVisible, isColHidden, exact: true });
  const cycleOf = (c) => Math.max(eneroCols.filter((e) => e <= c).length, 1);

  const anioReal = Number(anio) || new Date().getFullYear();
  const anioActual = new Date().getFullYear();
  const targetCycle = anioReal - anioActual + 1;

  const match = matches.find((c) => cycleOf(c) === targetCycle);
  // Si no se pudo determinar el ciclo con certeza, preferimos el primer bloque (año en
  // curso) antes que arriesgarnos a pisar un bloque de un año futuro lejano.
  return match !== undefined ? match : matches[0];
}

// Busca en una columna (de la matriz de values) la fila cuyo texto matchea targetText.
export function findRowIndex(values, colIdx, targetText, { startRow = 0, endRow, exact = true, onlyVisible = false, isRowHidden = () => false } = {}) {
  const target = normalize(targetText);
  const limit = endRow ?? values.length;
  for (let r = startRow; r < limit; r++) {
    if (onlyVisible && isRowHidden(r)) continue;
    const cell = normalize(values[r]?.[colIdx]);
    const match = exact ? cell === target : cell.includes(target);
    if (match) return r;
  }
  return -1;
}

// Encuentra la última fila "llena" de un bloque contiguo que arranca en startRow
// (se detiene en el primer hueco). Útil para apilar/appendear debajo de una tabla.
export function findLastFilledRow(values, colIdx, startRow) {
  let last = startRow - 1;
  for (let r = startRow; r < values.length; r++) {
    const cell = values[r]?.[colIdx];
    if (cell !== undefined && cell !== null && String(cell).trim() !== "") {
      last = r;
    } else {
      break;
    }
  }
  return last;
}

// ─── escritura ──────────────────────────────────────────────────────────────

export async function updateCell(sheets, spreadsheetId, sheetTitle, rowIdx, colIdx, value) {
  const range = `'${sheetTitle}'!${colToLetter(colIdx)}${rowIdx + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

export async function writeRow(sheets, spreadsheetId, sheetTitle, rowIdx, startColIdx, rowValues) {
  const range = `'${sheetTitle}'!${colToLetter(startColIdx)}${rowIdx + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [rowValues] },
  });
}

// ─── dominio: grilla personal (categoría x mes) ────────────────────────────
// Sirve tanto para la hoja "Gastos" de Andrés (header en fila 2, categoría en col B)
// como para la hoja de Clarita (header en fila 1, categoría en col A). El monto ya
// debe venir con el signo correcto (gasto negativo, ingreso positivo) — la convención
// fue confirmada inspeccionando la hoja real de Andrés.
export async function writeToPersonalGrid(sheets, spreadsheetId, sheetTitle, { categoria, monto, mesNombre, anio, headerRowIdx, catColIdx }) {
  const snap = await getTabSnapshot(sheets, spreadsheetId, sheetTitle);
  const { values, isColHidden } = snap;
  const headerRow = values[headerRowIdx] || [];

  const monthCol = findMonthColIndex(headerRow, mesNombre, anio, { onlyVisible: true, isColHidden });
  if (monthCol === -1) {
    const err = new Error(
      `No hay ninguna columna VISIBLE con el mes "${mesNombre}" en la hoja "${sheetTitle}". Desocultá la columna correspondiente en Google Sheets y volvé a intentar — la app nunca escribe en columnas ocultas.`
    );
    err.code = "MONTH_COLUMN_NOT_VISIBLE";
    throw err;
  }

  const rowIdx = findRowIndex(values, catColIdx, categoria, { startRow: headerRowIdx + 1, exact: false });
  if (rowIdx === -1) {
    const err = new Error(`No encontré la categoría "${categoria}" en la hoja "${sheetTitle}".`);
    err.code = "CATEGORY_NOT_FOUND";
    throw err;
  }

  const current = toNumber(values[rowIdx]?.[monthCol]);
  const nuevo = current + monto;
  await updateCell(sheets, spreadsheetId, sheetTitle, rowIdx, monthCol, nuevo);

  return { fila: rowIdx + 1, columna: colToLetter(monthCol), valorAnterior: current, valorNuevo: nuevo };
}

// ─── dominio: sheet compartido (Principio del mes / Resto del mes) ────────
const SHARED_CATS_PRINCIPIO = ["Alquiler", "Servicios", "Supermercado", "Verduleria", "Carniceria", "Tarjeta", "Varios"];
const SHARED_CATS_RESTO = ["Servicios", "Supermercado", "Verduleria", "Carniceria", "Perris", "Varios", "Casa"];
// El sheet real escribe la fila como "Clara real" (no "Clarita real")
const NOMBRE_EN_SHARED_SHEET = { andres: "Andrés", clarita: "Clara" };

export async function writeSharedExpense(sheets, sharedSheetId, sheetTitle, { categoria, monto, usuarioKey }) {
  const snap = await getTabSnapshot(sheets, sharedSheetId, sheetTitle);
  const { values } = snap;
  const abs = Math.abs(monto);

  const enPrincipio = SHARED_CATS_PRINCIPIO.includes(categoria);
  const enResto = SHARED_CATS_RESTO.includes(categoria);
  const tablaLabel = enPrincipio && !enResto ? "Principio del mes" : enResto ? "Resto del mes" : "Principio del mes";

  const headerRow = findRowIndex(values, 0, tablaLabel, { exact: false });
  if (headerRow === -1) {
    throw new Error(`No encontré la tabla "${tablaLabel}" en el sheet compartido.`);
  }

  const catCol = findColIndex(values[headerRow] || [], categoria, { exact: true });
  if (catCol === -1) {
    throw new Error(`La categoría "${categoria}" no está en las columnas de la tabla "${tablaLabel}".`);
  }

  const montoRow = findRowIndex(values, 0, "MONTO", { startRow: headerRow + 1, endRow: headerRow + 8, exact: true });
  if (montoRow === -1) {
    throw new Error(`No encontré la fila "MONTO" dentro de la tabla "${tablaLabel}".`);
  }

  const nombreSheet = NOMBRE_EN_SHARED_SHEET[usuarioKey] || usuarioKey;
  const realRow = findRowIndex(values, 0, `${nombreSheet} real`, { startRow: headerRow + 1, endRow: headerRow + 8, exact: true });
  if (realRow === -1) {
    throw new Error(`No encontré la fila "${nombreSheet} real" dentro de la tabla "${tablaLabel}".`);
  }

  const currentMonto = toNumber(values[montoRow]?.[catCol]);
  const currentReal = toNumber(values[realRow]?.[catCol]);
  const nuevoMonto = currentMonto + abs;
  const nuevoReal = currentReal + abs;

  // Nota: NUNCA tocamos las filas "% " (Andrés %/Clara %) ni las columnas TOTALES/Diferencia —
  // esas son fórmulas del sheet. Solo escribimos MONTO y "{Nombre} real" en la columna de la categoría.
  await updateCell(sheets, sharedSheetId, sheetTitle, montoRow, catCol, nuevoMonto);
  await updateCell(sheets, sharedSheetId, sheetTitle, realRow, catCol, nuevoReal);

  return { tabla: tablaLabel, categoria, montoNuevo: nuevoMonto, realNuevo: nuevoReal };
}

// ─── dominio: consumos de tarjeta del mes (tab "Tarjeta") ──────────────────
// Hay (al menos) dos bloques de tabla "Consumos tarjeta del mes" cuyo rótulo de mes
// está desactualizado — en vez de confiar en el rótulo, elegimos el bloque cuyas
// fechas existentes están más cerca del mes/año objetivo.
export async function appendConsumoTarjeta(sheets, spreadsheetId, sheetTitle, { fecha, tarjeta, detalle, monto, mesObjetivo, anioObjetivo }) {
  const snap = await getTabSnapshot(sheets, spreadsheetId, sheetTitle);
  const { values } = snap;

  // Encontrar todos los headers "Fecha" seguidos de "Tarjeta"/"Detalle"/"Monto" en la misma fila
  // (cada bloque "Consumos tarjeta del mes" tiene esa fila de sub-headers).
  const bloques = [];
  for (let r = 0; r < values.length; r++) {
    const row = values[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (normalize(row[c]) === "fecha") {
        bloques.push({ headerRow: r, col: c });
      }
    }
  }
  if (bloques.length === 0) {
    const err = new Error(`No encontré ninguna tabla de "Consumos tarjeta del mes" en "${sheetTitle}".`);
    err.code = "CONSUMO_TABLE_NOT_FOUND";
    throw err;
  }

  // Para cada bloque, mirar las fechas ya cargadas y puntuar qué tan "vigente" es
  let mejor = null;
  let mejorScore = -Infinity;
  for (const b of bloques) {
    const lastRow = findLastFilledRow(values, b.col, b.headerRow + 1);
    let score = -1000;
    if (lastRow >= b.headerRow + 1) {
      // mirar la última fecha cargada del bloque
      const ultimaFecha = values[lastRow]?.[b.col];
      const parsed = parseFechaDDMMYY(ultimaFecha);
      if (parsed) {
        // más cercano (sin pasarse) al mes/año objetivo = mejor
        const diffMeses = (anioObjetivo - parsed.anio) * 12 + (mesObjetivo - parsed.mes);
        score = diffMeses >= 0 ? 100 - diffMeses : -100 + diffMeses;
      }
    } else {
      score = -50; // bloque vacío: candidato de último recurso
    }
    if (score > mejorScore) {
      mejorScore = score;
      mejor = b;
    }
  }

  const targetRow = findLastFilledRow(values, mejor.col, mejor.headerRow + 1) + 1;
  // Columnas del bloque: Fecha, Tarjeta, Detalle, Monto (en ese orden, a partir de mejor.col)
  await writeRow(sheets, spreadsheetId, sheetTitle, targetRow, mejor.col, [fecha, tarjeta, detalle, Math.abs(monto)]);

  return { fila: targetRow + 1, columnaInicio: colToLetter(mejor.col) };
}

function parseFechaDDMMYY(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  let anio = parseInt(m[3], 10);
  if (anio < 100) anio += 2000;
  return { dia: parseInt(m[1], 10), mes: parseInt(m[2], 10), anio };
}

// ─── dominio: cuotas (tab "Tarjeta") ────────────────────────────────────────
// Las ~45 mini-tablas de cuotas están apiladas verticalmente. Cada compra nueva en
// cuotas se agrega como una mini-tabla nueva al final del bloque (nunca se edita una
// mini-tabla existente).
export async function appendCuotas(sheets, spreadsheetId, sheetTitle, { detalle, tarjeta, montoTotal, cantidadCuotas, montoPorCuota, fechaCompra, mesUltimaCuota }) {
  const snap = await getTabSnapshot(sheets, spreadsheetId, sheetTitle);
  const { values } = snap;

  // Buscamos la última fila no vacía de toda la columna A (o B) para apilar debajo de todo.
  let lastRow = -1;
  for (let r = 0; r < values.length; r++) {
    const rowHasData = (values[r] || []).some((c) => String(c ?? "").trim() !== "");
    if (rowHasData) lastRow = r;
  }
  const headerRowIdx = lastRow + 2; // deja una fila en blanco de separación, como en las mini-tablas existentes
  const dataRowIdx = headerRowIdx + 1;

  const headers = ["Detalle", "Tarjeta", "Monto Total", "Cantidad de cuotas", "Monto a Pagar", "Mes última cuota", "Fecha de compra"];
  const data = [detalle, tarjeta, Math.abs(montoTotal), cantidadCuotas, Math.abs(montoPorCuota), mesUltimaCuota || "", fechaCompra || ""];

  await writeRow(sheets, spreadsheetId, sheetTitle, headerRowIdx, 0, headers);
  await writeRow(sheets, spreadsheetId, sheetTitle, dataRowIdx, 0, data);

  return { filaHeader: headerRowIdx + 1, filaDatos: dataRowIdx + 1 };
}

// ─── dominio: lectura para reconciliación de PDF ───────────────────────────
// Lee los consumos y cuotas ya cargados (tab "Tarjeta") para cruzarlos contra lo
// extraído del resumen de tarjeta en PDF, en vez de usar el historial en memoria.
export async function readConsumosYCuotas(sheets, spreadsheetId, sheetTitle) {
  const snap = await getTabSnapshot(sheets, spreadsheetId, sheetTitle);
  const { values } = snap;

  const consumos = [];
  for (let r = 0; r < values.length; r++) {
    const row = values[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (normalize(row[c]) === "fecha" && normalize(row[c + 1]).includes("tarjeta")) {
        // bloque de consumos: leer filas siguientes hasta el primer hueco
        const last = findLastFilledRow(values, c, r + 1);
        for (let rr = r + 1; rr <= last; rr++) {
          const dataRow = values[rr] || [];
          consumos.push({
            fecha: dataRow[c],
            tarjeta: dataRow[c + 1],
            detalle: dataRow[c + 2],
            monto: toNumber(dataRow[c + 3]),
          });
        }
      }
    }
  }

  const cuotas = [];
  for (let r = 0; r < values.length; r++) {
    const row = values[r] || [];
    if (normalize(row[0]) === "detalle" && normalize(row[1]).includes("tarjeta")) {
      const dataRow = values[r + 1] || [];
      if (dataRow.some((c) => String(c ?? "").trim() !== "")) {
        cuotas.push({
          detalle: dataRow[0],
          tarjeta: dataRow[1],
          montoTotal: toNumber(dataRow[2]),
          cantidadCuotas: dataRow[3],
          montoPorCuota: toNumber(dataRow[4]),
        });
      }
    }
  }

  return { consumos, cuotas };
}
