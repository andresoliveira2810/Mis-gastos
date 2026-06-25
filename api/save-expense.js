// api/save-expense.js
// Reemplaza las instrucciones en lenguaje natural + Drive MCP por escritura real
// y determinística con la Sheets API v4. Hace el dual-write: siempre escribe en la
// hoja personal del usuario, y si compartido=true (y la categoría es compartible)
// también escribe en la hoja compartida real.

import {
  getSheetsClient,
  resolveTabTitle,
  writeToPersonalGrid,
  writeSharedExpense,
  appendConsumoTarjeta,
  appendCuotas,
} from "../lib/googleSheets.js";
import { CONFIG, SHARED_SHEET_ID, SHARED_SHEET_TAB, ALL_SHARED_CATS } from "../shared/config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { usuario, compartido, parsed } = req.body || {};
    if (!usuario || !CONFIG[usuario]) {
      res.status(400).json({ error: "usuario inválido" });
      return;
    }
    if (!parsed || parsed.tipo === "desconocido") {
      res.status(400).json({ error: "nada para guardar" });
      return;
    }

    const cfg = CONFIG[usuario];
    const sheets = await getSheetsClient();

    const resultado = { personal: null, personalError: null, tarjeta: null, tarjetaError: null, shared: null, sharedError: null };

    // ── 1. Sheet personal: grilla categoría x mes ──
    try {
      const personalTab = await resolveTabTitle(sheets, cfg.sheetId, cfg.personalTab);
      resultado.personal = await writeToPersonalGrid(sheets, cfg.sheetId, personalTab, {
        categoria: parsed.categoria,
        monto: parsed.monto,
        mesNombre: parsed.mes,
        anio: parsed.anio,
        headerRowIdx: cfg.personalHeaderRow,
        catColIdx: cfg.personalCatCol,
      });
    } catch (err) {
      resultado.personalError = err.message;
    }

    // ── 2. Tab Tarjeta: consumos / cuotas (best-effort, no todos los sheets lo tienen) ──
    if (parsed.tipo === "tarjeta_consumo" || parsed.tipo === "tarjeta_cuotas") {
      try {
        const tarjetaTab = cfg.tarjetaTab ? await resolveTabTitle(sheets, cfg.sheetId, cfg.tarjetaTab) : null;
        if (!tarjetaTab) {
          resultado.tarjetaError = "Este sheet todavía no tiene una pestaña de Tarjeta — se omitió esa parte.";
        } else if (parsed.tipo === "tarjeta_consumo") {
          resultado.tarjeta = await appendConsumoTarjeta(sheets, cfg.sheetId, tarjetaTab, {
            fecha: parsed.fecha_compra || "",
            tarjeta: parsed.tarjeta || "",
            detalle: parsed.detalle || "",
            monto: parsed.monto,
            mesObjetivo: new Date().getMonth() + 1,
            anioObjetivo: parsed.anio || new Date().getFullYear(),
          });
        } else {
          resultado.tarjeta = await appendCuotas(sheets, cfg.sheetId, tarjetaTab, {
            detalle: parsed.detalle || "",
            tarjeta: parsed.tarjeta || "",
            montoTotal: parsed.monto,
            cantidadCuotas: parsed.cuotas,
            montoPorCuota: parsed.monto_por_cuota,
            fechaCompra: parsed.fecha_compra,
          });
        }
      } catch (err) {
        resultado.tarjetaError = err.message;
      }
    }

    // ── 3. Sheet compartido (si corresponde) ──
    if (compartido && ALL_SHARED_CATS.includes(parsed.categoria)) {
      try {
        resultado.shared = await writeSharedExpense(sheets, SHARED_SHEET_ID, SHARED_SHEET_TAB, {
          categoria: parsed.categoria,
          monto: parsed.monto,
          usuarioKey: usuario,
        });
      } catch (err) {
        resultado.sharedError = err.message;
      }
    }

    const personalOk = !!resultado.personal && !resultado.personalError;
    const sharedRequested = compartido && ALL_SHARED_CATS.includes(parsed.categoria);
    const sharedOk = !sharedRequested || (!!resultado.shared && !resultado.sharedError);

    let estado = "ok";
    if (!personalOk) estado = "error";
    else if (!sharedOk) estado = "partial";

    res.status(200).json({ estado, ...resultado });
  } catch (err) {
    res.status(500).json({ estado: "error", error: err.message || "Error guardando el gasto" });
  }
}
