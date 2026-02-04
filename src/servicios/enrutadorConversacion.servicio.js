import { obtenerNegocio, obtenerServicios, obtenerPreguntasFrecuentes } from "./contenidoNegocio.servicio.js";
import { filasMenuPrincipal, textoMenuPrincipal, uiMenuPrincipal } from "./menuPrincipal.servicio.js";
import {
  listarCategorias,
  listarServiciosPorCategoria,
  obtenerDetalleServicio,
  textoDetalleServicio
} from "./catalogoServicios.servicio.js";
import { listarPreguntas, obtenerRespuesta } from "./faq.servicio.js";

/**
 * Contrato esperado del "whatsapp adapter":
 * - enviarTexto(to, body)
 * - enviarBotones(to, body, buttons)
 * - enviarLista(to, body, buttonText, sectionTitle, rows)
 */

function botonVolverMenu() {
  return [{ id: "MENU|VOLVER", title: "Volver al menú" }];
}

function filasCategorias(categorias) {
  return categorias.map((c) => ({
    id: `CAT|${c.id}`,
    title: c.titulo,
    description: ""
  }));
}

function filasServicios(servicios) {
  return servicios.map((s) => ({
    id: `SERV|${s.id}`,
    title: s.nombre,
    description: s.duracion_min ? `Duración aprox: ${s.duracion_min} min` : ""
  }));
}

function filasPreguntas(pregs) {
  return pregs.map((p) => ({
    id: `FAQ|${p.id}`,
    title: p.pregunta,
    description: ""
  }));
}

/**
 * ✅ FIX:
 * El botón del detalle NO debe enviar agenda_key del servicio (scizer),
 * debe enviar el bucket de categoría (aparatología) para filtrar slots.
 *
 * Antes:  AGENDAR|<calendario_key>|<agenda_key>
 * Ahora:  AGENDAR|<bucket_key>|<servicio_id>
 *
 * Usamos el título de categoría en minúsculas (mantiene tildes) para que coincida
 * con los buckets reales que devuelve Django. El filtro igual lo normalizamos.
 */
function botonAgendarServicio(det) {
  const bucketKey = String(det?.categoria?.titulo || det?.categoria?.calendario_key || "")
    .trim()
    .toLowerCase();

  return [{ id: `AGENDAR|${bucketKey}|${det.id}`, title: "Agendar este servicio" }];
}

async function mostrarMenuPrincipal(whatsapp, to) {
  const negocio = obtenerNegocio();
  const body = textoMenuPrincipal(negocio.nombre);
  const ui = uiMenuPrincipal();

  return whatsapp.enviarLista(to, body, ui.buttonText, ui.sectionTitle, filasMenuPrincipal());
}

async function mostrarCategorias(whatsapp, to) {
  const serviciosJson = obtenerServicios();
  const cats = listarCategorias(serviciosJson);

  return whatsapp.enviarLista(
    to,
    "Elige una categoría:",
    "Ver categorías",
    "Categorías",
    filasCategorias(cats).concat([{ id: "MENU|VOLVER", title: "Volver al menú", description: "" }])
  );
}

async function mostrarServiciosDeCategoria(whatsapp, to, categoriaId) {
  const serviciosJson = obtenerServicios();
  const data = listarServiciosPorCategoria(serviciosJson, categoriaId);
  if (!data) return whatsapp.enviarBotones(to, "No encontré esa categoría 😕", botonVolverMenu());

  const rows = filasServicios(data.servicios);
  rows.push({ id: "MENU|VOLVER", title: "Volver al menú", description: "" });

  return whatsapp.enviarLista(
    to,
    `Categoría: *${data.categoria.titulo}*\nElige un servicio:`,
    "Ver servicios",
    "Servicios",
    rows
  );
}

async function mostrarDetalleServicio(whatsapp, to, servicioId) {
  const serviciosJson = obtenerServicios();
  const det = obtenerDetalleServicio(serviciosJson, servicioId);
  if (!det) return whatsapp.enviarBotones(to, "No encontré ese servicio 😕", botonVolverMenu());

  return whatsapp.enviarBotones(to, textoDetalleServicio(det), botonAgendarServicio(det).concat(botonVolverMenu()));
}

