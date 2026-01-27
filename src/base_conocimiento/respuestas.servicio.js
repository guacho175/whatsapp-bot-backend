import fs from "fs";

const ruta = new URL("./respuestas.json", import.meta.url);



export function obtenerRespuesta(texto) {
  const data = JSON.parse(fs.readFileSync(ruta, "utf-8"));
  const msg = (texto || "").toLowerCase();

  for (const regla of data.reglas) {
    for (const clave of regla.palabras_clave) {
      if (msg.includes(clave)) {
        return regla.respuesta;
      }
    }
  }
  return data.fallback;
}
