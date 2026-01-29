import fs from "fs";

const ruta = new URL("./respuestascalendario.json", import.meta.url);

export function cargarRespuestasCalendario() {
  return JSON.parse(fs.readFileSync(ruta, "utf-8"));
}

export function normalizarTexto(texto) {
  return (texto || "").toLowerCase().trim();
}

export function contieneAlgunaPalabra(msg, palabras) {
  return palabras.some((p) => msg.includes(p));
}

export function detectarIntent(msg, intents) {
  if (contieneAlgunaPalabra(msg, intents.saludo)) return "SALUDO";
  if (contieneAlgunaPalabra(msg, intents.agenda)) return "AGENDA";
  if (contieneAlgunaPalabra(msg, intents.si)) return "SI";
  if (contieneAlgunaPalabra(msg, intents.no)) return "NO";
  if (contieneAlgunaPalabra(msg, intents.agenda_1)) return "AGENDA_1";
  if (contieneAlgunaPalabra(msg, intents.agenda_2)) return "AGENDA_2";
  return "DESCONOCIDO";
}
