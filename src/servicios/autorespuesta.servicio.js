import {
  enviarMensajeWhatsApp,
  enviarBotonesWhatsApp,
  enviarListaWhatsApp
} from "./whatsapp.servicio.js";

import {
  cargarRespuestasCalendario,
  normalizarTexto,
  detectarIntent
} from "../base_conocimiento/respuestascalendario.servicio.js";

import {
  leerEstado,
  guardarEstado,
  patchEstado,
  limpiarEstado
} from "./estadoAgenda.servicio.js";

import {
  listarSlotsDisponiblesDjango,
  reservarSlotDjango,
  listarBucketsDjango
} from "./djangoAgenda.servicio.js";

import {
  newPromptToken,
  makeId,
  parseId,
  isExpectedInteraction
} from "./flujoGuard.servicio.js";
import {
  manejarNavegacion
} from "./enrutadorConversacion.servicio.js";

import logger from "./logger.servicio.js";

import {
  logIncomingMessage,
  logOutgoingMessage,
  logMenuEvent,
  updateConversationOutcome
} from "./DBlogger.servicio.js"

const cfg = cargarRespuestasCalendario();
const userQueue = new Map();

function enqueueUser(from, fn) {
  const prev = userQueue.get(from) || Promise.resolve();
  const next = prev
    .catch((e) => logger.error("[enqueueUser] error previo", { from, error: e?.message || e, stack: e?.stack }))
    .then(fn)
    .catch((e) => logger.error("[enqueueUser] error en handler", { from, error: e?.message || e, stack: e?.stack }))
    .finally(() => {
      if (userQueue.get(from) === next) userQueue.delete(from);
    });

  userQueue.set(from, next);
  return next;
}

function agendaFisicaDefault() {
  return (process.env.BOT_DEFAULT_AGENDA || "agenda1").trim();
}

const whatsappAdapter = {
  enviarTexto: async (to, body) => {
    const result = await enviarMensajeWhatsApp({ to, body });
    logOutgoingMessage({
      phoneRaw: to,
      messageType: "text",
      content: body,
      payload: { to, body },
      waMessageId: result?.messages?.[0]?.id,
      waStatus: "sent"
    }).catch(err => logger.error("Error en logOutgoingMessage", { err }));
    return result;
  },

  enviarBotones: async (to, body, buttons) => {
    const result = await enviarBotonesWhatsApp({
      to,
      body,
      buttons,
      wa_payload_kind: "menu_modular"
    });
    logOutgoingMessage({
      phoneRaw: to,
      messageType: "button",
      content: body,
      payload: { to, body, buttons },
      waMessageId: result?.messages?.[0]?.id,
      waStatus: "sent"
    }).catch(err => logger.error("Error en logOutgoingMessage", { err }));
    return result;
  },

  enviarLista: async (to, body, buttonText, sectionTitle, rows) => {
    const result = await enviarListaWhatsApp({
      to,
      body,
      buttonText,
      sectionTitle,
      rows,
      wa_payload_kind: "menu_modular_lista"
    });
    logOutgoingMessage({
      phoneRaw: to,
      messageType: "list",
      content: body,
      payload: { to, body, rows },
      waMessageId: result?.messages?.[0]?.id,
      waStatus: "sent"
    }).catch(err => logger.error("Error en logOutgoingMessage", { err }));
    return result;
  }
};

function esComandoModular(raw) {
  return (
    raw.startsWith("MENU|") ||
    raw.startsWith("CAT|") ||
    raw.startsWith("SERV|") ||
    raw.startsWith("FAQ|") ||
    raw.startsWith("AGENDAR|")
  );
}

function esTextoModular(msgNormalizado) {
  const t = (msgNormalizado || "").toLowerCase();
  return (
    t.includes("servicio") ||
    t.includes("pregunta") ||
    t.includes("faq") ||
    t.includes("contacto") ||
    t.includes("horario") ||
    t.includes("direccion") ||
    t.includes("dirección") ||
    t.includes("menu") ||
    t.includes("menú")
  );
}

