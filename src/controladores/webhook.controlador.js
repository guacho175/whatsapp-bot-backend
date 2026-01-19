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
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    const texto = message.text?.body?.trim() || "";

    console.log("📩 Mensaje recibido:", texto);

    await procesarMensajeEntrante({ from, texto });
  } catch (err) {
    console.error("❌ Error procesando webhook:", err?.message || err);
  }
}
