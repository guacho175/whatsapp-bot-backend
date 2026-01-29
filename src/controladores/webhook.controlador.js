import { procesarMensajeEntrante } from "../servicios/autorespuesta.servicio.js";

export function verificarWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    console.log("✅ Webhook verificado correctamente");
    return res.status(200).send(challenge);
  }

  console.error("❌ Error de verificación del webhook");
  return res.sendStatus(403);
}

export async function recibirWebhook(req, res) {
  // Meta exige responder 200 rápido
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const message = value?.messages?.[0];
    if (!message) return;

    const from = message.from;

    // 1) Texto normal
    const textoNormal = message.text?.body?.trim() || "";

    // 2) Reply Button (botón)
    const buttonId = message.interactive?.button_reply?.id || "";
    const buttonTitle = message.interactive?.button_reply?.title || "";

    // 3) List Message (lista)
    const listId = message.interactive?.list_reply?.id || "";
    const listTitle = message.interactive?.list_reply?.title || "";
    const listDescription = message.interactive?.list_reply?.description || "";

    // Priorización:
    // - Si viene botón -> usamos su id como "texto" (intents más limpios)
    // - Si viene lista -> enviamos un token "LIST:<id>" para que tu flujo sepa que es selección
    // - Si no -> texto normal
    let texto = textoNormal;

    if (buttonId) {
      texto = buttonId; // Ej: "SI", "NO", "AGENDA_3"
      console.log("📩 Mensaje recibido (BOTÓN):", { from, buttonId, buttonTitle });
    } else if (listId) {
      texto = `LIST:${listId}`; // Ej: LIST:vbhim0qocbciq60...
      console.log("📩 Mensaje recibido (LISTA):", {
        from,
        listId,
        listTitle,
        listDescription
      });
    } else {
      console.log("📩 Mensaje recibido (TEXTO):", textoNormal);
    }

    // Pasamos también metadata por si después la usas (no rompe si tu función no la lee)
    await procesarMensajeEntrante({
      from,
      texto,
      meta: {
        buttonId,
        buttonTitle,
        listId,
        listTitle,
        listDescription
      }
    });
  } catch (err) {
    console.error("❌ Error procesando webhook:", err?.message || err);
  }
}
