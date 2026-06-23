// api/reconcile-pdf.js
// Antes el cruce de consumos del PDF se hacía solo contra el historial en memoria
// de la sesión (se perdía al recargar). Ahora cruza contra los datos REALES del
// tab "Tarjeta" del sheet personal correspondiente (Galicia VISA: 1504=Andrés, 0044=Clarita).

import { getSheetsClient, resolveTabTitle, readConsumosYCuotas, toNumber } from "../lib/googleSheets.js";
import { CONFIG, TARJETAS } from "../shared/config.js";

function usuarioPorTarjeta(tarjetaNro, nombreTitular) {
  if (tarjetaNro && TARJETAS[String(tarjetaNro)]) return TARJETAS[String(tarjetaNro)];
  // fallback por nombre si el número no matchea ningún mapeo conocido
  const n = (nombreTitular || "").toLowerCase();
  if (n.includes("oliveira") || n.includes("andres")) return "andres";
  if (n.includes("clar")) return "clarita";
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const { pdfData } = req.body || {};
    if (!pdfData || !Array.isArray(pdfData.titulares)) {
      res.status(400).json({ error: "falta pdfData" });
      return;
    }

    const sheets = await getSheetsClient();
    const cache = {}; // usuarioKey -> { consumos, cuotas } | { error }

    async function getDatosUsuario(usuarioKey) {
      if (!usuarioKey || !CONFIG[usuarioKey]) return null;
      if (cache[usuarioKey]) return cache[usuarioKey];
      const cfg = CONFIG[usuarioKey];
      try {
        if (!cfg.tarjetaTab) {
          cache[usuarioKey] = { consumos: [], cuotas: [], nota: "Este sheet no tiene tab de Tarjeta todavía." };
          return cache[usuarioKey];
        }
        const tab = await resolveTabTitle(sheets, cfg.sheetId, cfg.tarjetaTab);
        const datos = await readConsumosYCuotas(sheets, cfg.sheetId, tab);
        cache[usuarioKey] = datos;
      } catch (err) {
        cache[usuarioKey] = { consumos: [], cuotas: [], error: err.message };
      }
      return cache[usuarioKey];
    }

    const titulares = [];
    for (const t of pdfData.titulares) {
      const usuarioKey = usuarioPorTarjeta(t.tarjeta_nro, t.nombre);
      const datos = await getDatosUsuario(usuarioKey);
      const consumosSheet = datos?.consumos || [];
      const cuotasSheet = datos?.cuotas || [];

      const consumos = (t.consumos || []).map((c) => {
        const montoAbs = Math.abs(toNumber(c.monto));
        const matchConsumo = consumosSheet.some((s) => Math.abs(Math.abs(s.monto) - montoAbs) < 10);
        const descLower = (c.descripcion || "").toLowerCase().slice(0, 6);
        const matchCuota = cuotasSheet.some(
          (s) => Math.abs(Math.abs(s.montoPorCuota) - montoAbs) < 10 || (s.detalle || "").toLowerCase().includes(descLower)
        );
        return { ...c, registrado: matchConsumo || matchCuota };
      });

      titulares.push({
        ...t,
        usuarioKey, // el frontend decide esUsuario comparando con el usuario logueado
        sheetNota: datos?.nota || datos?.error || null,
        consumos,
      });
    }

    res.status(200).json({ ...pdfData, titulares });
  } catch (err) {
    res.status(500).json({ error: err.message || "Error reconciliando el PDF" });
  }
}
