// src/servicios/djangoAgenda.servicio.js
import axios from "axios";

function baseUrl() {
  const raw = process.env.DJANGO_API_BASE_URL || "https://175galindez.pythonanywhere.com";
  return String(raw).replace(/\/$/, "");
}

function normalizarAgenda(agenda) {
  if (agenda === undefined || agenda === null) {
    throw new Error("[djangoAgenda] Falta agenda (debe venir desde la conversación)");
  }

  const a = String(agenda).trim();
  if (!a) throw new Error("[djangoAgenda] Agenda vacía");
  return a;
}

function normalizarEventId(eventId) {
  if (eventId === undefined || eventId === null) {
    throw new Error("[djangoAgenda] Falta eventId");
  }
  const id = String(eventId).trim();
  if (!id) throw new Error("[djangoAgenda] eventId vacío");
  return id;
}

function normalizarIso(dt, campo) {
  if (dt === undefined || dt === null) {
    throw new Error(`[djangoAgenda] Falta ${campo}`);
  }
  const s = String(dt).trim();
  if (!s) throw new Error(`[djangoAgenda] ${campo} vacío`);
  return s;
}

/**
 * (Opcional) Crear evento genérico
 * POST /calendar/events
 */
export async function crearEventoDjango({ agenda, summary, startIso, endIso, description = "" }) {
  const agendaOk = normalizarAgenda(agenda);

  const url = `${baseUrl()}/calendar/events`;

  const body = {
    agenda: agendaOk,
    summary: String(summary || "").trim(),
    start: String(startIso || "").trim(),
    end: String(endIso || "").trim(),
    description: String(description || "")
  };

  console.log("=======================================");
  console.log("[crearEventoDjango] POST", url);
  console.log("[crearEventoDjango] BODY ENVIADO A DJANGO:");
  console.log(JSON.stringify(body, null, 2));
  console.log("=======================================");

  const resp = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 20000
  });

  return resp.data;
}

/**
 * ✅ NUEVO: listar buckets (agendas lógicas)
 * GET /calendar/agendas/<agenda>/buckets
 */
export async function listarBucketsDjango({ agenda }) {
  const agendaOk = normalizarAgenda(agenda);
  const url = `${baseUrl()}/calendar/agendas/${encodeURIComponent(agendaOk)}/buckets`;

  console.log("=======================================");
  console.log("[listarBucketsDjango] GET", url);
  console.log("=======================================");

  const resp = await axios.get(url, { timeout: 20000 });
  return resp.data;
}

/**
 * GET /calendar/agendas/<agenda>/slots/list
 */
export async function listarSlotsDisponiblesDjango({
  agenda,
  timeMinIso,
  timeMaxIso,
  maxResults = 250
}) {
  const agendaOk = normalizarAgenda(agenda);
  const timeMin = normalizarIso(timeMinIso, "timeMinIso");
  const timeMax = normalizarIso(timeMaxIso, "timeMaxIso");

  const url = `${baseUrl()}/calendar/agendas/${encodeURIComponent(agendaOk)}/slots/list`;

  const params = {
    time_min: timeMin,
    time_max: timeMax,
    max_results: Number(maxResults) || 250
  };

  console.log("=======================================");
  console.log("[listarSlotsDisponiblesDjango] GET", url);
  console.log("[listarSlotsDisponiblesDjango] PARAMS:", JSON.stringify(params, null, 2));
  console.log("=======================================");

  const resp = await axios.get(url, { params, timeout: 20000 });
  return resp.data;
}

/**
 * POST /calendar/agendas/<agenda>/slots/<event_id>/reserve
 */
export async function reservarSlotDjango({
  agenda,
  eventId,
  customer_name,
  customer_phone = "",
  notes = "",
  attendee_email = "",
  bucket = ""
}) {
  const agendaOk = normalizarAgenda(agenda);
  const eventIdOk = normalizarEventId(eventId);

  const url = `${baseUrl()}/calendar/agendas/${encodeURIComponent(agendaOk)}/slots/${encodeURIComponent(
    eventIdOk
  )}/reserve`;

  const body = {
    customer_name: String(customer_name || "").trim(),
    customer_phone: String(customer_phone || "").trim(),
    notes: String(notes || "").trim(),
    attendee_email: String(attendee_email || "").trim(),
    bucket: String(bucket || "").trim()
  };

  if (!body.customer_name) {
    throw new Error("[reservarSlotDjango] Falta customer_name");
  }

  console.log("=======================================");
  console.log("[reservarSlotDjango] POST", url);
  console.log("[reservarSlotDjango] BODY:", JSON.stringify(body, null, 2));
  console.log("=======================================");

  const resp = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 20000
  });

  return resp.data;
}
