// api/debug-sheet.js
// Endpoint TEMPORAL de diagnóstico — devuelve el snapshot crudo de un tab para poder
// inspeccionar estructura real sin pelear con la UI de Sheets. Borrar después de usarlo.
import { getSheetsClient, getTabSnapshot, resolveTabTitle, listTabs } from "../lib/googleSheets.js";
import { CONFIG } from "../shared/config.js";

export default async function handler(req, res) {
  try {
    const { usuario, tab } = req.query || {};
    if (!usuario || !CONFIG[usuario]) {
      res.status(400).json({ error: "usuario inválido" });
      return;
    }
    const cfg = CONFIG[usuario];
    const sheets = await getSheetsClient();
    const tabs = await listTabs(sheets, cfg.sheetId);
    const tabTitle = tab || (await resolveTabTitle(sheets, cfg.sheetId, cfg.personalTab));
    const snap = await getTabSnapshot(sheets, cfg.sheetId, tabTitle);

    const rows = snap.values.slice(0, 10).map((row, r) => ({
      row: r,
      hidden: snap.isRowHidden(r),
      cells: row.map((v, c) => ({ col: c, hidden: snap.isColHidden(c), v })).filter((c) => c.v !== "" && c.v !== undefined),
    }));

    res.status(200).json({ tabs, tabTitle, totalRows: snap.values.length, totalCols: Math.max(...snap.values.map((r) => r.length)), sampleRows: rows });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
