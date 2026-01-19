import axios from "axios";

export async function enviarMensajeWhatsApp({ to, body }) {
  const url = `https://graph.facebook.com/v20.0/${process.env.META_WA_PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    { messaging_product: "whatsapp", to, text: { body } },
    {
      headers: {
        Authorization: `Bearer ${process.env.META_WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}
