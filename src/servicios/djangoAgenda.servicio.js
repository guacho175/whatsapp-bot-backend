// src/servicios/djangoAgenda.servicio.js

import axios from "axios";

function baseUrl() {
  const raw = process.env.DJANGO_API_BASE_URL || "http://127.0.0.1:8000";
  return String(raw).replace(/\/$/, "");
}

function normalizarAgenda(agenda) {
  if (agenda === undefined || agenda === null) {
    throw new Error("[djangoAgenda] Falta agenda (debe venir desde la conversación)");
  }

  const a = String(agenda).trim();

  if (!a) {
    throw new Error("[djangoAgenda] Agenda vacía");
  }

  return a;
}

export async function crearEventoDjango({
  agenda,
  summary,
  startIso,
  endIso,
  description = "",
}) {
  const agendaOk = normalizarAgenda(agenda);

  const url = `${baseUrl()}/calendar/events`;

  const body = {
    agenda: agendaOk,
    summary: String(summary || "").trim(),
    start: String(startIso || "").trim(),
    end: String(endIso || "").trim(),
    description: String(description || ""),
  };

  // 🔎 LOG CLAVE: ver exactamente qué se envía a Django
  console.log("=======================================");
  console.log("[crearEventoDjango] POST", url);
  console.log("[crearEventoDjango] BODY ENVIADO A DJANGO:");
  console.log(JSON.stringify(body, null, 2));
  console.log("=======================================");

  try {
    const resp = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });

    console.log("[crearEventoDjango] RESPUESTA DJANGO:");
    console.log(JSON.stringify(resp.data, null, 2));

    return resp.data;
  } catch (err) {
    console.error("[crearEventoDjango] ERROR AL CREAR EVENTO");

    if (err.response) {
      console.error("STATUS:", err.response.status);
      console.error("DATA:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }

    throw err;
  }
}
