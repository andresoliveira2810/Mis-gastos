import { useState, useRef, useEffect, useCallback } from "react";
import { SHARED_SHEET_ID, getNowMesAnio } from "../shared/config.js";

// ─── CONFIG ────────────────────────────────────────────────────────────────
// Los IDs de sheet y categorías viven en shared/config.js (se comparten con las
// serverless functions de /api). Acá solo queda el tema visual de cada usuario.
const CONFIG = {
  andres: {
    nombre: "Andrés",
    sheetId: "1Rn-nS8uGYMxhmvi9XK3z39sj1VO1F8XKOqe-eRetgmc",
    color: "#22c55e", colorDeep: "#16a34a",
    colorDark: "#080c09", colorSurface: "#0f1a11",
    colorCard: "#131f15", colorBorder: "#1c2e1f",
    colorText: "#e2f5e6", colorMuted: "#4a7a52",
    colorAccent: "#86efac", colorDim: "#1e3322",
    avatar: "A",
  },
  clarita: {
    nombre: "Clarita",
    sheetId: "12pbyZQoizcscAVw0-QmHFNyJSPusxqnV73ylkGHYm9w",
    color: "#a855f7", colorDeep: "#9333ea",
    colorDark: "#09080d", colorSurface: "#130f1a",
    colorCard: "#1a1323", colorBorder: "#2a1d3e",
    colorText: "#ede9fe", colorMuted: "#7c5fa0",
    colorAccent: "#c4b5fd", colorDim: "#2a1d3e",
    avatar: "C",
  },
};

// ─── ICONS ─────────────────────────────────────────────────────────────────
const Icons = {
  mic: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>,
  stop: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>,
  send: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  history: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  link: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  pdf: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
};

// ─── ERROR MESSAGES ────────────────────────────────────────────────────────
// Traduce los códigos de error "fail loudly" de lib/googleSheets.js a algo
// legible. Si no reconoce el código, muestra el mensaje crudo igual.
function friendlyError(msg) {
  if (!msg) return null;
  if (msg.includes("MONTH_COLUMN_NOT_VISIBLE")) return "La columna del mes actual está oculta en la planilla — desocultala en Google Sheets para poder guardar ahí.";
  if (msg.includes("CATEGORY_NOT_FOUND")) return "No encontré esa categoría en la planilla (puede estar oculta o con otro nombre).";
  if (msg.includes("CONSUMO_TABLE_NOT_FOUND")) return "No encontré la tabla de consumos en la pestaña Tarjeta.";
  return msg;
}

