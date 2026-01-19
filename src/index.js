import express from "express";
import dotenv from "dotenv";
import axios from "axios";


// Cargar variables de entorno desde .env
dotenv.config();

const app = express();

// Middleware para leer JSON
app.use(express.json());

// Ruta simple para comprobar que el servidor levanta
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "WhatsApp Bot Backend activo"
  });
});

// Ruta de salud (útil para hosting)
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

// 🔹 Webhook VERIFICACIÓN (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    console.log("✅ Webhook verificado correctamente");
    return res.status(200).send(challenge);
  }

  console.error("❌ Error de verificación del webhook");
  return res.sendStatus(403);
});

// 🔹 Webhook RECEPCIÓN de mensajes (POST)

app.post("/webhook", async (req, res) => {
  // Meta exige responder 200 rápido
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const message = value?.messages?.[0];
    if (!message) return;

    const from = message.from; // número del usuario
    const text = message.text?.body;

    console.log("📩 Mensaje recibido:", text);

    // Respuesta simple de prueba
    await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.META_WA_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: "Hola 👋, recibí tu mensaje correctamente." }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.META_WA_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Respuesta enviada");
  } catch (err) {
    console.error("❌ Error respondiendo:", err.response?.data || err.message);
  }
});


// Puerto desde .env
const PORT = process.env.PORT || 3000;

// Arranque del servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
