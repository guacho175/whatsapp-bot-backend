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

    // timestamp REAL (epoch seconds → ms)
    const ts = message.timestamp ? Number(message.timestamp) * 1000 : Date.now();

    // Texto normal
    const textoNormal = message.text?.body?.trim() || "";

    // Botón
    const buttonId = message.interactive?.button_reply?.id || "";
    const buttonTitle = message.interactive?.button_reply?.title || "";

    // Lista
    const listId = message.interactive?.list_reply?.id || "";
    const listTitle = message.interactive?.list_reply?.title || "";
    const listDescription = message.interactive?.list_reply?.description || "";

    let texto = textoNormal;

    if (buttonId) {
      texto = buttonId;
      console.log("📩 Mensaje recibido (BOTÓN):", { from, buttonId, buttonTitle });
    } else if (listId) {
      texto = listId; // ✅ NO modificar el ID
      console.log("📩 Mensaje recibido (LISTA):", {
        from,
        listId,
        listTitle,
        listDescription
      });
    } else {
      console.log("📩 Mensaje recibido (TEXTO):", textoNormal);
    }

    await procesarMensajeEntrante({
      from,
      texto,
      ts
    });
  } catch (err) {
    console.error("❌ Error procesando webhook:", err?.message || err);
  }
}