async function mostrarFaq(whatsapp, to) {
  const faqJson = obtenerPreguntasFrecuentes();
  const pregs = listarPreguntas(faqJson);

  const rows = filasPreguntas(pregs);
  rows.push({ id: "MENU|VOLVER", title: "Volver al menú", description: "" });

  return whatsapp.enviarLista(to, "Preguntas frecuentes:", "Ver preguntas", "FAQ", rows);
}

async function mostrarRespuestaFaq(whatsapp, to, preguntaId) {
  const faqJson = obtenerPreguntasFrecuentes();
  const p = obtenerRespuesta(faqJson, preguntaId);
  if (!p) return whatsapp.enviarBotones(to, "No encontré esa pregunta 😕", botonVolverMenu());

  return whatsapp.enviarBotones(to, `*${p.pregunta}*\n\n${p.respuesta}`, botonVolverMenu());
}

async function mostrarContacto(whatsapp, to) {
  const negocio = obtenerNegocio();
  const c = negocio.contacto;

  const body = `*Contacto*
📍 ${c.direccion}
🕒 Lun-Vie: ${c.horario.lunes_a_viernes}
🕒 Sáb: ${c.horario.sabado}
📞 Tel: ${c.telefono}
💬 WhatsApp: ${c.whatsapp}
📷 Instagram: ${c.instagram}

*Política de seña*
${negocio.politicas.sena}`;

  return whatsapp.enviarBotones(to, body, botonVolverMenu());
}

/**
 * Entrada principal:
 * - buttonId: viene de botón o lista
 * Retorna:
 * - null si ya respondió
 * - { accion:"DELEGAR_AGENDAMIENTO", payload:{...} } si hay que entrar al flujo de agenda
 */
export async function manejarNavegacion({ whatsapp, to, buttonId = "", texto = "" }) {
  const t = (texto || "").trim().toLowerCase();

  if (["hola", "menu", "menú", "inicio"].includes(t)) {
    await mostrarMenuPrincipal(whatsapp, to);
    return null;
  }

  if (buttonId) {
    const [tipo, a, b] = buttonId.split("|");

    if (tipo === "MENU") {
      if (a === "VOLVER") { await mostrarMenuPrincipal(whatsapp, to); return null; }
      if (a === "AGENDAR") return { accion: "DELEGAR_AGENDAMIENTO", payload: { modo: "menu" } };
      if (a === "SERVICIOS") { await mostrarCategorias(whatsapp, to); return null; }
      if (a === "FAQ") { await mostrarFaq(whatsapp, to); return null; }
      if (a === "CONTACTO") { await mostrarContacto(whatsapp, to); return null; }
      if (a === "HUMANO") { await whatsapp.enviarBotones(to, "Perfecto. Te derivaré con un humano ✅", botonVolverMenu()); return null; }
    }

    if (tipo === "CAT") { await mostrarServiciosDeCategoria(whatsapp, to, a); return null; }
    if (tipo === "SERV") { await mostrarDetalleServicio(whatsapp, to, a); return null; }
    if (tipo === "FAQ") { await mostrarRespuestaFaq(whatsapp, to, a); return null; }

    if (tipo === "AGENDAR") {
      // ✅ Ahora: AGENDAR|bucket_key|servicio_id
      return { accion: "DELEGAR_AGENDAMIENTO", payload: { bucket_key: a, servicio_id: b } };
    }
  }

  if (t.includes("servicio")) { await mostrarCategorias(whatsapp, to); return null; }
  if (t.includes("pregunta") || t.includes("faq")) { await mostrarFaq(whatsapp, to); return null; }
  if (t.includes("contacto") || t.includes("direc") || t.includes("horario")) { await mostrarContacto(whatsapp, to); return null; }
  if (t.includes("agendar") || t.includes("turno") || t.includes("cita")) return { accion: "DELEGAR_AGENDAMIENTO", payload: { modo: "texto" } };

  await mostrarMenuPrincipal(whatsapp, to);
  return null;
}
