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

const cfg = cargarRespuestasCalendario();

/* =========================
   ✅ Cola por usuario
   (NO drops, pero ahora LOGEA errores)
   ========================= */
const userQueue = new Map();

function enqueueUser(from, fn) {
  const prev = userQueue.get(from) || Promise.resolve();
  const next = prev
    .catch((e) => {
      console.error("[enqueueUser] error previo:", e);
    })
    .then(fn)
    .catch((e) => {
      console.error("[enqueueUser] error en handler:", e);
    })
    .finally(() => {
      if (userQueue.get(from) === next) userQueue.delete(from);
    });

  userQueue.set(from, next);
  return next;
}

function agendaFisicaDefault() {
  return (process.env.BOT_DEFAULT_AGENDA || "agenda1").trim();
}

/* =========================
   Helpers básicos
   ========================= */
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

function pad2(n) {
  return String(n).padStart(2, "0");
}
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

function buildWeekRowsNext7Days(token) {
  const today = new Date();
  const rows = [];

  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const ymd = toYMD(d);
    const title = `${weekdayShortEs(d)} ${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}`;
    rows.push({
      id: makeId("DATE", token, ymd),
      title,
      description: ymd
    });
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

/* =========================
   Renderers (con token)
   ========================= */
async function renderWelcome(to) {
  const token = newPromptToken();

  await enviarBotonesWhatsApp({
    to,
    body: cfg.mensajes.bienvenida,
    buttons: [
      { id: makeId("WELCOME", token, "SI"), title: cfg.mensajes.boton_si },
      { id: makeId("WELCOME", token, "NO"), title: cfg.mensajes.boton_no }
    ],
    wa_payload_kind: "welcome"
  });

  guardarEstado(to, {
    step: "ASK_CONFIRM",
    expected: { kind: "welcome", token, expiresAt: Date.now() + 2 * 60 * 1000 }
  });
}

async function renderBuckets(to) {
  const agenda = agendaFisicaDefault();

  const resp = await listarBucketsDjango({ agenda });
  const buckets = Array.isArray(resp?.buckets) ? resp.buckets : [];
  const uniq = [...new Set(buckets.map((b) => String(b || "").trim()).filter(Boolean))];

  if (uniq.length === 0) {
    await enviarMensajeWhatsApp({
      to,
      body: cfg.mensajes.sin_agendas || "No hay agendas disponibles."
    });
    limpiarEstado(to);
    return;
  }

  // WhatsApp Cloud API: interactive.button.reply.title -> min 1, max 20 chars
  const MAX_TITLE = 20;
  const shortTitle = (s) => {
    const raw = String(s || "").replace(/\s+/g, " ").trim();
    if (!raw) return "Opción";

    // abreviaciones simples para ganar espacio (opcional pero útil)
    let t = raw
      .replace(/\btratamientos?\b/gi, "Trat.")
      .replace(/\bcorporales?\b/gi, "Corp.")
      .replace(/\bfaciales?\b/gi, "Fac.")
      .replace(/\baparatolog[íi]a\b/gi, "Aparat.");

    // truncado final con elipsis
    if (t.length > MAX_TITLE) {
      t = t.slice(0, MAX_TITLE - 1).trimEnd() + "…";
    }

    // por si quedó vacío por algún caso raro
    if (!t) t = "Opción";
    return t;
  };

  const token = newPromptToken();
  const expected = { kind: "bucket", token, expiresAt: Date.now() + 2 * 60 * 1000 };

  const buttons = uniq.slice(0, 3).map((b) => ({
    // Mantén el ID con el bucket real para tu lógica (NO lo recortes)
    id: makeId("BUCKET", token, b),
    // Recorta SOLO lo visible para cumplir con Meta (<=20)
    title: shortTitle(b)
  }));

  await enviarBotonesWhatsApp({
    to,
    body: cfg.mensajes.elegir_agenda || "Elige una agenda:",
    buttons,
    wa_payload_kind: "pick_bucket"
  });

  patchEstado(to, { step: "AWAIT_BUCKET", agenda, buckets: uniq, expected });
}


async function renderAskDateButtons(to) {
  const token = newPromptToken();
  const expected = { kind: "date_mode", token, expiresAt: Date.now() + 2 * 60 * 1000 };

  await enviarBotonesWhatsApp({
    to,
    body: cfg.mensajes.pedir_fecha_botones,
    buttons: [
      { id: makeId("DATE_MODE", token, "TODAY"), title: cfg.mensajes.boton_hoy },
      { id: makeId("DATE_MODE", token, "TOMORROW"), title: cfg.mensajes.boton_manana },
      { id: makeId("DATE_MODE", token, "PICK_WEEK"), title: cfg.mensajes.boton_elegir_dia }
    ],
    wa_payload_kind: "ask_date_buttons"
  });

  patchEstado(to, { expected });
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

/* =========================
   Re-render (solo cuando corresponde)
   ========================= */
async function rerenderExpected(from) {
  const st = leerEstado(from) || {};
  const kind = st?.expected?.kind;

  if (st.step === "ASK_CONFIRM") return renderWelcome(from);
  if (st.step === "AWAIT_BUCKET") return renderBuckets(from);

  if (st.step === "AWAIT_DATE") {
    if (kind === "date_pick") return renderPickWeek(from);
    return renderAskDateButtons(from);
  }

  if (st.step === "AWAIT_SLOT_CHOICE") {
    if (st.fecha && Array.isArray(st.slots)) return renderSlots(from, st.fecha, st.slots);
    patchEstado(from, { step: "AWAIT_DATE" });
    return renderAskDateButtons(from);
  }

  if (st.step === "AFTER_CONFIRM") return renderAfterConfirmMenu(from);

  await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fallback });
}

