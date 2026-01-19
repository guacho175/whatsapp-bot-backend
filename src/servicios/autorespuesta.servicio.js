import { obtenerRespuesta } from "../base_conocimiento/respuestas.servicio.js";
import { enviarMensajeWhatsApp } from "./whatsapp.servicio.js";

export async function procesarMensajeEntrante({ from, texto }) {
  if (!texto) return;

  const respuesta = obtenerRespuesta(texto);
  await enviarMensajeWhatsApp({ to: from, body: respuesta });

  console.log("✅ Respuesta enviada");
}
