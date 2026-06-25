// lib/geminiClient.js
// Wrapper server-side de la Gemini API (Google AI Studio, capa gratuita — $0,
// sin tarjeta). Reemplaza a lib/anthropicClient.js: la app no puede depender de
// una API paga (Claude). Corre en la serverless function de Vercel, con la key
// guardada como variable de entorno secreta (GEMINI_API_KEY).

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Falta la variable de entorno GEMINI_API_KEY.");
  return key;
}

// system: instrucciones de sistema (string) o null
// parts: array de "parts" en formato Gemini, ej:
//   [{ text: "..." }]
//   [{ inlineData: { mimeType: "application/pdf", data: base64 } }, { text: "..." }]
// schema: JSON Schema opcional (Structured Outputs) para forzar la forma del JSON de salida
export async function callGemini({ system, parts, schema, maxOutputTokens = 800 }) {
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      maxOutputTokens,
      ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
    },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };

  const resp = await fetch(`${GEMINI_URL}/${MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": getApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API respondió ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) {
    throw new Error("Gemini no devolvió contenido (puede haber bloqueado la respuesta por seguridad).");
  }
  return text;
}

// Extrae el primer bloque JSON de un texto que puede venir envuelto en ```json ... ```.
// Defensivo: con responseSchema no debería hacer falta, pero por si el modelo
// agrega texto extra alrededor del JSON.
export function parseJsonFromText(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("No pude interpretar la respuesta de Gemini como JSON.");
  }
}
