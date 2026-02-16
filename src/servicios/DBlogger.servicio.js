import db from "./db.servicio.js";
import logger from "./logger.servicio.js" 

/*
* Wrapper para logging en la DB que NO bloque el flujo del bot
* Si hay errores en la DB, se registran en logs pero el bot ocntinua
*/ 

// Cache de usuarios activos (Evita consultas repetidas)    
const userCache = new Map(); // phone -> {userId, conversationId, lastActivity}
const CACHE_TTL = 5 * 60 * 1000; // determinar el tiempo de vida del cache

/** 
* Si el usuario está activo obtiene su conversación, sino existe, crea un usuario y una conversación
* @param {string} phoneRaw - entrada -> número de teléfono
* @returns {Promise<{userId: string, conversationId,+: string}>} - salida
*/

export async function ensureUserAndConversation(phoneRaw) {
  if (!phoneRaw) return null;
  
  try {
    // Revisar cache primero
    const cached = userCache.get(phoneRaw);
    if (cached && (Date.now() - cached.lastActivity) < CACHE_TTL) {
      // Actualizar timestamp de actividad
      cached.lastActivity = Date.now();
      return { userId: cached.userId, conversationId: cached.conversationId };
    }
    
    // Crear o actualizar usuario
    const user = await db.upsertUser(phoneRaw);
    
    // Obtener conversación activa o crear una nueva
    let conversation = await db.getActiveConversation(user.id);
    
    if (!conversation) {
      // Crear nueva conversación
      conversation = await db.createConversation(user.id);
      logger.debug("Nueva conversación creada", { 
        userId: user.id, 
        conversationId: conversation.id 
      });
    } else {
      // Verificar si la conversación es muy antigua (> 24h)
      const hoursSinceStart = (Date.now() - new Date(conversation.started_at).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceStart > 24) {
        // Cerrar conversación antigua y crear nueva
        await db.closeConversation(conversation.id, "completed", "timeout_24h");
        conversation = await db.createConversation(user.id);
        logger.debug("Conversación antigua cerrada, nueva creada", {
          oldConversationId: conversation.id,
          newConversationId: conversation.id
        });
      }
    }
    
    // Actualizar cache
    userCache.set(phoneRaw, {
      userId: user.id,
      conversationId: conversation.id,
      lastActivity: Date.now()
    });
    
    return {
      userId: user.id,
      conversationId: conversation.id
    };
    
  } catch (error) {
    logger.error("Error en ensureUserAndConversation (DB logging disabled)", {
      error: error?.message || error,
      phone: phoneRaw
    });
    return null;
  }
}

/** 
 * Registra un mensaje entrante
 * @param {Object} params // -> objeto con parametros 
*/
export async function logIncomingMessage({ phoneRaw, messageType, content, payload, waMessageId }) {
  try {
    const context = await ensureUserAndConversation(phoneRaw);
    if (!context) return; // Si no hay contexto -> db caida

    await db.insertMessage({
      conversationId: context.conversationId,
      userId: context.userId,
      direction: "incoming",
      messageType,
      content: content.substring(0, 500) || "", // max 500 chars
      payload, 
      waMessageId,
      waStatus: "received"
    });
    
    logger.debug("Mensaje entrante registrado en la DB", {
      conversationId: context.conversationId,
      messageType
    });
  } catch (error) {
    logger.error("Error registrando mensaje entrante en la DB", {
      error: error?.message || error,
      phone: phoneRaw
    });
  }
}

/**
 * Registra un mensaje saliente
 * @param {object} params -> objeto con parametros
 */
export async function logOutgoingMessage({ phoneRaw, messageType, content, payload, waMessageId, waStatus }) {
  try {
    const context = await ensureUserAndConversation(phoneRaw);
    if (!context) return;

    await db.insertMessage({
      conversationId: context.conversationId,
      userId: context.userId,
      direction: "outgoing",
      messageType,
      content: content?.substring(0, 500) || "",
      payload,
      waMessageId,
      waStatus: waStatus || "sent"
    });

    logger.debug("Mensaje saliente registrado en la DB", {
      conversationId: context.conversationId,
      messageType
    });

  } catch (error) {
    looger.error("Error registrando el mensaje saliente en la DB", {
      error: error?.message || error,
      phone: phoneRaw
    });
  }
}

/**
 * Registra in evento de menú
 * @param {object} params
 */
exxport 