function validarNombre(texto) {
  const t = (texto || "").trim();
  if (t.length < 2) return null;
  if (!/^[a-zA-ZÀ-ÿ\u00f1\u00d1\s'-]+$/.test(t)) return null;
  return t;
}

function validarEmail(texto) {
  const t = (texto || "").trim().toLowerCase();
  if (t.length < 6) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return null;
  return t;
}

function pad2(n) { return String(n).padStart(2, "0"); }
function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}
function toYMD(dateObj) {
  const y = dateObj.getFullYear();
  const m = pad2(dateObj.getMonth() + 1);
  const d = pad2(dateObj.getDate());
  return `${y}-${m}-${d}`;
}
function weekdayShortEs(dateObj) {
  const map = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return map[dateObj.getDay()];
}

function tpl(texto, vars = {}) {
  let out = texto || "";
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return out;
}

/**
 * ✅ Normaliza bucket para comparar:
 * - baja a minúsculas
 * - elimina tildes/diacríticos
 * Ej: "Aparatología" == "aparatologia"
 */
function normalizarBucket(valor) {
  const t = String(valor || "").trim().toLowerCase();
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildWeekRowsNext7Days(token) {
  const today = new Date();
  const rows = [];

  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const ymd = toYMD(d);
    const title = `${weekdayShortEs(d)} ${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}`;
    rows.push({ id: makeId("DATE", token, ymd), title, description: ymd });
  }

  rows.push({
    id: makeId("DATE", token, "OTRA_FECHA"),
    title: "Otra fecha (escribir)",
    description: "Ingresar dd-mm-aaaa"
  });

  return rows;
}

function slotsToListRows(slots, token) {
  return slots.map((s) => {
    const dt = s?.start?.dateTime || "";
    const [fecha, hora] = dt.split("T");
    const hhmm = (hora || "").substring(0, 5);
    return {
      id: makeId("SLOT", token, s.event_id),
      title: hhmm,
      description: fecha
    };
  });
}

async function renderBuckets(to) {
  const agenda = agendaFisicaDefault();
  let resp;
  try {
    resp = await listarBucketsDjango({ agenda });
  } catch (e) {
    logger.error("[renderBuckets] error al listar buckets", { to, agenda, error: e?.message || e, stack: e?.stack });
    await enviarMensajeWhatsApp({ to, body: cfg.mensajes.error_conexion_django || "No puedo conectar al servicio de agendas." });
    limpiarEstado(to);
    return;
  }
  const buckets = Array.isArray(resp?.buckets) ? resp.buckets : [];
  const uniq = [...new Set(buckets.map((b) => String(b || "").trim()).filter(Boolean))];

  if (uniq.length === 0) {
    await enviarMensajeWhatsApp({ to, body: cfg.mensajes.sin_agendas || "No hay agendas disponibles." });
    limpiarEstado(to);
    return;
  }

  const token = newPromptToken();
  const expected = { kind: "bucket", token, expiresAt: Date.now() + 2 * 60 * 1000 };

  const buttons = uniq.slice(0, 3).map((b) => ({ id: makeId("BUCKET", token, b), title: b }));

  await enviarBotonesWhatsApp({
    to,
    body: cfg.mensajes.elegir_agenda || "Elige una agenda:",
    buttons,
    wa_payload_kind: "pick_bucket"
  });

  patchEstado(to, { step: "AWAIT_BUCKET", agenda, buckets: uniq, expected });
}

async function renderPickWeek(to) {
  const token = newPromptToken();
  const expected = { kind: "date_pick", token, expiresAt: Date.now() + 2 * 60 * 1000 };

  await enviarListaWhatsApp({
    to,
    body: cfg.mensajes.pedir_fecha_lista,
    buttonText: cfg.mensajes.fecha_lista_boton,
    sectionTitle: cfg.mensajes.fecha_lista_section,
    rows: buildWeekRowsNext7Days(token),
    wa_payload_kind: "pick_date_week_list"
  });

  patchEstado(to, { expected });
}

async function renderSlots(to, fechaYmd, slots) {
  const token = newPromptToken();
  const expected = { kind: "slot_pick", token, expiresAt: Date.now() + 2 * 60 * 1000 };

  await enviarListaWhatsApp({
    to,
    body: tpl(cfg.mensajes.slots_title, { fecha: fechaYmd }),
    buttonText: cfg.mensajes.slots_button,
    sectionTitle: cfg.mensajes.slots_section,
    rows: slotsToListRows(slots, token),
    wa_payload_kind: "slots_list"
  });

  patchEstado(to, { expected, slots });
}

async function renderAfterConfirmMenu(to) {
  const token = newPromptToken();
  const expected = { kind: "after_menu", token, expiresAt: Date.now() + 3 * 60 * 1000 };

  await enviarBotonesWhatsApp({
    to,
    body: cfg.mensajes.necesitas_algo_mas || "¿Necesitas algo más?",
    buttons: [
      { id: makeId("MENU", token, "AGENDAR_OTRA"), title: cfg.mensajes.boton_agendar_otra },
      { id: makeId("MENU", token, "SALIR"), title: cfg.mensajes.boton_salir }
    ],
    wa_payload_kind: "after_confirm_menu"
  });

  patchEstado(to, { expected, step: "AFTER_CONFIRM" });
}

function normalizeIncomingId(texto) {
  return String(texto || "").trim();
}

function inferKindFromPrefix(prefix) {
  if (prefix === "WELCOME") return "welcome";
  if (prefix === "BUCKET") return "bucket";
  if (prefix === "DATE") return "date_pick";
  if (prefix === "SLOT") return "slot_pick";
  if (prefix === "MENU") return "after_menu";
  return null;
}

async function buscarYMostrarSlots(to, estado, ymd) {
  const timeMinIso = `${ymd}T00:00:00-03:00`;
  const timeMaxIso = `${ymd}T23:59:59-03:00`;

  await enviarMensajeWhatsApp({ to, body: tpl(cfg.mensajes.buscando, { fecha: ymd }) });

  const resp = await listarSlotsDisponiblesDjango({
    agenda: estado.agenda || agendaFisicaDefault(),
    timeMinIso,
    timeMaxIso,
    maxResults: 100
  });

  const bucket = String(estado.bucket || "").trim();
  let slots = Array.isArray(resp?.slots) ? resp.slots : [];

  // ✅ FIX: comparar bucket normalizado (tildes/case)
  if (bucket) {
    slots = slots.filter((s) => normalizarBucket(s?.bucket) === normalizarBucket(bucket));
  }

  if (slots.length === 0) {
    await enviarMensajeWhatsApp({ to, body: tpl(cfg.mensajes.sin_horarios, { fecha: ymd }) });
    patchEstado(to, { step: "AWAIT_DATE", fecha: ymd });
    await renderPickWeek(to);
    return;
  }

  const top = slots.slice(0, 12);

  guardarEstado(to, {
    ...(leerEstado(to) || {}),
    step: "AWAIT_SLOT_CHOICE",
    fecha: ymd,
    slots: top
  });

  await renderSlots(to, ymd, top);
}

async function confirmarReserva(to, estado, email) {
  await enviarMensajeWhatsApp({ to, body: cfg.mensajes.confirmando });

  const result = await reservarSlotDjango({
    agenda: estado.agenda || agendaFisicaDefault(),
    eventId: estado.eventId,
    customer_name: estado.nombre,
    customer_phone: to,
    notes: "Reserva desde WhatsApp",
    attendee_email: email || "",
    bucket: estado.bucket || ""
  });

  const start = result?.start?.dateTime || "";
  const [f, h] = start.split("T");
  const hhmm = (h || "").substring(0, 5);

  await enviarMensajeWhatsApp({
    to,
    body: tpl(cfg.mensajes.confirmada, { fecha: f, hora: hhmm, nombre: estado.nombre })
  });

  await renderAfterConfirmMenu(to);

  updateConversationOutcome(to, "agendamiento_exitoso")
  .catch(err => logger.error("Error en updateConversationOutcome", { err })); 
}

export async function procesarMensajeEntrante({ from, texto, ts }) {
  if (!from) return;

  return enqueueUser(from, async () => {
    const raw = normalizeIncomingId(texto);
    const msg = normalizarTexto(raw);
    const estado = leerEstado(from) || {};

    logIncomingMessage({
    phoneRaw: from,
    messageType: raw.includes("|") ? "interactive" : "text",  // ✅ Detecta si es botón/lista
    content: raw,
    payload: {from, texto: raw, ts},
    waMessageId: null
    }).catch(err => logger.error("Error en logIncomingMessage", { err }));

    if (typeof ts === "number" && typeof estado.last_ts === "number" && ts <= estado.last_ts) return;
    if (typeof ts === "number") patchEstado(from, { last_ts: ts });

    // ✅ 1) comandos modulares
    if (esComandoModular(raw)) {
      limpiarEstado(from);

      const [tipo, a, b] = raw.split("|");
      logMenuEvent({
        phoneRaw: from,
        optionCode: raw,
        optionTitle: a || tipo,
        optionDescription: b || "",
        menuLevel: tipo === "MENU" ? 0 : tipo === "CAT" ? 1 : tipo === "SERV" ? 2 : 3,
        actionTaken: "view",
        rawPayload: { buttonId: raw, timestamp: ts }
      }).catch(err => logger.error("Error en logMenuEvent", { err }));

      const r = await manejarNavegacion({
        whatsapp: whatsappAdapter,
        to: from,
        buttonId: raw,
        texto: ""
      });

      if (r?.accion === "DELEGAR_AGENDAMIENTO") {
        const agenda = agendaFisicaDefault();

        // ✅ FIX: si viene desde detalle del servicio, ahora llega bucket_key
        if (r.payload?.bucket_key) {
          guardarEstado(from, {
            step: "AWAIT_NAME",
            agenda,
            bucket: String(r.payload.bucket_key).trim(),
            servicioId: String(r.payload.servicio_id || "").trim(),
            expected: null
          });

          await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_nombre });
          return;
        }

        // menú agendar normal (elige bucket)
        await renderBuckets(from);
      }
      return;
    }

    // ✅ 2) texto modular si NO hay agenda activa
    if (!estado.step && esTextoModular(msg)) {
      await manejarNavegacion({ whatsapp: whatsappAdapter, to: from, buttonId: "", texto: raw });
      return;
    }

    const parsed = raw.includes("|") ? parseId(raw) : null;
    const kind = parsed ? inferKindFromPrefix(parsed.prefix) : null;

    const intent = detectarIntent(msg, cfg.intents);

    if (intent === "SALUDO") {
      limpiarEstado(from);
      await manejarNavegacion({ whatsapp: whatsappAdapter, to: from, buttonId: "", texto: "hola" });
      return;
    }

    if (intent === "AGENDA") {
      limpiarEstado(from);
      await renderBuckets(from);
      return;
    }

    if (estado.step === "ASK_CONFIRM") {
      if (!parsed || kind !== "welcome") return;
      if (!isExpectedInteraction(estado, parsed, "welcome")) return;

      if (parsed.value === "SI") { await renderBuckets(from); return; }
      if (parsed.value === "NO") {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.rechazo });
        limpiarEstado(from);
        return;
      }
      return;
    }

    if (estado.step === "AWAIT_BUCKET") {
      if (!parsed || kind !== "bucket") return;
      if (!isExpectedInteraction(estado, parsed, "bucket")) return;

      const bucket = String(parsed.value || "").trim();
      const buckets = Array.isArray(estado.buckets) ? estado.buckets : [];

      if (!bucket || !buckets.includes(bucket)) {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.bucket_invalido });
        await renderBuckets(from);
        return;
      }

      guardarEstado(from, {
        step: "AWAIT_NAME",
        agenda: estado.agenda || agendaFisicaDefault(),
        bucket,
        expected: null
      });

      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_nombre });
      return;
    }

    if (estado.step === "AWAIT_NAME") {
      const nombre = validarNombre(raw);
      if (!nombre) { await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.nombre_invalido }); return; }

      patchEstado(from, { step: "AWAIT_DATE", nombre });
      await renderPickWeek(from);
      return;
    }

    if (estado.step === "AWAIT_DATE") {
      if (parsed) {
        if (kind === "date_pick") {
          if (!isExpectedInteraction(estado, parsed, "date_pick")) return;

          if (parsed.value === "OTRA_FECHA") {
            await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_fecha_manual });
            patchEstado(from, { expected: null });
            return;
          }

          await buscarYMostrarSlots(from, leerEstado(from) || estado, parsed.value);
          return;
        }
        return;
      }

      const f = raw.trim().replace(/[\/.\s]+/g, "-").replace(/-+/g, "-");
      const m = f.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (!m) { await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fecha_invalida }); return; }
      const ymd = `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
      await buscarYMostrarSlots(from, leerEstado(from) || estado, ymd);
      return;
    }

    if (estado.step === "AWAIT_SLOT_CHOICE") {
      if (!parsed || kind !== "slot_pick") return;
      if (!isExpectedInteraction(estado, parsed, "slot_pick")) return;

      const eventId = String(parsed.value || "").trim();
      if (!eventId) { await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fallback }); return; }

      patchEstado(from, { step: "AWAIT_EMAIL", eventId, expected: null });
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_email });
      return;
    }

    if (estado.step === "AWAIT_EMAIL") {
      if (intent === "NO") { await confirmarReserva(from, estado, ""); return; }

      const email = validarEmail(raw);
      if (!email) { await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.email_invalido }); return; }

      await confirmarReserva(from, estado, email);
      return;
    }

    if (estado.step === "AFTER_CONFIRM") {
      if (!parsed || kind !== "after_menu") return;
      if (!isExpectedInteraction(estado, parsed, "after_menu")) return;

      if (parsed.value === "AGENDAR_OTRA") { await renderBuckets(from); return; }
      if (parsed.value === "SALIR") {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.despedida });
        limpiarEstado(from);
        return;
      }

      await renderAfterConfirmMenu(from);
      return;
    }

    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fallback });
  });
}
