import { enviarMensajeWhatsApp } from "./whatsapp.servicio.js";
import {
  cargarRespuestasCalendario,
  normalizarTexto,
  detectarIntent
} from "../base_conocimiento/respuestascalendario.servicio.js";
import { leerEstado, guardarEstado, limpiarEstado } from "./estadoAgenda.servicio.js";
import { crearEventoDjango } from "./djangoAgenda.servicio.js";

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

// Acepta: 8:00 | 08:00 | 8.00
function parseHora(texto) {
  if (!texto) return null;

  let clean = texto.toLowerCase().trim().replace(/\s+/g, "");
  const m = clean.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;

  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);

  if (h < 0 || h > 23) return null;
  if (min < 0 || min > 59) return null;

  return { hora: String(h).padStart(2, "0"), minuto: String(min).padStart(2, "0") };
}

function validarNombre(texto) {
  const t = (texto || "").trim();
  if (t.length < 2) return null;
  // Solo letras/espacios/acentos (sin números)
  if (!/^[a-zA-ZÀ-ÿ\u00f1\u00d1\s'-]+$/.test(t)) return null;
  return t;
}

/* =========================
   FLUJO PRINCIPAL
   ========================= */

export async function procesarMensajeEntrante({ from, texto }) {
  if (!from) return;

  const msg = normalizarTexto(texto);
  const estado = leerEstado(from);
  const intent = detectarIntent(msg, cfg.intents);

  // ✅ “comandos globales” para cortar loops o reiniciar flujo
  // Si el usuario escribe "hola" o "agendar" en cualquier momento, reiniciamos limpio.
  if (intent === "SALUDO") {
    limpiarEstado(from);
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.bienvenida });
    guardarEstado(from, { step: "ASK_CONFIRM" });
    return;
  }

  if (intent === "AGENDA") {
    limpiarEstado(from);
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_agenda });
    guardarEstado(from, { step: "AWAIT_AGENDA" });
    return;
  }

  // -------------------------
  // 1) Esperando agenda
  // -------------------------
  if (estado.step === "AWAIT_AGENDA") {
    let agenda = null;
    if (intent === "AGENDA_1") agenda = "agenda1";
    if (intent === "AGENDA_2") agenda = "agenda2";

    if (!agenda) {
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.agenda_invalida });
      return;
    }

    guardarEstado(from, { step: "AWAIT_NAME", agenda });
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_nombre });
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
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_fecha });
    return;
  }

  // -------------------------
  // 3) Esperando fecha
  // -------------------------
  if (estado.step === "AWAIT_DATE") {
    const fecha = parseFecha(texto);
    if (!fecha) {
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fecha_invalida });
      return;
    }

    guardarEstado(from, {
      step: "AWAIT_TIME",
      agenda: estado.agenda,
      nombre: estado.nombre,
      fecha
    });

    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_hora });
    return;
  }

  // -------------------------
  // 4) Esperando hora
  // -------------------------
  if (estado.step === "AWAIT_TIME") {
    const hora = parseHora(texto);
    if (!hora) {
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.hora_invalida });
      return;
    }

    const { fecha, agenda, nombre } = estado;

    const startIso = `${fecha.anio}-${fecha.mes}-${fecha.dia}T${hora.hora}:${hora.minuto}:00-03:00`;

    // Duración fija: 30 minutos
    const start = new Date(startIso);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const endIso =
      `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}` +
      `T${pad(end.getHours())}:${pad(end.getMinutes())}:00-03:00`;

    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.confirmando });

    try {
      await crearEventoDjango({
        agenda,
        summary: `Turno - ${nombre}`,
        startIso,
        endIso,
        description: `Agendado por WhatsApp | Cliente: ${nombre} | Tel: ${from} | Agenda: ${agenda}`
      });

      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.confirmado });
      limpiarEstado(from);
      return;
    } catch (err) {
      console.error("❌ Error creando evento:", err?.response?.data || err.message);

      await enviarMensajeWhatsApp({
        to: from,
        body: "Ocurrió un problema creando el evento 😕. Escribe *agendar* para intentarlo nuevamente."
      });

      // 🔥 clave: cortar el loop
      limpiarEstado(from);
      return;
    }
  }

  // -------------------------
  // 5) Flujo inicial por intents (cuando NO hay estado)
  // -------------------------
  if (intent === "SI") {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_agenda });
    guardarEstado(from, { step: "AWAIT_AGENDA" });
    return;
  }

  if (intent === "NO") {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.rechazo });
    limpiarEstado(from);
    return;
  }

  await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fallback });
}
