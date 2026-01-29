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

import { leerEstado, guardarEstado, limpiarEstado } from "./estadoAgenda.servicio.js";

import {
  listarSlotsDisponiblesDjango,
  reservarSlotDjango
} from "./djangoAgenda.servicio.js";

const cfg = cargarRespuestasCalendario();

/* =========================
   PARSERS (tolerantes)
   ========================= */

// Acepta: 29-01-2026 | 29/01/2026 | 29 01 2026 | 29.01.2026 | 29-1-2026
function parseFecha(texto) {
  if (!texto) return null;

  let clean = texto
    .toLowerCase()
    .trim()
    .replace(/[\/.\s]+/g, "-")
    .replace(/-+/g, "-");

  const m = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;

  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  const anio = parseInt(m[3], 10);

  if (dia < 1 || dia > 31) return null;
  if (mes < 1 || mes > 12) return null;

  return {
    dia: String(dia).padStart(2, "0"),
    mes: String(mes).padStart(2, "0"),
    anio: String(anio)
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYMD(dateObj) {
  const y = dateObj.getFullYear();
  const m = pad2(dateObj.getMonth() + 1);
  const d = pad2(dateObj.getDate());
  return `${y}-${m}-${d}`;
}

function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

function weekdayShortEs(dateObj) {
  const map = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return map[dateObj.getDay()];
}


function validarNombre(texto) {
  const t = (texto || "").trim();
  if (t.length < 2) return null;
  // Solo letras/espacios/acentos (sin números)
  if (!/^[a-zA-ZÀ-ÿ\u00f1\u00d1\s'-]+$/.test(t)) return null;
  return t;
}

function esSalir(msg, intent) {
  if (intent === "NO") return true;
  if (intent === "SALIR") return true;
  if ((msg || "").includes("salir")) return true;
  if ((msg || "").includes("cancelar")) return true;
  return false;
}

function esOtraFecha(msg, intent) {
  if (intent === "OTRA_FECHA") return true;
  if ((msg || "").includes("otra fecha")) return true;
  if ((msg || "").includes("cambiar fecha")) return true;
  return false;
}

/* =========================
   UTIL: ids de botones / intents
   ========================= */

function overrideIntentFromButtonId(rawText) {
  const t = (rawText || "").trim();

  if (t === "SI") return "SI";
  if (t === "NO") return "NO";
  if (t === "SALIR") return "SALIR";

  if (t === "AGENDA_1") return "AGENDA_1";
  if (t === "AGENDA_2") return "AGENDA_2";
  if (t === "AGENDA_3") return "AGENDA_3";

  if (t === "AGENDAR_OTRA") return "AGENDAR_OTRA";

  // ✅ NUEVO: fecha por botones
  if (t === "DATE_TODAY") return "DATE_TODAY";
  if (t === "DATE_TOMORROW") return "DATE_TOMORROW";
  if (t === "DATE_PICK_WEEK") return "DATE_PICK_WEEK";

  return null;
}


function mapIntentAgendaToName(intent, msg) {
  let agenda = null;

  if (intent === "AGENDA_1") agenda = "agenda1";
  if (intent === "AGENDA_2") agenda = "agenda2";
  if (intent === "AGENDA_3") agenda = "agenda3";

  // fallback por texto libre
  if (!agenda && (msg || "").includes("agenda1")) agenda = "agenda1";
  if (!agenda && (msg || "").includes("agenda2")) agenda = "agenda2";
  if (!agenda && (msg || "").includes("agenda3")) agenda = "agenda3";

  return agenda;
}

function slotsToListRows(slots) {
  return slots.map((s) => {
    const dt = s?.start?.dateTime || "";
    const [fecha, hora] = dt.split("T");
    const hhmm = (hora || "").substring(0, 5);

    return {
      id: s.event_id, // ✅ vuelve como list_reply.id
      title: hhmm,
      description: fecha
    };
  });
}

function tpl(texto, vars = {}) {
  let out = texto || "";
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return out;
}

function buildWeekRowsNext7Days() {
  const today = new Date();
  const rows = [];

  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const ymd = toYMD(d); // YYYY-MM-DD
    const title = `${weekdayShortEs(d)} ${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}`;
    rows.push({
      id: `DATE:${ymd}`,
      title,
      description: ymd
    });
  }

  rows.push({
    id: "OTRA_FECHA",
    title: "Otra fecha (escribir)",
    description: "Ingresar dd-mm-aaaa"
  });

  return rows;
}


/* =========================
   FLUJO PRINCIPAL
   ========================= */

export async function procesarMensajeEntrante({ from, texto }) {
  if (!from) return;

  const msg = normalizarTexto(texto);
  const estado = leerEstado(from) || {};

  // 1) Si viene desde botones/listas, forzamos intent (más confiable)
  const forcedIntent = overrideIntentFromButtonId(texto);

  // 2) Intent normal (texto)
  const intent = forcedIntent || detectarIntent(msg, cfg.intents);

  // -------------------------
  // Comandos globales
  // -------------------------
  if (intent === "SALUDO") {
    limpiarEstado(from);

    await enviarBotonesWhatsApp({
      to: from,
      body: cfg.mensajes.bienvenida,
      buttons: [
        { id: "SI", title: cfg.mensajes.boton_si },
        { id: "NO", title: cfg.mensajes.boton_no }
      ]
    });

    guardarEstado(from, { step: "ASK_CONFIRM" });
    return;
  }

  // "agendar" fuerza iniciar flujo directo
  if (intent === "AGENDA") {
    limpiarEstado(from);

    await enviarBotonesWhatsApp({
      to: from,
      body: cfg.mensajes.pedir_agenda_botones,
      buttons: [
        { id: "AGENDA_1", title: cfg.mensajes.boton_agenda1 },
        { id: "AGENDA_2", title: cfg.mensajes.boton_agenda2 },
        { id: "AGENDA_3", title: cfg.mensajes.boton_agenda3 }
      ]
    });

    guardarEstado(from, { step: "AWAIT_AGENDA" });
    return;
  }

  if (esSalir(msg, intent)) {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.rechazo });
    limpiarEstado(from);
    return;
  }

  // -------------------------
  // 0) Confirmación inicial (SI/NO)
  // -------------------------
  if (estado.step === "ASK_CONFIRM") {
    if (intent === "SI") {
      await enviarBotonesWhatsApp({
        to: from,
        body: cfg.mensajes.pedir_agenda_botones,
        buttons: [
          { id: "AGENDA_1", title: cfg.mensajes.boton_agenda1 },
          { id: "AGENDA_2", title: cfg.mensajes.boton_agenda2 },
          { id: "AGENDA_3", title: cfg.mensajes.boton_agenda3 }
        ]
      });

      guardarEstado(from, { step: "AWAIT_AGENDA" });
      return;
    }

    if (intent === "NO") {
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.rechazo });
      limpiarEstado(from);
      return;
    }

    await enviarBotonesWhatsApp({
      to: from,
      body: cfg.mensajes.usar_botones || cfg.mensajes.fallback,
      buttons: [
        { id: "SI", title: cfg.mensajes.boton_si },
        { id: "NO", title: cfg.mensajes.boton_no }
      ]
    });
    return;
  }

  // -------------------------
  // AFTER_CONFIRM: despedida + siguiente acción
  // -------------------------
  if (estado.step === "AFTER_CONFIRM") {
    if (intent === "ACK") {
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.despedida });
      limpiarEstado(from);
      return;
    }

    if (intent === "AGENDAR_OTRA" || intent === "AGENDA") {
      await enviarBotonesWhatsApp({
        to: from,
        body: cfg.mensajes.pedir_agenda_botones,
        buttons: [
          { id: "AGENDA_1", title: cfg.mensajes.boton_agenda1 },
          { id: "AGENDA_2", title: cfg.mensajes.boton_agenda2 },
          { id: "AGENDA_3", title: cfg.mensajes.boton_agenda3 }
        ]
      });

      guardarEstado(from, { step: "AWAIT_AGENDA" });
      return;
    }

    if (intent === "SALIR" || intent === "NO") {
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.despedida });
      limpiarEstado(from);
      return;
    }

    await enviarBotonesWhatsApp({
      to: from,
      body: cfg.mensajes.necesitas_algo_mas || cfg.mensajes.confirmada,
      buttons: [
        { id: "AGENDAR_OTRA", title: cfg.mensajes.boton_agendar_otra },
        { id: "SALIR", title: cfg.mensajes.boton_salir }
      ]
    });
    return;
  }

  // -------------------------
  // 1) Esperando agenda
  // -------------------------
  if (estado.step === "AWAIT_AGENDA") {
    const agenda = mapIntentAgendaToName(intent, msg);

    if (!agenda) {
      await enviarBotonesWhatsApp({
        to: from,
        body: cfg.mensajes.agenda_invalida,
        buttons: [
          { id: "AGENDA_1", title: cfg.mensajes.boton_agenda1 },
          { id: "AGENDA_2", title: cfg.mensajes.boton_agenda2 },
          { id: "AGENDA_3", title: cfg.mensajes.boton_agenda3 }
        ]
      });
      return;
    }

    // ✅ guardamos la agenda seleccionada y pedimos nombre
    guardarEstado(from, { step: "AWAIT_NAME", agenda });

    await enviarMensajeWhatsApp({
      to: from,
      body: cfg.mensajes.pedir_nombre
    });
    return;
  }

  // -------------------------
  // 2) Esperando nombre
  // -------------------------
  if (estado.step === "AWAIT_NAME") {
    const nombre = validarNombre(texto);
    if (!nombre) {
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.nombre_invalido });
      return;
    }

    guardarEstado(from, { step: "AWAIT_DATE", agenda: estado.agenda, nombre });

    await enviarBotonesWhatsApp({
      to: from,
      body: cfg.mensajes.pedir_fecha_botones,
      buttons: [
        { id: "DATE_TODAY", title: cfg.mensajes.boton_hoy },
        { id: "DATE_TOMORROW", title: cfg.mensajes.boton_manana },
        { id: "DATE_PICK_WEEK", title: cfg.mensajes.boton_elegir_dia }
      ]
    });
    return;
  }

  // -------------------------
  // 3) Esperando fecha
  //    - Botones: DATE_TODAY / DATE_TOMORROW / DATE_PICK_WEEK
  //    - Lista:   LIST:DATE:YYYY-MM-DD / LIST:OTRA_FECHA
  //    - Manual:  dd-mm-aaaa
  // -------------------------
  if (estado.step === "AWAIT_DATE") {
    // ✅ Si eligió "Elegir día" -> List Message con próximos 7 días
    if (intent === "DATE_PICK_WEEK") {
      await enviarListaWhatsApp({
        to: from,
        body: cfg.mensajes.pedir_fecha_lista,
        buttonText: cfg.mensajes.fecha_lista_boton,
        sectionTitle: cfg.mensajes.fecha_lista_section,
        rows: buildWeekRowsNext7Days()
      });
      return;
    }

    // ✅ Si eligió "Otra fecha (escribir)" desde lista
    if ((texto || "").trim() === "LIST:OTRA_FECHA") {
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_fecha_manual || cfg.mensajes.pedir_fecha });
      return;
    }

    // ✅ Captura fecha desde lista: LIST:DATE:YYYY-MM-DD
    let yyyyMMdd = "";
    const raw = (texto || "").trim();
    if (raw.startsWith("LIST:DATE:")) {
      yyyyMMdd = raw.replace("LIST:DATE:", "").trim();
    }

    // ✅ Hoy / Mañana por botón
    if (!yyyyMMdd && (intent === "DATE_TODAY" || intent === "DATE_TOMORROW")) {
      const base = new Date();
      const d = intent === "DATE_TOMORROW" ? addDays(base, 1) : base;
      yyyyMMdd = toYMD(d);
    }

    // ✅ Manual (dd-mm-aaaa)
    if (!yyyyMMdd) {
      if (esOtraFecha(msg, intent)) {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_fecha_manual || cfg.mensajes.pedir_fecha });
        return;
      }

      const fecha = parseFecha(texto);
      if (!fecha) {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fecha_invalida });
        return;
      }
      yyyyMMdd = `${fecha.anio}-${fecha.mes}-${fecha.dia}`;
    }

    const timeMinIso = `${yyyyMMdd}T00:00:00-03:00`;
    const timeMaxIso = `${yyyyMMdd}T23:59:59-03:00`;

    await enviarMensajeWhatsApp({
      to: from,
      body: tpl(cfg.mensajes.buscando, { fecha: yyyyMMdd })
    });

    try {
      const resp = await listarSlotsDisponiblesDjango({
        agenda: estado.agenda,
        timeMinIso,
        timeMaxIso,
        maxResults: 100
      });

      const slots = resp?.slots || [];
      if (slots.length === 0) {
        await enviarMensajeWhatsApp({
          to: from,
          body: tpl(cfg.mensajes.sin_horarios, { fecha: yyyyMMdd })
        });

        // ✅ volvemos a mostrar botones de fecha para no forzar formato manual
        guardarEstado(from, { ...estado, step: "AWAIT_DATE" });

        await enviarBotonesWhatsApp({
          to: from,
          body: cfg.mensajes.pedir_fecha_botones,
          buttons: [
            { id: "DATE_TODAY", title: cfg.mensajes.boton_hoy },
            { id: "DATE_TOMORROW", title: cfg.mensajes.boton_manana },
            { id: "DATE_PICK_WEEK", title: cfg.mensajes.boton_elegir_dia }
          ]
        });
        return;
      }

      const top = slots.slice(0, 12); // máximo 12
      const rows = slotsToListRows(top);

      await enviarListaWhatsApp({
        to: from,
        body: tpl(cfg.mensajes.slots_title, { fecha: yyyyMMdd }),
        buttonText: cfg.mensajes.slots_button,
        sectionTitle: cfg.mensajes.slots_section,
        rows
      });

      guardarEstado(from, {
        step: "AWAIT_SLOT_CHOICE",
        agenda: estado.agenda,
        nombre: estado.nombre,
        fecha: yyyyMMdd,
        slots: top
      });
      return;
    } catch (err) {
      console.error("❌ Error listando slots:", err?.response?.data || err.message);

      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.error });

      guardarEstado(from, { ...estado, step: "AWAIT_DATE" });
      return;
    }
  }

  // -------------------------
  // 4) Esperando selección de slot
  //    - LIST:<event_id> (desde lista)
  //    - número (fallback)
  // -------------------------
  if (estado.step === "AWAIT_SLOT_CHOICE") {
    if (esOtraFecha(msg, intent)) {
      guardarEstado(from, { step: "AWAIT_DATE", agenda: estado.agenda, nombre: estado.nombre });

      await enviarBotonesWhatsApp({
        to: from,
        body: cfg.mensajes.pedir_fecha_botones,
        buttons: [
          { id: "DATE_TODAY", title: cfg.mensajes.boton_hoy },
          { id: "DATE_TOMORROW", title: cfg.mensajes.boton_manana },
          { id: "DATE_PICK_WEEK", title: cfg.mensajes.boton_elegir_dia }
        ]
      });
      return;
    }

    // ✅ Selección desde List Message
    if ((texto || "").startsWith("LIST:")) {
      const eventId = (texto || "").replace("LIST:", "").trim();

      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.confirmando });

      try {
        const result = await reservarSlotDjango({
          agenda: estado.agenda,
          eventId,
          customer_name: estado.nombre,
          customer_phone: from,
          notes: "Reserva desde WhatsApp"
        });

        const start = result?.start?.dateTime || "";
        const [f, h] = start.split("T");
        const hhmm = (h || "").substring(0, 5);

        await enviarBotonesWhatsApp({
          to: from,
          body: tpl(cfg.mensajes.confirmada, { fecha: f, hora: hhmm, nombre: estado.nombre }),
          buttons: [
            { id: "AGENDAR_OTRA", title: cfg.mensajes.boton_agendar_otra },
            { id: "SALIR", title: cfg.mensajes.boton_salir }
          ]
        });

        guardarEstado(from, { step: "AFTER_CONFIRM" });
        return;
      } catch (err) {
        const status = err?.response?.status;

        if (status === 409) {
          await enviarMensajeWhatsApp({
            to: from,
            body: cfg.mensajes.slot_no_disponible || cfg.mensajes.error
          });
          guardarEstado(from, { step: "AWAIT_DATE", agenda: estado.agenda, nombre: estado.nombre });
          return;
        }

        console.error("❌ Error reservando slot:", err?.response?.data || err.message);

        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.error });

        guardarEstado(from, { step: "AWAIT_DATE", agenda: estado.agenda, nombre: estado.nombre });
        return;
      }
    }

    // Fallback si llega un número
    const slots = Array.isArray(estado.slots) ? estado.slots : [];
    if (slots.length === 0) {
      guardarEstado(from, { step: "AWAIT_DATE", agenda: estado.agenda, nombre: estado.nombre });

      await enviarBotonesWhatsApp({
        to: from,
        body: cfg.mensajes.pedir_fecha_botones,
        buttons: [
          { id: "DATE_TODAY", title: cfg.mensajes.boton_hoy },
          { id: "DATE_TOMORROW", title: cfg.mensajes.boton_manana },
          { id: "DATE_PICK_WEEK", title: cfg.mensajes.boton_elegir_dia }
        ]
      });
      return;
    }

    const choice = parseInt((texto || "").trim(), 10);
    if (!choice || choice < 1 || choice > slots.length) {
      await enviarMensajeWhatsApp({
        to: from,
        body: cfg.mensajes.opcion_invalida || cfg.mensajes.fallback
      });
      return;
    }

    const selected = slots[choice - 1];
    const eventId = selected?.event_id;

    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.confirmando });

    try {
      const result = await reservarSlotDjango({
        agenda: estado.agenda,
        eventId,
        customer_name: estado.nombre,
        customer_phone: from,
        notes: "Reserva desde WhatsApp"
      });

      const start = result?.start?.dateTime || selected?.start?.dateTime || "";
      const [f, h] = start.split("T");
      const hhmm = (h || "").substring(0, 5);

      await enviarBotonesWhatsApp({
        to: from,
        body: tpl(cfg.mensajes.confirmada, { fecha: f, hora: hhmm, nombre: estado.nombre }),
        buttons: [
          { id: "AGENDAR_OTRA", title: cfg.mensajes.boton_agendar_otra },
          { id: "SALIR", title: cfg.mensajes.boton_salir }
        ]
      });

      guardarEstado(from, { step: "AFTER_CONFIRM" });
      return;
    } catch (err) {
      const status = err?.response?.status;

      if (status === 409) {
        await enviarMensajeWhatsApp({
          to: from,
          body: cfg.mensajes.slot_no_disponible || cfg.mensajes.error
        });
        guardarEstado(from, { step: "AWAIT_DATE", agenda: estado.agenda, nombre: estado.nombre });
        return;
      }

      console.error("❌ Error reservando slot:", err?.response?.data || err.message);

      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.error });

      guardarEstado(from, { step: "AWAIT_DATE", agenda: estado.agenda, nombre: estado.nombre });
      return;
    }
  }

  // -------------------------
  // 5) Flujo inicial por intents (cuando NO hay estado)
  // -------------------------
  if (intent === "SI") {
    await enviarBotonesWhatsApp({
      to: from,
      body: cfg.mensajes.pedir_agenda_botones,
      buttons: [
        { id: "AGENDA_1", title: cfg.mensajes.boton_agenda1 },
        { id: "AGENDA_2", title: cfg.mensajes.boton_agenda2 },
        { id: "AGENDA_3", title: cfg.mensajes.boton_agenda3 }
      ]
    });
    guardarEstado(from, { step: "AWAIT_AGENDA" });
    return;
  }

  if (intent === "NO") {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.rechazo });
    limpiarEstado(from);
    return;
  }

  // fallback general
  await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fallback });
}
