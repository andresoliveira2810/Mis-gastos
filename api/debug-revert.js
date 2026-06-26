// api/debug-revert.js
// Endpoint TEMPORAL para revertir las escrituras de prueba hechas en la planilla real
// de Andrés durante el diagnóstico del 26/06/2026. Borrar junto con debug-sheet.js
// apenas se confirme que revirtió todo bien.
import { getSheetsClient, getTabSnapshot, updateCell, findColIndex, findRowIndex, toNumber } from "../lib/googleSheets.js";
import { CONFIG, SHARED_SHEET_ID, SHARED_SHEET_TAB } from "../shared/config.js";

export default async function handler(req, res) {
  try {
    const cfg = CONFIG.andres;
    const sheets = await getSheetsClient();
    const out = {};

    // 1) Gastos: Combustible fila17(idx16) colH(idx7) -60000
    {
      const snap = await getTabSnapshot(sheets, cfg.sheetId, "Gastos");
      const before = toNumber(snap.values[16]?.[7]);
      const after = before + 60000;
      await updateCell(sheets, cfg.sheetId, "Gastos", 16, 7, after);
      out.combustible = { before, after };
    }

    // 2) Gastos: Supermercado fila18(idx17) colH(idx7) -80000
    {
      const snap = await getTabSnapshot(sheets, cfg.sheetId, "Gastos");
      const before = toNumber(snap.values[17]?.[7]);
      const after = before + 80000;
      await updateCell(sheets, cfg.sheetId, "Gastos", 17, 7, after);
      out.supermercadoPersonal = { before, after };
    }

    // 3) Gastos: "Gastos varios" (zapatillas) fila23(idx22) colH(idx7) -30000
    {
      const snap = await getTabSnapshot(sheets, cfg.sheetId, "Gastos");
      const before = toNumber(snap.values[22]?.[7]);
      const after = before + 30000;
      await updateCell(sheets, cfg.sheetId, "Gastos", 22, 7, after);
      out.gastosVarios = { before, after };
    }

    // 4) Sheet compartido: Supermercado MONTO + "Andrés real" -80000 cada una
    {
      const sharedSheetId = SHARED_SHEET_ID;
      const sharedTab = SHARED_SHEET_TAB;
      let snap;
      try {
        snap = await getTabSnapshot(sheets, sharedSheetId, sharedTab);
      } catch (e) {
        out.sharedError = "no pude abrir sheet compartido con id hardcodeado: " + e.message;
        snap = null;
      }
      if (snap) {
        const headerRow = findRowIndex(snap.values, 0, "Principio del mes", { exact: false });
        const catCol = findColIndex(snap.values[headerRow] || [], "Supermercado", { exact: true });
        const montoRow = findRowIndex(snap.values, 0, "MONTO", { startRow: headerRow + 1, exact: true });
        const realRow = findRowIndex(snap.values, 0, "Andrés real", { startRow: headerRow + 1, exact: true });
        const beforeMonto = toNumber(snap.values[montoRow]?.[catCol]);
        const beforeReal = toNumber(snap.values[realRow]?.[catCol]);
        const afterMonto = beforeMonto - 80000;
        const afterReal = beforeReal - 80000;
        await updateCell(sheets, sharedSheetId, sharedTab, montoRow, catCol, afterMonto);
        await updateCell(sheets, sharedSheetId, sharedTab, realRow, catCol, afterReal);
        out.shared = { headerRow, catCol, montoRow, realRow, beforeMonto, afterMonto, beforeReal, afterReal };
      }
    }

    // 5) Tarjeta: borrar las 2 filas de prueba (Zapatillas, filaHeader130/filaDatos131, 1-indexed)
    {
      const tabsMeta = await sheets.spreadsheets.get({ spreadsheetId: cfg.sheetId, fields: "sheets.properties" });
      const tarjetaSheet = tabsMeta.data.sheets.find((s) => s.properties.title === "Tarjeta");
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: cfg.sheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: { sheetId: tarjetaSheet.properties.sheetId, dimension: "ROWS", startIndex: 129, endIndex: 131 },
              },
            },
          ],
        },
      });
      out.tarjetaRowsDeleted = "129-130 (0-indexed), filas 130-131 (1-indexed)";
    }

    res.status(200).json({ ok: true, out });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err), stack: err.stack });
  }
}
