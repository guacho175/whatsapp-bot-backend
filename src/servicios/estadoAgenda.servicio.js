import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "agenda_state.json");

function asegurarArchivo() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify({}, null, 2), "utf-8");
}

export function leerEstado(from) {
  asegurarArchivo();
  const raw = fs.readFileSync(STATE_FILE, "utf-8");
  const data = JSON.parse(raw || "{}");
  return data[from] || { step: "NEW" };
}

export function guardarEstado(from, estado) {
  asegurarArchivo();
  const raw = fs.readFileSync(STATE_FILE, "utf-8");
  const data = JSON.parse(raw || "{}");
  data[from] = estado;
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function limpiarEstado(from) {
  asegurarArchivo();
  const raw = fs.readFileSync(STATE_FILE, "utf-8");
  const data = JSON.parse(raw || "{}");
  delete data[from];
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), "utf-8");
}
