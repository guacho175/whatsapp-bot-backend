# WhatsApp Bot Backend - Dr. Beauty Mendoza

Backend del chatbot de WhatsApp para **Dr. Beauty Mendoza**, desarrollado en Node.js con Express. Gestiona conversaciones con clientes, agendamiento de citas y servicio de información sobre tratamientos estéticos.

---

## Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Requisitos Previos](#requisitos-previos)
3. [Instalación de Dependencias](#instalación-de-dependencias)
4. [Configuración de la Base de Datos](#configuración-de-la-base-de-datos)
5. [Configuración de Variables de Entorno](#configuración-de-variables-de-entorno)
6. [Ejecución del Programa](#ejecución-del-programa)
7. [Interactuar con el Bot](#interactuar-con-el-bot)
8. [Visualización de Logs](#visualización-de-logs)
9. [Visualización de YAMLs](#visualización-de-yamls)
10. [Estructura del Proyecto](#estructura-del-proyecto)
11. [APIs y Rutas Disponibles](#apis-y-rutas-disponibles)
12. [Configuración de Webhook con Meta](#configuración-de-webhook-con-meta)
13. [Solución de Problemas](#solución-de-problemas)

---

## Descripción General

Este proyecto es un backend de chatbot de WhatsApp que:

- ✅ Recibe mensajes de WhatsApp Cloud API (Meta)
- ✅ Gestiona conversaciones con clientes
- ✅ Proporciona información sobre servicios de estética
- ✅ Integra con Django API para agendamiento de citas
- ✅ Registra conversaciones en archivos YAML
- ✅ Almacena datos en PostgreSQL
- ✅ Soporta integración opcional con Google Gemini AI

---

## Requisitos Previos

| Requisito | Versión Mínima | Descripción |
|-----------|----------------|-------------|
| **Node.js** | 18.0.0 | Runtime de JavaScript |
| **PostgreSQL** | 14.0 | Base de datos relacional |
| **npm** | 8.0+ | Gestor de paquetes de Node |

### Herramientas Adicionales Recomendadas

- **ngrok**: Para exponer el servidor local al webhook de WhatsApp
- **PostgreSQL Client**: DBeaver, pgAdmin o psql para gestionar la base de datos

---

## Instalación de Dependencias

### 1. Navegar al directorio del proyecto

```bash
cd ChatBotDoctorBeauty/whatsapp-bot-backend
```

### 2. Instalar las dependencias

```bash
npm install
```

Este comando installa todas las dependencias definidas en [`package.json`](package.json):

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `express` | ^4.19.2 | Servidor web |
| `pg` | ^8.18.0 | Cliente PostgreSQL |
| `axios` | ^1.13.2 | Cliente HTTP para APIs |
| `dotenv` | ^16.4.5 | Variables de entorno |
| `winston` | ^3.19.0 | Sistema de logging |
| `winston-daily-rotate-file` | ^5.0.0 | Rotación de archivos de log |
| `js-yaml` | ^4.1.1 | Parsing de archivos YAML |

---

## Configuración de la Base de Datos

### 1. Crear la base de datos

Conectarse a PostgreSQL y crear la base de datos:

```bash
psql -U postgres
```

```sql
CREATE DATABASE whatsapp_bot_db;
```

### 2. Ejecutar el schema

Ejecutar el script SQL para crear las tablas:

```bash
psql -U postgres -d whatsapp_bot_db -f schema.sql
```

### 3. Verificar la instalación

Conectar a la base de datos y verificar las tablas:

```bash
psql -U postgres -d whatsapp_bot_db
```

```sql
\dt
```

Deberías ver las siguientes tablas:

- `users` - Clientes únicos del chatbot
- `conversations` - Sesiones de interacción
- `messages` - Todos los mensajes intercambiados
- `menu_events` - Eventos de navegación por menús
- `raw_events` - Eventos crudos para auditoría

---

## Configuración de Variables de Entorno

### 1. Copiar el archivo de ejemplo

El proyecto incluye un archivo `.env` con la configuración. Edita este archivo con tus valores:

```bash
# Editar el archivo .env
notepad .env
```

### 2. Variables requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `PORT` | Puerto del servidor | `3000` |
| `DB_HOST` | Host de PostgreSQL | `localhost` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |
| `DB_NAME` | Nombre de la base de datos | `whatsapp_bot_db` |
| `DB_USER` | Usuario de PostgreSQL | `postgres` |
| `DB_PASSWORD` | Contraseña de PostgreSQL | `tu_password` |
| `META_VERIFY_TOKEN` | Token de verificación del webhook | `mi_token_secreto` |
| `META_WA_ACCESS_TOKEN` | Access Token de WhatsApp Cloud API | `EAA...` |
| `META_WA_PHONE_NUMBER_ID` | Phone Number ID de Meta | `1012820511906792` |

### 3. Variables opcionales

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DJANGO_API_BASE_URL` | URL de la API de Django (agenda) | `http://127.0.0.1:8000` |
| `AI_PROVIDER` | Proveedor de IA (gemini) | `gemini` |
| `GEMINI_API_KEY` | API Key de Google Gemini | `tu_api_key` |

---

## Ejecución del Programa

### 1. Iniciar el servidor

```bash
npm start
```

El servidor se iniciarán en `http://localhost:3000`.

### 2. Exponer con ngrok (para desarrollo)

Para recibir webhooks de WhatsApp, necesitas exponer tu servidor local:

```bash
ngrok http 3000
```

Copia la URL HTTPS que ngrok genera (ej: `https://abc123.ngrok.io`) y configúrala en el panel de desarrolladores de Meta.

### 3. Verificar que el servidor está corriendo

```bash
curl http://localhost:3000/health
```

Debería responder con:

```json
{"ok": true}
```

---

## Interactuar con el Bot

### Configuración del Webhook en Meta

1. Ve a [Meta for Developers](https://developers.facebook.com/)
2. Selecciona tu aplicación de WhatsApp
3. Configura el webhook:
   - **URL de Callback**: `https://TU-NGROK-URL/webhook`
   - **Token de verificación**: El valor de `META_VERIFY_TOKEN` en tu `.env`

### Suscribir el Webhook

En el panel de Meta, suscribe los siguientes campos de webhook:

- `messages`
- `message_template_status_update`

### Prueba de conversación

1. Envía un mensaje de WhatsApp al número de tu negocio
2. El bot debería responder automáticamente

### Flujo de conversación

El bot ofrece las siguientes opciones:

1. **Servicios** - Ver tratamientos faciales, corporales y aparatología
2. **Agendar** - Iniciar proceso de agendamiento de cita
3. **FAQ** - Preguntas frecuentes
4. **Contacto** - Información de contacto y políticas

---

## Visualización de Logs

Los logs se almacenan en la carpeta `logs/` con rotación diaria.

### Ubicación de los logs

```
whatsapp-bot-backend/
└── logs/
    └── app-2026-02-17.log
```

### Ver logs en tiempo real

```bash
# Ver el log de hoy
type logs\app-2026-02-17.log

# O usar tail en Git Bash
tail -f logs/app-2026-02-17.log
```

### Configuración de logging

En [`src/servicios/logger.servicio.js`](src/servicios/logger.servicio.js):

- **Nivel de log**: Configurable con `LOG_LEVEL` (default: `info`)
- **Rotación**: Archivos diarios, se mantienen por 14 días
- **Tamaño máximo**: 20MB por archivo

### Script de prueba de logger

```bash
npm run test:logger
```

---

## Visualización de YAMLs

Los archivos YAML almacenan el historial de conversaciones.

### Ubicación

```
whatsapp-bot-backend/
└── YAMLs/
    └── 2026-02-17_16-24-21_xx-x-xxxx_2a3b8a.yaml
```

### Formato del nombre de archivo

```
YYYY-MM-DD_HH-MM-SS_TELEFONO_IDCORTO.yaml
```

Ejemplo: `2026-02-17_16-24-21_xx-x-xxxx_2a3b8a.yaml`

### Estructura del YAML

```yaml
conversacion:
  id: 2a3b8a0a-f7d6-48b6-960b-e187aaaa7107
  fecha_inicio: 17/2/2026, 04:24:32
  fecha_fin: null
  estado: activa
  intent: null
  outcome: null
usuario:
  telefono: 'xx-x-xxxx'
mensajes:
  - ts: '04:24:33'
    direccion: entrante
    tipo: text
    contenido: hola
  - ts: '04:24:33'
    direccion: saliente
    tipo: list
    contenido: Hola 👋 Soy el asistente...
resumen:
  total_mensajes: 2
  servicios_vistos: []
  intento_agendar: false
  agendamiento_exitoso: false
```

### Ver archivos YAML

```bash
# Listar todos los YAMLs
dir YAMLs

# Ver un YAML específico
type YAMLs\2026-02-17_xx-x-xxxx_2a3b8a.yaml
```

---

## Estructura del Proyecto

```
whatsapp-bot-backend/
├── .env                          # Variables de entorno
├── package.json                  # Dependencias npm
├── schema.sql                    # Esquema de PostgreSQL
├── requirements.txt              # Requerimientos del proyecto
├── test-env.js                   # Script de prueba de variables de entorno
├── comandos_arranque.txt         # Comandos de inicio rápidos
│
├── src/
│   ├── index.js                  # Punto de entrada
│   ├── servidor.js                # Configuración de Express
│   │
│   ├── controladores/
│   │   └── webhook.controlador.js # Manejo de webhooks
│   │
│   ├── rutas/
│   │   ├── webhook.rutas.js       # Rutas de webhook
│   │   └── metrics.rutas.js       # Rutas de métricas
│   │
│   ├── servicios/
│   │   ├── logger.servicio.js             # Logging con Winston
│   │   ├── yamlLogger.servicio.js         # Registro de conversaciones en YAML
│   │   ├── db.servicio.js                 # Conexión a PostgreSQL
│   │   ├── whatsapp.servicio.js           # Envío de mensajes WhatsApp
│   │   ├── autorespuesta.servicio.js      # Lógica de respuestas
│   │   ├── catalogoServicios.servicio.js  # Catálogo de servicios
│   │   ├── djangoAgenda.servicio.js       # Integración con Django API
│   │   ├── enrutadorConversacion.servicio.js # Enrutamiento de conversaciones
│   │   └── ...
│   │
│   ├── base_conocimiento/
│   │   ├── respuestascalendario.json
│   │   └── respuestascalendario.servicio.js
│   │
│   └── metrics/
│       ├── conversationEstimator.js
│       └── whatsappLogger.js
│
├── data/                         # Datos runtime
├── data_config/                  # Configuración del negocio
│   ├── negocio.json              # Información del negocio
│   ├── servicios.json            # Catálogo de servicios
│   └── preguntas_frecuentes.json # FAQ
│
├── scripts/                      # Scripts de utilidad
│   ├── test-db-connection.js     # Prueba de conexión a DB
│   ├── test-normalize-phone.js   # Prueba de normalización de teléfono
│   └── test-logger.js            # Prueba del sistema de logs
│
├── YAMLs/                        # Historial de conversaciones
└── logs/                         # Archivos de log
```

---

## APIs y Rutas Disponibles

### Rutas del Servidor

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | Verificación de estado del servicio |
| `GET` | `/health` | Health check |
| `GET` | `/webhook` | Verificación del webhook (Meta) |
| `POST` | `/webhook` | Recepción de mensajes de WhatsApp |
| `GET` | `/metrics` | Métricas del chatbot |
| `GET` | `/metrics/conversations` | Estadísticas de conversaciones |

---

## Configuración de Webhook con Meta

### Pasos para configurar

1. **Iniciar el servidor local**:
   ```bash
   npm start
   ```

2. **Iniciar ngrok**:
   ```bash
   ngrok http 3000
   ```

3. **Copiar la URL HTTPS de ngrok**

4. **En Meta for Developers**:
   - Ir a Webhooks
   - Configurar URL de callback
   - Usar el `META_VERIFY_TOKEN` de tu `.env`

5. **Suscribir a campos**:
   - `messages`
   - `message_template_status_update`

6. **Verificar con WhatsApp**:
   - Envía un mensaje de prueba al número de WhatsApp

---

## Solución de Problemas

### Error: Cannot find module

Reinstalar las dependencias:

```bash
rm -rf node_modules
npm install
```

### Error de conexión a PostgreSQL

Verificar que PostgreSQL está corriendo:

```bash
# Windows
sc query postgresql

# o
psql -U postgres -c "SELECT 1"
```

### Verificar variables de entorno

Ejecutar el script de prueba:

```bash
node test-env.js
```

### Verificar conexión a la base de datos

```bash
npm run test:db
```

### Los mensajes no llegan al bot

1. Verificar que ngrok está corriendo
2. Confirmar que el webhook está configurado en Meta
3. Revisar los logs en `logs/app-YYYY-MM-DD.log`

### Error al enviar mensajes

Verificar que el `META_WA_ACCESS_TOKEN` es válido y no ha expirado.

---

## Comandos Rápidos de Arranque

```bash
# 1. Instalar dependencias
npm install

# 2. Crear base de datos
psql -U postgres -c "CREATE DATABASE whatsapp_bot_db;"

# 3. Ejecutar schema
psql -U postgres -d whatsapp_bot_db -f schema.sql

# 4. Iniciar servidor
npm start

# 5. En otra terminal, exponer con ngrok
ngrok http 3000
```

---

## Información Adicional

### Tecnologías Utilizadas

- **Runtime**: Node.js 18+
- **Framework Web**: Express.js
- **Base de Datos**: PostgreSQL
- **Mensajería**: WhatsApp Cloud API (Meta)
- **Logging**: Winston
- **Formateo**: YAML

### Configuración Regional

- **Zona horaria**: America/Argentina/Mendoza
- **Idioma**: Español (es-AR)

### Archivos de Configuración del Negocio

- [`data_config/negocio.json`](data_config/negocio.json): Información de contacto y políticas
- [`data_config/servicios.json`](data_config/servicios.json): Catálogo de servicios
- [`data_config/preguntas_frecuentes.json`](data_config/preguntas_frecuentes.json): FAQ

---

## Licencia

Proyecto desarrollado para **Dr. Beauty Mendoza**.
