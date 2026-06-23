// api/parse-expense.js
// Reemplaza el fetch directo (sin auth) que hacía el browser a la Claude API.
// Recibe { usuario, texto } y devuelve el gasto/ingreso parseado como JSON.

import { callClaude, parseJsonFromText } from "../lib/anthropicClient.js";
import { CONFIG, CATEGORIES_ANDRES, CATEGORIES_CLARITA, ALL_SHARED_CATS, getNowMesAnio } from "../shared/config.js";

function buildPrompt(usuario) {
  const cats = usuario === "andres" ? CATEGORIES_ANDRES : CATEGORIES_CLARITA;
  const nombre = CONFIG[usuario].nombre;
  const { mes, anio } = getNowMesAnio();
  return `Sos un asistente de finanzas de ${nombre} (argentino/a). Interpretás lo que dice y devolvés JSON puro, sin markdown.

Categorías personales disponibles: ${cats.join(", ")}
Categorías que pueden ser compartidas: ${ALL_SHARED_CATS.join(", ")}
Mes actual: ${mes} ${anio}

Devolvé SOLO este JSON:
{
  "tipo": "gasto" | "ingreso" | "tarjeta_consumo" | "tarjeta_cuotas" | "desconocido",
  "categoria": "nombre exacto de la lista",
  "monto": 12345.67,
  "mes": "${mes}",
  "anio": ${anio},
  "detalle": "descripción breve o null",
  "tarjeta": "nombre o null",
  "cuotas": null o número entero,
  "monto_por_cuota": null o número,
  "fecha_compra": null o "DD/MM/YYYY",
  "puede_ser_compartido": true o false,
  "resumen": "una frase corta, ej: Supermercado por $80.000"
}

Reglas:
- gastos → monto NEGATIVO. ingresos → POSITIVO.
- "puede_ser_compartido": true si la categoría está en: ${ALL_SHARED_CATS.join(", ")}
- Si no mencionan mes → usá ${mes}
- resumen: muy corto, sin el mes`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const { usuario, texto } = req.body || {};
    if (!usuario || !CONFIG[usuario]) {
      res.status(400).json({ error: "usuario inválido" });
      return;
    }
    if (!texto || !String(texto).trim()) {
      res.status(400).json({ error: "texto vacío" });
      return;
    }

    const text = await callClaude({
      system: buildPrompt(usuario),
      messages: [{ role: "user", content: String(texto).trim() }],
      maxTokens: 600,
    });

    const result = parseJsonFromText(text);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Error parseando el gasto" });
  }
}
