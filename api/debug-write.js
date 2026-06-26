// api/debug-write.js
// Endpoint TEMPORAL: escribe un valor directo en una celda de cualquier sheetId/tab, sin
// depender de CONFIG. Se usa SOLO para revertir escrituras de prueba hechas durante testing
// en vivo del nuevo bloque "Variables". Borrar apenas se termine de usar.
import { getSheetsClient, updateCell } from "../lib/googleSheets.js";

export default async function handler(req, res) {
  try {
    const { sheetId, tab, row, col, value } = req.query || {};
    if (!sheetId || !tab || row === undefined || col === undefined) {
      res.status(400).json({ error: "faltan sheetId, tab, row y/o col" });
      return;
    }
    const sheets = await getSheetsClient();
    let v = "";
    if (value !== undefined && value !== "") {
      v = isNaN(Number(value)) ? value : Number(value);
    }
    await updateCell(sheets, sheetId, tab, parseInt(row, 10), parseInt(col, 10), v);
    res.status(200).json({ ok: true, row: parseInt(row, 10), col: parseInt(col, 10), value: v });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
