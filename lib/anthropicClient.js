// lib/anthropicClient.js
// Wrapper server-side de la Claude Messages API. Antes esto se llamaba directo
// desde el browser SIN headers de auth (x-api-key faltante) — por eso el parseo
// con IA no funcionaba de forma confiable. Ahora corre en la serverless function,
// con la API key guardada como secreto en Vercel.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

function getApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Falta la variable de entorno ANTHROPIC_API_KEY.");
  return key;
}

export async function callClaude({ system, messages, maxTokens = 600 }) {
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude API respondió ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data.content?.find((b) => b.type === "text")?.text || "";
  return text;
}

// Extrae el primer bloque JSON de un texto que puede venir envuelto en ```json ... ```
export function parseJsonFromText(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}