// ─── SPEECH HOOK ───────────────────────────────────────────────────────────
function useSpeech(onResult) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.lang = "es-AR";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => { onResult(e.results[0][0].transcript); setRecording(false); };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    recRef.current = rec;
  }, [onResult]);

  const toggle = useCallback(() => {
    if (!recRef.current) return;
    if (recording) { recRef.current.stop(); setRecording(false); }
    else { recRef.current.start(); setRecording(true); }
  }, [recording]);

  return { recording, supported, toggle };
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("login");
  const [usuario, setUsuario] = useState(null);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [compartido, setCompartido] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [saveDetail, setSaveDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const { mes: NOW_MONTH, anio: NOW_YEAR } = getNowMesAnio();
  // PDF reconciliation
  const [pdfData, setPdfData] = useState(null);       // parsed consumos from PDF
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const pdfInputRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  const cfg = usuario ? CONFIG[usuario] : CONFIG.andres;
  const otroNombre = usuario === "andres" ? "Clarita" : "Andrés";
  const otroCfg = usuario === "andres" ? CONFIG.clarita : CONFIG.andres;

  const onVoiceResult = useCallback((text) => {
    setInput(text);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);
  const speech = useSpeech(onVoiceResult);

  useEffect(() => {
    if (screen === "main") setTimeout(() => textareaRef.current?.focus(), 200);
  }, [screen]);

  // ── Login ──
  const login = (u) => { setUsuario(u); setScreen("main"); };

  // ── Interpret ──
  const handleSubmit = async () => {
    if (!input.trim() || processing) return;
    setProcessing(true);
    try {
      const resp = await fetch("/api/parse-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, texto: input.trim() }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "error parseando");
      setParsed(result);
      setCompartido(false);
      setSaveResult(null);
      setSaveDetail(null);
      setScreen("confirm");
    } catch {
      setParsed({ tipo: "desconocido", resumen: "No pude entender. Intentá de nuevo." });
      setScreen("confirm");
    }
    setProcessing(false);
  };

  // ── Save ──
  // Llama a /api/save-expense, que hace el dual-write real (sheet personal + sheet
  // compartido si corresponde) con la Sheets API v4 — ya no usa instrucciones en
  // lenguaje natural ni el Drive MCP.
  const handleSave = async () => {
    if (!parsed || parsed.tipo === "desconocido") return;
    setSaving(true);
    try {
      const resp = await fetch("/api/save-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, compartido, parsed }),
      });
      const data = await resp.json();
      setSaveResult(data.estado || "error");
      setSaveDetail(data);
      if (data.estado === "ok" || data.estado === "partial") {
        setHistory(prev => [{
          ...parsed, compartido, id: Date.now(),
          hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
        }, ...prev].slice(0, 50));
      }
    } catch (err) {
      setSaveResult("error");
      setSaveDetail({ error: err.message });
    }
    setSaving(false);
  };

  const handleBack = () => { setScreen("main"); setSaveResult(null); };
  const handleNew = () => { setScreen("main"); setInput(""); setParsed(null); setSaveResult(null); setCompartido(false); };

  // ══════════════════════════════════════════════
  // RENDER: LOGIN
  // ══════════════════════════════════════════════
  if (screen === "login") return (
    <div style={{ minHeight: "100vh", background: "#07090a", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ marginBottom: 52, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>💸</div>
        <div style={{ color: "#f0fdf4", fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em" }}>Mis Gastos</div>
        <div style={{ color: "#374151", fontSize: 14, marginTop: 6 }}>¿Quién sos?</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 300 }}>
        {Object.entries(CONFIG).map(([key, c]) => (
          <button key={key} onClick={() => login(key)} style={{
            width: "100%", padding: "18px 22px", background: c.colorSurface,
            border: `1.5px solid ${c.colorBorder}`, borderRadius: 18, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 16, transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = c.color; e.currentTarget.style.background = c.colorCard; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = c.colorBorder; e.currentTarget.style.background = c.colorSurface; }}
          >
            <div style={{ width: 46, height: 46, borderRadius: 14, background: c.color + "25", border: `1px solid ${c.color}50`, color: c.color, fontSize: 20, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.avatar}</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: c.colorText, fontWeight: 600, fontSize: 16 }}>{c.nombre}</div>
              <div style={{ color: c.colorMuted, fontSize: 12, marginTop: 2 }}>Mis gastos personales</div>
            </div>
            <div style={{ marginLeft: "auto", color: c.colorMuted, fontSize: 22 }}>›</div>
          </button>
        ))}
      </div>
    </div>
  );

  // ── PDF: read & parse ──
  // 1) /api/parse-pdf extrae los consumos del PDF (Claude server-side).
  // 2) /api/reconcile-pdf cruza esos consumos contra los datos REALES del tab
  //    Tarjeta de cada titular (Sheets API), no contra el historial en memoria.
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfLoading(true);
    setPdfError(null);
    setPdfData(null);

    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });

      const parseResp = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64 }),
      });
      const parsedPdf = await parseResp.json();
      if (!parseResp.ok) throw new Error(parsedPdf.error || "error leyendo el PDF");

      const reconcileResp = await fetch("/api/reconcile-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfData: parsedPdf }),
      });
      const result = await reconcileResp.json();
      if (!reconcileResp.ok) throw new Error(result.error || "error cruzando el PDF");

      setPdfData(result);
      setScreen("pdf");
    } catch (err) {
      setPdfError("No pude leer el PDF. Intentá de nuevo.");
    }
    setPdfLoading(false);
    e.target.value = "";
  };

  // ══════════════════════════════════════════════
  // RENDER: PDF
  // ══════════════════════════════════════════════
  if (screen === "pdf" && pdfData) {
    // El server ya no decide esUsuario (no sabe quién está logueado) — lo
    // calculamos acá comparando usuarioKey contra el usuario actual.
    const totalConsumosAndres = pdfData.titulares.filter(t => t.usuarioKey === usuario).reduce((s, t) => s + t.total, 0);
    const totalConsumosOtro = pdfData.titulares.filter(t => t.usuarioKey !== usuario).reduce((s, t) => s + t.total, 0);
    const todosLosConsumos = pdfData.titulares.flatMap(t =>
      t.consumos.map(c => ({ ...c, titular: t.nombre, esUsuario: t.usuarioKey === usuario }))
    );
    const sinRegistrar = todosLosConsumos.filter(c => !c.registrado);
    const registrados = todosLosConsumos.filter(c => c.registrado);

    return (
      <div style={{ minHeight: "100vh", background: cfg.colorDark, fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${cfg.colorBorder}`, display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, background: cfg.colorDark, zIndex: 10 }}>
          <button onClick={() => setScreen("main")} style={{ background: "none", border: "none", color: cfg.colorMuted, cursor: "pointer", padding: 4, display: "flex" }}>{Icons.back}</button>
          <div>
            <div style={{ color: cfg.colorText, fontWeight: 600, fontSize: 15 }}>Resumen {pdfData.banco} · {pdfData.tarjeta}</div>
            <div style={{ color: cfg.colorMuted, fontSize: 11, marginTop: 2 }}>{pdfData.periodo}</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 32px" }}>

          {/* Totales por titular */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {pdfData.titulares.map(t => {
              const esUsuario = t.usuarioKey === usuario;
              return (
                <div key={t.nombre} style={{ flex: 1, background: cfg.colorCard, border: `1px solid ${cfg.colorBorder}`, borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ color: cfg.colorMuted, fontSize: 11, marginBottom: 4 }}>{esUsuario ? cfg.nombre : otroNombre}</div>
                  <div style={{ color: esUsuario ? cfg.colorAccent : otroCfg.colorAccent, fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                    ${t.total.toLocaleString("es-AR")}
                  </div>
                  <div style={{ color: cfg.colorDim, fontSize: 11, marginTop: 3 }}>{t.consumos.length} consumos</div>
                  {t.sheetNota && <div style={{ color: "#fbbf24", fontSize: 10, marginTop: 3 }}>{t.sheetNota}</div>}
                </div>
              );
            })}
            <div style={{ flex: 1, background: "#ef444415", border: "1px solid #ef444430", borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ color: "#f87171", fontSize: 11, marginBottom: 4 }}>Total a pagar</div>
              <div style={{ color: "#f87171", fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                ${pdfData.total_pagar.toLocaleString("es-AR")}
              </div>
            </div>
          </div>

          {/* Sin registrar */}
          {sinRegistrar.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Sin registrar ({sinRegistrar.length})
                </span>
              </div>
              {sinRegistrar.map((c, i) => (
                <div key={i} style={{ background: "#f59e0b0a", border: "1px solid #f59e0b25", borderRadius: 12, padding: "11px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: cfg.colorText, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.descripcion}
                      {c.cuota && <span style={{ color: cfg.colorMuted, fontSize: 11, marginLeft: 6 }}>{c.cuota}</span>}
                    </div>
                    <div style={{ color: cfg.colorMuted, fontSize: 11, marginTop: 2 }}>
                      {c.fecha} · {c.esUsuario ? cfg.nombre : otroNombre}
                    </div>
                  </div>
                  <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    ${c.monto.toLocaleString("es-AR")}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Registrados */}
          {registrados.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Ya registrados ({registrados.length})
                </span>
              </div>
              {registrados.map((c, i) => (
                <div key={i} style={{ background: "#22c55e08", border: "1px solid #22c55e20", borderRadius: 12, padding: "11px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, opacity: 0.7 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: cfg.colorText, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      ✓ {c.descripcion}
                      {c.cuota && <span style={{ color: cfg.colorMuted, fontSize: 11, marginLeft: 6 }}>{c.cuota}</span>}
                    </div>
                    <div style={{ color: cfg.colorMuted, fontSize: 11, marginTop: 2 }}>
                      {c.fecha} · {c.esUsuario ? cfg.nombre : otroNombre}
                    </div>
                  </div>
                  <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    ${c.monto.toLocaleString("es-AR")}
                  </div>
                </div>
              ))}
            </div>
          )}

          {sinRegistrar.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#4ade80" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Todo registrado</div>
              <div style={{ color: cfg.colorMuted, fontSize: 13, marginTop: 6 }}>Todos los consumos del resumen ya están en tu planilla.</div>
            </div>
          )}
        </div>

        {/* Footer: subir otro */}
        <div style={{ padding: "12px 16px 32px", borderTop: `1px solid ${cfg.colorBorder}` }}>
          <button onClick={() => pdfInputRef.current?.click()} style={{ width: "100%", padding: 14, background: cfg.colorCard, border: `1px solid ${cfg.colorBorder}`, borderRadius: 14, color: cfg.colorMuted, fontSize: 13, cursor: "pointer" }}>
            Subir otro PDF
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // RENDER: HISTORY
  // ══════════════════════════════════════════════
  if (screen === "history") return (
    <div style={{ minHeight: "100vh", background: cfg.colorDark, fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${cfg.colorBorder}`, display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, background: cfg.colorDark, zIndex: 10 }}>
        <button onClick={() => setScreen("main")} style={{ background: "none", border: "none", color: cfg.colorMuted, cursor: "pointer", padding: 4, display: "flex" }}>{Icons.back}</button>
        <span style={{ color: cfg.colorText, fontWeight: 600, fontSize: 16 }}>Historial — {NOW_MONTH}</span>
      </div>
      <div style={{ padding: 16 }}>
        {history.length === 0 ? (
          <div style={{ textAlign: "center", color: cfg.colorMuted, marginTop: 80, fontSize: 14 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
            Todavía no hay registros
          </div>
        ) : history.map(h => (
          <div key={h.id} style={{ background: cfg.colorCard, border: `1px solid ${cfg.colorBorder}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: cfg.colorText, fontSize: 14, fontWeight: 600 }}>{h.categoria}</span>
              <span style={{ color: h.monto < 0 ? "#f87171" : "#4ade80", fontWeight: 700, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>
                {h.monto < 0 ? "-" : "+"}${Math.abs(h.monto).toLocaleString("es-AR")}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, alignItems: "center" }}>
              <span style={{ color: cfg.colorMuted, fontSize: 12 }}>{h.mes} · {h.hora}</span>
              {h.compartido && <span style={{ color: "#c4b5fd", fontSize: 11, background: "#7c3aed22", padding: "2px 8px", borderRadius: 20 }}>🤝 compartido</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════
  // RENDER: CONFIRM
  // ══════════════════════════════════════════════
  if (screen === "confirm") return (
    <div style={{ minHeight: "100vh", background: cfg.colorDark, fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${cfg.colorBorder}`, display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={handleBack} style={{ background: "none", border: "none", color: cfg.colorMuted, cursor: "pointer", padding: 4, display: "flex" }}>{Icons.back}</button>
        <span style={{ color: cfg.colorText, fontWeight: 600, fontSize: 16 }}>Confirmar</span>
      </div>

      <div style={{ flex: 1, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>

        {parsed && parsed.tipo !== "desconocido" ? (<>

          {/* Monto card */}
          <div style={{ background: cfg.colorCard, border: `1px solid ${cfg.colorBorder}`, borderRadius: 22, padding: "24px 22px" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ color: cfg.colorMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{parsed.mes} {parsed.anio}</div>
              <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.04em", color: parsed.monto < 0 ? "#f87171" : "#4ade80", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {parsed.monto < 0 ? "-" : "+"}${Math.abs(parsed.monto).toLocaleString("es-AR")}
              </div>
              <div style={{ marginTop: 10, color: cfg.colorMuted, fontSize: 13 }}>{parsed.resumen}</div>
            </div>
            {[
              ["Categoría", parsed.categoria],
              parsed.detalle ? ["Detalle", parsed.detalle] : null,
              parsed.tarjeta ? ["Tarjeta", parsed.tarjeta] : null,
              parsed.cuotas ? ["Cuotas", `${parsed.cuotas}x $${Number(parsed.monto_por_cuota).toLocaleString("es-AR")}`] : null,
            ].filter(Boolean).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderTop: `1px solid ${cfg.colorBorder}` }}>
                <span style={{ color: cfg.colorMuted, fontSize: 13 }}>{k}</span>
                <span style={{ color: cfg.colorAccent, fontSize: 13, fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* ── TOGGLE COMPARTIDO ── */}
          {parsed.puede_ser_compartido && (
            <button
              onClick={() => setCompartido(c => !c)}
              style={{
                width: "100%", padding: "0",
                background: "transparent", border: "none", cursor: "pointer",
              }}
            >
              <div style={{
                background: compartido ? otroCfg.colorSurface : cfg.colorCard,
                border: `2px solid ${compartido ? otroCfg.color : cfg.colorBorder}`,
                borderRadius: 18, padding: "16px 18px",
                display: "flex", alignItems: "center", gap: 14,
                transition: "all 0.2s",
              }}>
                {/* Avatar del otro */}
                <div style={{
                  width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                  background: compartido ? otroCfg.color + "25" : cfg.colorBorder + "80",
                  border: `1.5px solid ${compartido ? otroCfg.color + "60" : cfg.colorBorder}`,
                  color: compartido ? otroCfg.color : cfg.colorMuted,
                  fontSize: 20, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                }}>{otroCfg.avatar}</div>

                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ color: compartido ? otroCfg.colorText : cfg.colorText, fontWeight: 600, fontSize: 14, transition: "color 0.2s" }}>
                    Compartido con {otroNombre}
                  </div>
                  <div style={{ color: compartido ? otroCfg.colorMuted : cfg.colorMuted, fontSize: 12, marginTop: 3, transition: "color 0.2s" }}>
                    {compartido
                      ? `Se suma a la planilla compartida (fila "${cfg.nombre} real")`
                      : "Tocá para marcar como gasto en común"}
                  </div>
                </div>

                {/* Toggle pill */}
                <div style={{
                  width: 50, height: 28, borderRadius: 14, flexShrink: 0,
                  background: compartido ? otroCfg.color : cfg.colorBorder,
                  position: "relative", transition: "background 0.2s",
                }}>
                  <div style={{
                    position: "absolute", top: 4, left: compartido ? 26 : 4,
                    width: 20, height: 20, borderRadius: "50%",
                    background: "#fff", transition: "left 0.2s",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  }} />
                </div>
              </div>
            </button>
          )}

          {/* Resultado */}
          {saveResult === "ok" && (
            <div style={{ background: "#16a34a20", border: "1px solid #16a34a50", borderRadius: 14, padding: "14px 18px" }}>
              <div style={{ color: "#4ade80", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>✅ Guardado</div>
              <div style={{ color: "#86efac", fontSize: 13 }}>
                {compartido
                  ? `Registrado en tu planilla personal y en la planilla compartida con ${otroNombre}.`
                  : "Registrado en tu planilla personal."}
              </div>
              {saveDetail?.tarjetaError && (
                <div style={{ color: "#fcd34d", fontSize: 12, marginTop: 6 }}>ℹ️ {friendlyError(saveDetail.tarjetaError)}</div>
              )}
            </div>
          )}
          {saveResult === "partial" && (
            <div style={{ background: "#f59e0b20", border: "1px solid #f59e0b50", borderRadius: 14, padding: "14px 18px" }}>
              <div style={{ color: "#fbbf24", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>⚠️ Guardado parcialmente</div>
              <div style={{ color: "#fcd34d", fontSize: 13 }}>Se guardó en la planilla personal pero hubo un problema con la planilla compartida. Revisala manualmente.</div>
              {saveDetail?.sharedError && (
                <div style={{ color: "#fcd34d", fontSize: 12, marginTop: 6 }}>{friendlyError(saveDetail.sharedError)}</div>
              )}
              {saveDetail?.tarjetaError && (
                <div style={{ color: "#fcd34d", fontSize: 12, marginTop: 6 }}>ℹ️ {friendlyError(saveDetail.tarjetaError)}</div>
              )}
            </div>
          )}
          {saveResult === "error" && (
            <div style={{ background: "#ef444420", border: "1px solid #ef444450", borderRadius: 14, padding: "14px 18px" }}>
              <div style={{ color: "#f87171", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>⚠️ No se pudo guardar automáticamente</div>
              {saveDetail?.personalError && (
                <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 6 }}>{friendlyError(saveDetail.personalError)}</div>
              )}
              {saveDetail?.error && !saveDetail?.personalError && (
                <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 6 }}>{friendlyError(saveDetail.error)}</div>
              )}
              <div style={{ color: "#fca5a5", fontSize: 12 }}>Cargalo a mano: {parsed.categoria} · ${Math.abs(parsed.monto).toLocaleString("es-AR")} · {parsed.mes}</div>
            </div>
          )}

        </>) : (
          /* No entendió */
          <div style={{ background: cfg.colorCard, border: `1px solid ${cfg.colorBorder}`, borderRadius: 20, padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🤔</div>
            <div style={{ color: cfg.colorText, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No entendí bien</div>
            <div style={{ color: cfg.colorMuted, fontSize: 13, lineHeight: 1.6 }}>{parsed?.resumen || "Intentá ser más específico, ej: \"gasté 50000 en supermercado\""}</div>
          </div>
        )}
      </div>

      {/* Botones */}
      <div style={{ padding: "14px 18px 36px", borderTop: `1px solid ${cfg.colorBorder}`, display: "flex", gap: 10 }}>
        {saveResult === "ok" ? (
          <button onClick={handleNew} style={{ flex: 1, padding: 16, background: cfg.color, color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            + Nuevo gasto
          </button>
        ) : parsed && parsed.tipo !== "desconocido" ? (<>
          <button onClick={handleBack} style={{ padding: "16px 18px", background: cfg.colorCard, color: cfg.colorMuted, border: `1px solid ${cfg.colorBorder}`, borderRadius: 14, fontSize: 14, cursor: "pointer" }}>
            Editar
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: 16,
            background: saving ? cfg.colorDim : cfg.color,
            color: saving ? cfg.colorMuted : "#fff",
            border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700,
            cursor: saving ? "default" : "pointer", transition: "all 0.2s",
          }}>
            {saving ? "Guardando…" : compartido ? `Guardar · compartido ✓` : "Guardar"}
          </button>
        </>) : (
          <button onClick={handleBack} style={{ flex: 1, padding: 16, background: cfg.color, color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Volver e intentar de nuevo
          </button>
        )}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════
  // RENDER: MAIN
  // ══════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: cfg.colorDark, fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: cfg.color + "22", border: `1px solid ${cfg.color}44`, color: cfg.color, fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{cfg.avatar}</div>
          <div>
            <div style={{ color: cfg.colorText, fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}>{cfg.nombre}</div>
            <div style={{ color: cfg.colorMuted, fontSize: 12 }}>{NOW_MONTH} {NOW_YEAR}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setScreen("history")} style={{ background: cfg.colorSurface, border: `1px solid ${cfg.colorBorder}`, borderRadius: 10, padding: "7px 11px", color: cfg.colorMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            {Icons.history} {history.length}
          </button>
          <button onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading} style={{ background: pdfLoading ? cfg.colorDim : cfg.colorSurface, border: `1px solid ${cfg.colorBorder}`, borderRadius: 10, padding: "7px 11px", color: pdfLoading ? cfg.colorMuted : cfg.colorAccent, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            {Icons.pdf} {pdfLoading ? "..." : "PDF"}
          </button>
          <input ref={pdfInputRef} type="file" accept="application/pdf" onChange={handlePdfUpload} style={{ display: "none" }} />
          <a href={`https://docs.google.com/spreadsheets/d/${cfg.sheetId}`} target="_blank" rel="noopener noreferrer"
            style={{ background: cfg.colorSurface, border: `1px solid ${cfg.colorBorder}`, borderRadius: 10, padding: "7px 11px", color: cfg.colorMuted, textDecoration: "none", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            {Icons.link} Sheet
          </a>
          <button onClick={() => { setUsuario(null); setScreen("login"); }} style={{ background: "none", border: "none", color: cfg.colorDim, cursor: "pointer", fontSize: 22, padding: "2px 6px" }}>⇄</button>
        </div>
      </div>

      {/* Title */}
      <div style={{ padding: "28px 20px 0", textAlign: "center" }}>
        <div style={{ color: cfg.colorText, fontSize: 24, fontWeight: 800, letterSpacing: "-0.04em" }}>¿Qué gastaste?</div>
        <div style={{ color: cfg.colorMuted, fontSize: 13, marginTop: 6 }}>Escribí o grabá un audio</div>
      </div>

      {/* Input */}
      <div style={{ padding: "18px 18px 0" }}>
        <div style={{ background: cfg.colorSurface, border: `1.5px solid ${cfg.colorBorder}`, borderRadius: 22, overflow: "hidden" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder={`"gasté 80000 en super" · "alquiler 750000" · "zapatillas 3 cuotas de 30000"`}
            rows={3}
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              color: cfg.colorText, fontSize: 15, lineHeight: 1.65, resize: "none",
              fontFamily: "inherit", caretColor: cfg.color,
              padding: "16px 18px 8px", minHeight: 86, maxHeight: 160,
            }}
          />
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px 12px" }}>
            {speech.supported ? (
              <button onClick={speech.toggle} style={{
                width: 44, height: 44, borderRadius: 12, border: "none", cursor: "pointer",
                background: speech.recording ? "#ef4444" : cfg.colorCard,
                color: speech.recording ? "#fff" : cfg.colorMuted,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
                boxShadow: speech.recording ? "0 0 0 5px #ef444430" : "none",
              }}>{speech.recording ? Icons.stop : Icons.mic}</button>
            ) : <div />}
            <button onClick={handleSubmit} disabled={!input.trim() || processing} style={{
              height: 44, padding: "0 20px", borderRadius: 12, border: "none",
              background: input.trim() && !processing ? cfg.color : cfg.colorDim,
              color: input.trim() && !processing ? "#fff" : cfg.colorMuted,
              fontSize: 14, fontWeight: 700, cursor: input.trim() && !processing ? "pointer" : "default",
              display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s",
            }}>
              {processing
                ? <><span style={{ display: "inline-block", animation: "spin 0.8s linear infinite" }}>⟳</span> Procesando…</>
                : <>{Icons.send} Continuar</>}
            </button>
          </div>
        </div>
      </div>

      {/* Recording indicator */}
      {speech.recording && (
        <div style={{ margin: "12px 18px 0", background: "#ef444418", border: "1px solid #ef444440", borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s ease-in-out infinite", flexShrink: 0 }} />
          <span style={{ color: "#f87171", fontSize: 13, fontWeight: 500 }}>Grabando… contá tu gasto</span>
        </div>
      )}

      {/* Sugerencias */}
      <div style={{ padding: "18px 18px 0" }}>
        <div style={{ color: cfg.colorDim, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, fontWeight: 600 }}>Ejemplos</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {["gasté 80000 en super", "alquiler 750000", "peluquería 18000", "60000 de nafta", "zapatillas 3 cuotas 30000", "cobré el sueldo"].map(s => (
            <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }} style={{
              padding: "6px 13px", background: cfg.colorSurface,
              border: `1px solid ${cfg.colorBorder}`, borderRadius: 20,
              color: cfg.colorAccent, fontSize: 12, cursor: "pointer", transition: "border-color 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = cfg.color}
              onMouseLeave={e => e.currentTarget.style.borderColor = cfg.colorBorder}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Último registro */}
      {history.length > 0 && (
        <div style={{ padding: "18px 18px 0" }}>
          <div style={{ color: cfg.colorDim, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, fontWeight: 600 }}>Último registro</div>
          <div style={{ background: cfg.colorSurface, border: `1px solid ${cfg.colorBorder}`, borderRadius: 14, padding: "13px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: cfg.colorText, fontSize: 14, fontWeight: 600 }}>{history[0].categoria}</div>
              <div style={{ color: cfg.colorMuted, fontSize: 11, marginTop: 3 }}>
                {history[0].hora} {history[0].compartido ? `· 🤝 compartido con ${otroNombre}` : ""}
              </div>
            </div>
            <div style={{ color: history[0].monto < 0 ? "#f87171" : "#4ade80", fontWeight: 700, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>
              {history[0].monto < 0 ? "-" : "+"}${Math.abs(history[0].monto).toLocaleString("es-AR")}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div style={{ padding: "16px 20px 32px", textAlign: "center" }}>
        <a href={`https://docs.google.com/spreadsheets/d/${SHARED_SHEET_ID}`} target="_blank" rel="noopener noreferrer"
          style={{ color: cfg.colorDim, fontSize: 12, textDecoration: "none" }}>
          Planilla compartida con {otroNombre} ↗
        </a>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        *{box-sizing:border-box} body{margin:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:${cfg.colorBorder};border-radius:3px}
        textarea::placeholder{color:${cfg.colorDim};font-size:13px;line-height:1.5}
      `}</style>
    </div>
  );
}
