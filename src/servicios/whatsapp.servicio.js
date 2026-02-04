import axios from "axios";
import { logWhatsAppEvent } from "../metrics/whatsappLogger.js";

function metaConfig() {
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID;
  const token = process.env.META_WA_ACCESS_TOKEN;

  if (!phoneId) throw new Error("Falta META_WA_PHONE_NUMBER_ID en .env");
  if (!token) throw new Error("Falta META_WA_ACCESS_TOKEN en .env");

  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  return { url, token };
}

function detectCategoryForCost(payload) {
  if (payload?.type === "template") return "utility";
  return "service";
}

async function postMeta({ url, token, payload, meta = {} }) {
  const category_for_cost = meta.category_for_cost || detectCategoryForCost(payload);
  const to = payload?.to ? String(payload.to) : null;
  const type = payload?.type ? String(payload.type) : "unknown";

  try {
    const resp = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    });

    logWhatsAppEvent({
      direction: "out",
      to,
      type,
      status: "sent",
      category_for_cost,
      message_id: resp?.data?.messages?.[0]?.id || null,
      wa_payload_kind: meta.wa_payload_kind || null
    });

    return resp.data;
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    console.error("❌ WhatsApp Cloud API error");
    console.error("Status:", status);
    console.error("Response data:", JSON.stringify(data, null, 2));
    console.error("URL:", url);
    console.error("PAYLOAD:", JSON.stringify(payload, null, 2));

    logWhatsAppEvent({
      direction: "out",
      to,
      type,
      status: "error",
      category_for_cost,
      http_status: status ?? null,
      error_message: data?.error?.message || err?.message || "unknown_error",
      wa_payload_kind: meta.wa_payload_kind || null
    });

    throw err;
  }
}

/* =========================
   ✅ Helpers de normalización
   ========================= */

function cortarTexto(s, max) {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

/**
 * Reglas típicas para LIST:
 * - action.button: <= 20
 * - section.title: <= 24
 * - row.title: <= 24
 * - row.description: <= 72
 */
function normalizarLista({ buttonText, sectionTitle, rows }) {
  const safeButton = cortarTexto(buttonText || "Ver opciones", 20);
  const safeSection = cortarTexto(sectionTitle || "Opciones", 24);

  const safeRows = (rows || []).map((r) => ({
    id: String(r?.id ?? "").trim(),
    title: cortarTexto(r?.title || "Opción", 24),
    ...(r?.description ? { description: cortarTexto(r.description, 72) } : {})
  }));

  return { safeButton, safeSection, safeRows };
}

/**
 * Reglas para BOTONES:
 * - reply.title: <= 20  ✅ (este era tu error)
 */
function normalizarBotones(buttons) {
  return (buttons || []).map((b) => ({
    id: String(b?.id ?? "").trim(),
    title: cortarTexto(String(b?.title ?? ""), 20) // 👈 CLAVE
  }));
}

/* =========================
   ✅ Envíos WhatsApp
   ========================= */

// 1) Texto
export async function enviarMensajeWhatsApp({
  to,
  body,
  category_for_cost,
  wa_payload_kind
}) {
  const { url, token } = metaConfig();

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  };

  return postMeta({
    url,
    token,
    payload,
    meta: { category_for_cost, wa_payload_kind }
  });
}

/**
 * 2) Botones (máx 3)
 */
export async function enviarBotonesWhatsApp({
  to,
  body,
  buttons,
  category_for_cost,
  wa_payload_kind
}) {
  const { url, token } = metaConfig();

  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
    throw new Error("buttons debe tener entre 1 y 3 opciones");
  }

  const safeButtons = normalizarBotones(buttons);

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: safeButtons.map((b) => ({
          type: "reply",
          reply: {
            id: b.id,
            title: b.title // 👈 ya viene <= 20
          }
        }))
      }
    }
  };

  return postMeta({
    url,
    token,
    payload,
    meta: { category_for_cost, wa_payload_kind }
  });
}

/**
 * 3) Lista
 */
export async function enviarListaWhatsApp({
  to,
  body,
  buttonText = "Ver opciones",
  sectionTitle = "Opciones",
  rows,
  category_for_cost,
  wa_payload_kind
}) {
  const { url, token } = metaConfig();

  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("rows debe tener al menos 1 opción");
  }

  const { safeButton, safeSection, safeRows } = normalizarLista({
    buttonText,
    sectionTitle,
    rows
  });

  const finalRows = safeRows.filter((r) => r.id && r.title);

  if (finalRows.length < 1) {
    throw new Error("rows inválidas (id/title vacíos) después de normalizar");
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: safeButton,
        sections: [
          {
            title: safeSection,
            rows: finalRows.map((r) => ({
              id: r.id,
              title: r.title,
              ...(r.description ? { description: r.description } : {})
            }))
          }
        ]
      }
    }
  };

  return postMeta({
    url,
    token,
    payload,
    meta: { category_for_cost, wa_payload_kind }
  });
}
