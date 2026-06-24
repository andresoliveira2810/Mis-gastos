// api/parse-pdf.js
// Recibe { pdfBase64 } y devuelve los consumos extraídos del resumen de tarjeta,
// estructurados por titular. Corre server-side para no exponer la API key.
// Usa Gemini (capa gratuita, soporta PDFs nativamente) en vez de Claude.

import { callGemini, parseJsonFromText } from "../lib/geminiClient.js";

// Vercel: los PDFs en base64 pueden ser grandes, subimos el límite del body.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

const ESQUEMA_PDF = {
  type: "object",
  properties: {
    banco: { type: "string" },
    tarjeta: { type: "string" },
    periodo: { type: "string" },
    total_pagar: { type: "number" },
    titulares: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          tarjeta_nro: { type: ["string", "null"] },
          consumos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                fecha: { type: "string" },
                descripcion: { type: "string" },
                cuota: { type: ["string", "null"] },
                monto: { type: "number" },
                moneda: { type: "string" },
              },
              required: ["fecha", "descripcion", "monto"],
            },
          },
          total: { type: "number" },
        },
        required: ["nombre", "consumos", "total"],
      },
    },
  },
  required: ["banco", "tarjeta", "periodo", "total_pagar", "titulares"],
};

const PROMPT = `Extraé TODOS los consumos de este resumen de tarjeta de crédito.
Separalos por titular si hay más de uno (ej: tarjeta principal y adicional).
Ignorá impuestos, sellos, pagos anteriores y saldo anterior.
Devolvé SOLO este JSON puro sin markdown:
{
  "banco": "nombre del banco",
  "tarjeta": "VISA/Mastercard/etc",
  "periodo": "Mes Año del resumen",
  "total_pagar": 12345.67,
  "titulares": [
    {
      "nombre": "ANDRES OSC OLIVEIRA",
      "tarjeta_nro": "1504",
      "consumos": [
        {
          "fecha": "01-05-26",
          "descripcion": "YPF LAS TUNAS",
          "cuota": "02/06",
          "monto": 30000.00,
          "moneda": "ARS"
        }
      ],
      "total": 667124.39
    }
  ]
}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const { pdfBase64 } = req.body || {};
    if (!pdfBase64) {
      res.status(400).json({ error: "falta pdfBase64" });
      return;
    }

    const text = await callGemini({
      parts: [
        { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
        { text: PROMPT },
      ],
      schema: ESQUEMA_PDF,
      maxOutputTokens: 4000,
    });

    const result = parseJsonFromText(text);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Error leyendo el PDF" });
  }
}
