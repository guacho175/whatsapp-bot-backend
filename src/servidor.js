import express from "express";
import dotenv from "dotenv";
import webhookRutas from "./rutas/webhook.rutas.js";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.json({ ok: true, servicio: "WhatsApp Bot Backend" }));
app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/", webhookRutas);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`));
