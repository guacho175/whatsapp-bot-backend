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
// ==============================
// NUEVAS FUNCIONES: SLOTS
// ==============================

function normalizarEventId(eventId) {
  if (eventId === undefined || eventId === null) {
    throw new Error("[djangoAgenda] Falta eventId");
  }
  const id = String(eventId).trim();
  if (!id) {
    throw new Error("[djangoAgenda] eventId vacío");
  }
  return id;
}

function normalizarIso(dt, campo) {
  if (dt === undefined || dt === null) {
    throw new Error(`[djangoAgenda] Falta ${campo}`);
  }
  const s = String(dt).trim();
  if (!s) {
    throw new Error(`[djangoAgenda] ${campo} vacío`);
  }
  return s;
}

/**
 * Lista slots DISPONIBLES por agenda y rango (time_min/time_max).
 *
 * Django:
 *   GET /calendar/agendas/{agenda}/slots/list?time_min=...&time_max=...&max_results=...
 */
export async function listarSlotsDisponiblesDjango({
  agenda,
  timeMinIso,
  timeMaxIso,
  maxResults = 250,
}) {
  const agendaOk = normalizarAgenda(agenda);
  const timeMin = normalizarIso(timeMinIso, "timeMinIso");
  const timeMax = normalizarIso(timeMaxIso, "timeMaxIso");

  const url = `${baseUrl()}/calendar/agendas/${encodeURIComponent(
    agendaOk
  )}/slots/list`;

  const params = {
    time_min: timeMin,
    time_max: timeMax,
    max_results: Number(maxResults) || 250,
  };

  console.log("=======================================");
  console.log("[listarSlotsDisponiblesDjango] GET", url);
  console.log("[listarSlotsDisponiblesDjango] PARAMS:", JSON.stringify(params, null, 2));
  console.log("=======================================");

  try {
    const resp = await axios.get(url, {
      params,
      timeout: 20000,
    });

    console.log("[listarSlotsDisponiblesDjango] RESPUESTA DJANGO:");
    console.log(JSON.stringify(resp.data, null, 2));

    return resp.data; // { count, slots: [...] }
  } catch (err) {
    console.error("[listarSlotsDisponiblesDjango] ERROR AL LISTAR SLOTS");

    if (err.response) {
      console.error("STATUS:", err.response.status);
      console.error("DATA:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }

    throw err;
  }
}

/**
 * Reserva un slot por event_id.
 *
 * Django:
 *   POST /calendar/agendas/{agenda}/slots/{event_id}/reserve
 * Body:
 *   { customer_name, customer_phone?, notes? }
 */
export async function reservarSlotDjango({
  agenda,
  eventId,
  customer_name,
  customer_phone = "",
  notes = "",
  attendee_email = ""  
  

}) {
  const agendaOk = normalizarAgenda(agenda);
  const eventIdOk = normalizarEventId(eventId);

  const url = `${baseUrl()}/calendar/agendas/${encodeURIComponent(
    agendaOk
  )}/slots/${encodeURIComponent(eventIdOk)}/reserve`;

  const body = {
    customer_name: String(customer_name || "").trim(),
    customer_phone: String(customer_phone || "").trim(),
    notes: String(notes || "").trim(),
    attendee_email: String(attendee_email || "").trim() 

  };

  if (!body.customer_name) {
    throw new Error("[reservarSlotDjango] Falta customer_name");
  }

  console.log("=======================================");
  console.log("[reservarSlotDjango] POST", url);
  console.log("[reservarSlotDjango] BODY:", JSON.stringify(body, null, 2));
  console.log("=======================================");

  try {
    const resp = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 20000,
    });

    console.log("[reservarSlotDjango] RESPUESTA DJANGO:");
    console.log(JSON.stringify(resp.data, null, 2));

    return resp.data; // { event_id, summary, start, end, status: "reserved" }
  } catch (err) {
    console.error("[reservarSlotDjango] ERROR AL RESERVAR SLOT");

    if (err.response) {
      console.error("STATUS:", err.response.status);
      console.error("DATA:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }

    throw err;
  }
}
