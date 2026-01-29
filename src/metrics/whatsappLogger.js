import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_PATH = path.join(LOG_DIR, "whatsapp_messages.jsonl");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function logWhatsAppEvent(event) {
  ensureLogDir();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...event,
  });
  fs.appendFileSync(LOG_PATH, line + "\n", "utf8");
}

export const WHATSAPP_LOG_PATH = LOG_PATH;
