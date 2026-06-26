// api/debug-email.js
// Endpoint TEMPORAL: devuelve solo el client_email de la service account
// (necesario para que el usuario la comparta en planillas nuevas). No expone
// la private_key ni ningún otro dato sensible. Borrar apenas se use.
export default async function handler(req, res) {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      res.status(500).json({ error: "GOOGLE_SERVICE_ACCOUNT_JSON no está seteada" });
      return;
    }
    const parsed = JSON.parse(raw);
    res.status(200).json({ client_email: parsed.client_email });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
