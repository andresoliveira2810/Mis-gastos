// api/debug-inspect.js
// Endpoint TEMPORAL: inspecciona cualquier sheetId/tab pasado por query, sin depender
// de CONFIG. Se usa para mapear la estructura de la planilla nueva de Andrés antes de
// adaptar el código. Borrar apenas se termine de usar.
import { getSheetsClient, getTabSnapshot, listTabs } from "../lib/googleSheets.js";

export default async function handler(req, res) {
  try {
    const { sheetId, tab, rowStart, rowEnd, colStart, colEnd } = req.query || {};
    if (!sheetId || !tab) {
      res.status(400).json({ error: "faltan sheetId y/o tab" });
      return;
    }
    const sheets = await getSheetsClient();
    const tabs = await listTabs(sheets, sheetId);
    const snap = await getTabSnapshot(sheets, sheetId, tab);

    const rStart = rowStart !== undefined ? parseInt(rowStart, 10) : 0;
    const rEnd = rowEnd !== undefined ? parseInt(rowEnd, 10) : 30;
    const cStart = colStart !== undefined ? parseInt(colStart, 10) : 0;
    const cEnd = colEnd !== undefined ? parseInt(colEnd, 10) : 30;

    const rows = snap.values.slice(rStart, rEnd).map((row, i) => {
      const r = rStart + i;
      return {
        row: r,
        hidden: snap.isRowHidden(r),
        cells: row
          .slice(cStart, cEnd)
          .map((v, ci) => ({ col: cStart + ci, hidden: snap.isColHidden(cStart + ci), v }))
          .filter((c) => c.v !== "" && c.v !== undefined),
      };
    });

    res.status(200).json({
      tabs,
      totalRows: snap.values.length,
      totalCols: Math.max(...snap.values.map((r) => r.length)),
      sampleRows: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
