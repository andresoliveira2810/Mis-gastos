// api/parse-expense.js
// Recibe { usuario, texto } y devuelve el gasto/ingreso parseado como JSON.
// Usa Gemini (capa gratuita) en vez de Claude — ver lib/geminiClient.js.

import { callGemini, parseJsonFromText } from "../lib/geminiClient.js";
import { CONFIG, CATEGORIES_ANDRES, CATEGORIES_CLARITA, ALL_SHARED_CATS, getNowMesAnio } from "../shared/config.js";

const ESQUEMA_GASTO = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: ["gasto", "ingreso", "tarjeta_consumo", "tarjeta_cuotas", "desconocido"] },
    categoria: { type: "string" },
    monto: { type: "number" },
    mes: { type: "string" },
    anio: { type: "integer" },
    detalle: { type: "string", nullable: true },
    tarjeta: { type: "string", nullable: true },
    cuotas: { type: "integer", nullable: true },
    monto_por_cuota: { type: "number", nullable: true },
    fecha_compra: { type: "string", nullable: true },
    puede_ser_compartido: { type: "boolean" },
    resumen: { type: "string" },
  },
  required: ["tipo", "categoria", "monto", "mes", "anio", "puede_ser_compartido", "resumen"],
};

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

    const text = await callGemini({
      system: buildPrompt(usuario),
      parts: [{ text: String(texto).trim() }],
      schema: ESQUEMA_GASTO,
      maxOutputTokens: 600,
    });

    const result = parseJsonFromText(text);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Error parseando el gasto" });
  }
}