/* =========================
   Parse interacción
   ========================= */
function normalizeIncomingId(texto) {
  return String(texto || "").trim();
}
function inferKindFromPrefix(prefix) {
  if (prefix === "WELCOME") return "welcome";
  if (prefix === "BUCKET") return "bucket";
  if (prefix === "DATE_MODE") return "date_mode";
  if (prefix === "DATE") return "date_pick";
  if (prefix === "SLOT") return "slot_pick";
  if (prefix === "MENU") return "after_menu";
  return null;
}

/* =========================
   Sub-flujos
   ========================= */
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
  if (bucket) slots = slots.filter((s) => String(s?.bucket || "").trim() === bucket);

  if (slots.length === 0) {
    await enviarMensajeWhatsApp({
      to,
      body: tpl(cfg.mensajes.sin_horarios, { fecha: ymd })
    });

    patchEstado(to, { step: "AWAIT_DATE", fecha: ymd });
    await renderAskDateButtons(to);
    return;
  }

  const top = slots.slice(0, 12);

  // ✅ NO PIERDE estado previo
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
}

/* =========================
   ✅ Entry principal
   ========================= */
export async function procesarMensajeEntrante({ from, texto, ts }) {
  if (!from) return;

  return enqueueUser(from, async () => {
    const raw = normalizeIncomingId(texto);
    const msg = normalizarTexto(raw);
    const estado = leerEstado(from) || {};

    // ✅ anti-out-of-order: si llega algo viejo, se ignora
    if (typeof ts === "number" && typeof estado.last_ts === "number" && ts <= estado.last_ts) {
      return;
    }
    if (typeof ts === "number") patchEstado(from, { last_ts: ts });

    const parsed = raw.includes("|") ? parseId(raw) : null;
    const kind = parsed ? inferKindFromPrefix(parsed.prefix) : null;

    const intent = detectarIntent(msg, cfg.intents);

    if (intent === "SALUDO") {
      limpiarEstado(from);
      await renderWelcome(from);
      return;
    }

    if (intent === "AGENDA") {
      limpiarEstado(from);
      await renderBuckets(from);
      return;
    }

    // =========================
    // ASK_CONFIRM
    // =========================
    if (estado.step === "ASK_CONFIRM") {
      // ✅ si llega algo viejo / distinto: ignora (NO re-render)
      if (!parsed || kind !== "welcome") return;
      if (!isExpectedInteraction(estado, parsed, "welcome")) return;

      if (parsed.value === "SI") {
        await renderBuckets(from);
        return;
      }

      if (parsed.value === "NO") {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.rechazo });
        limpiarEstado(from);
        return;
      }

      return;
    }

    // =========================
    // AWAIT_BUCKET
    // =========================
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

    // =========================
    // AWAIT_NAME
    // =========================
    if (estado.step === "AWAIT_NAME") {
      const nombre = validarNombre(raw);
      if (!nombre) {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.nombre_invalido });
        return;
      }

      patchEstado(from, { step: "AWAIT_DATE", nombre });
      await renderAskDateButtons(from);
      return;
    }

    // =========================
    // AWAIT_DATE
    // =========================
    if (estado.step === "AWAIT_DATE") {
      if (parsed) {
        // DATE_MODE
        if (kind === "date_mode") {
          // ✅ si ya esperamos lista, ignora botones viejos
          if (estado?.expected?.kind === "date_pick") return;

          // ✅ token viejo: ignora (NO re-render)
          if (!isExpectedInteraction(estado, parsed, "date_mode")) return;

          if (parsed.value === "PICK_WEEK") {
            await renderPickWeek(from);
            return;
          }

          let ymd = "";
          const base = new Date();
          if (parsed.value === "TODAY") ymd = toYMD(base);
          if (parsed.value === "TOMORROW") ymd = toYMD(addDays(base, 1));
          if (!ymd) return;

          await buscarYMostrarSlots(from, leerEstado(from) || estado, ymd);
          return;
        }

        // DATE (lista)
        if (kind === "date_pick") {
          // ✅ token viejo: ignora (NO re-render, evita loop)
          if (!isExpectedInteraction(estado, parsed, "date_pick")) return;

          if (parsed.value === "OTRA_FECHA") {
            await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_fecha_manual });
            patchEstado(from, { expected: null });
            return;
          }

          await buscarYMostrarSlots(from, leerEstado(from) || estado, parsed.value);
          return;
        }

        // otro tipo de interacción vieja: ignora
        return;
      }

      // Fecha manual
      const f = raw.trim().replace(/[\/.\s]+/g, "-").replace(/-+/g, "-");
      const m = f.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (!m) {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fecha_invalida });
        return;
      }
      const ymd = `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
      await buscarYMostrarSlots(from, leerEstado(from) || estado, ymd);
      return;
    }

    // =========================
    // AWAIT_SLOT_CHOICE
    // =========================
    if (estado.step === "AWAIT_SLOT_CHOICE") {
      if (!parsed || kind !== "slot_pick") return;
      if (!isExpectedInteraction(estado, parsed, "slot_pick")) return;

      const eventId = String(parsed.value || "").trim();
      if (!eventId) {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fallback });
        return;
      }

      patchEstado(from, { step: "AWAIT_EMAIL", eventId, expected: null });
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_email });
      return;
    }

    // =========================
    // AWAIT_EMAIL
    // =========================
    if (estado.step === "AWAIT_EMAIL") {
      if (intent === "NO") {
        await confirmarReserva(from, estado, "");
        return;
      }

      const email = validarEmail(raw);
      if (!email) {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.email_invalido });
        return;
      }

      await confirmarReserva(from, estado, email);
      return;
    }

    // =========================
    // AFTER_CONFIRM
    // =========================
    if (estado.step === "AFTER_CONFIRM") {
      if (!parsed || kind !== "after_menu") return;
      if (!isExpectedInteraction(estado, parsed, "after_menu")) return;

      if (parsed.value === "AGENDAR_OTRA") {
        await renderBuckets(from);
        return;
      }

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
