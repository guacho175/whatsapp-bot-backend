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

/**
 * Heurística mínima para categoría de costo.
 * AJUSTA esto cuando tengas templates reales y sepas si son marketing/utility/authentication.
 */
function detectCategoryForCost(payload) {
  if (payload?.type === "template") return "utility"; // cambia según tus templates
  // interactive / text: normalmente "service" (estimación)
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

    // ✅ LOG ÉXITO (para conteo/costos)
    logWhatsAppEvent({
      direction: "out",
      to,
      type,
      status: "sent",
      category_for_cost,
      message_id: resp?.data?.messages?.[0]?.id || null,
      wa_payload_kind: meta.wa_payload_kind || null // opcional: "menu_principal", "confirmacion", etc.
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

    // ✅ LOG ERROR (igual cuenta para auditoría; NO lo contamos como "sent")
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

// 1) Texto
export async function enviarMensajeWhatsApp({ to, body, category_for_cost, wa_payload_kind }) {
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
 * buttons: [{ id: "SI", title: "Sí" }, { id: "NO", title: "No" }]
 */
export async function enviarBotonesWhatsApp({ to, body, buttons, category_for_cost, wa_payload_kind }) {
  const { url, token } = metaConfig();

  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
    throw new Error("buttons debe tener entre 1 y 3 opciones");
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: String(b.id), title: String(b.title) }
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
 * 3) Lista (ideal para horarios)
 * rows: [{ id: "EVENT_ID", title: "08:00", description: "2026-02-02" }, ...]
 */
export async function enviarListaWhatsApp({
  to,
  body,
  buttonText = "Ver horarios",
  sectionTitle = "Horarios disponibles",
  rows,
  category_for_cost,
  wa_payload_kind
}) {
  const { url, token } = metaConfig();

  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("rows debe tener al menos 1 opción");
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: buttonText,
        sections: [
          {
            title: sectionTitle,
            rows: rows.map((r) => ({
              id: String(r.id),
              title: String(r.title),
              description: r.description ? String(r.description) : undefined
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
