import axios from "axios";

export async function enviarMensajeWhatsApp({ to, body }) {
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID;
  const token = process.env.META_WA_ACCESS_TOKEN;

  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;

  try {
    const resp = await axios.post(
      url,
      { messaging_product: "whatsapp", to, text: { body } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    return resp.data;
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    console.error("❌ WhatsApp Cloud API error");
    console.error("Status:", status);
    console.error("Response data:", JSON.stringify(data, null, 2));
    console.error("URL:", url);
    console.error("TO:", to);

    throw err;
  }
}
