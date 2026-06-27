# Bot de WhatsApp Localizador de Personas — Terremoto Venezuela (2026)

Un chatbot de WhatsApp ligero, seguro y listo para producción, diseñado para ayudar en la localización de familiares y conocidos afectados por el terremoto de Venezuela de 2026.

Al integrar la **API de Fzap** para la automatización de WhatsApp y utilizar una base de datos local **SQLite** para la persistencia, este bot permite a los usuarios consultar listas consolidadas oficialmente de personas localizadas, pacientes de hospitales y ocupantes de refugios directamente a través de mensajes de WhatsApp.

---

## Características Clave

*   **Autoprovisionamiento Idempotente**: Al iniciar, el bot se conecta automáticamente con la API de Fzap para crear la instancia de WhatsApp (si no existe), inicia la conexión de la sesión (para emparejamiento/generación de código QR) y registra la URL del webhook de forma dinámica.
*   **Búsqueda Inteligente**:
    *   **Por Cédula de Identidad**: Sanitiza la entrada eliminando puntos, guiones y espacios, realizando la búsqueda sobre los dígitos resultantes (requiere un mínimo de 4 dígitos).
    *   **Por Nombre/Palabras clave**: Divide el texto en palabras para realizar búsquedas en los campos de nombre, hospital/refugio, procedencia y notas de la base de datos.
*   **Seguridad contra Condiciones de Carrera**: Implementa una cola de tareas asíncronas (`taskQueue`) agrupada por JID (ID de usuario de WhatsApp), procesando los mensajes entrantes de forma secuencial por usuario mientras permite consultas simultáneas de diferentes personas.
*   **Integración Directa con el Portal Web**: Limita automáticamente la respuesta a un máximo de 5 registros para evitar saturar el canal de WhatsApp. Proporciona un formato limpio en markdown y enlaces directos al buscador web oficial (`SITE_URL`) para realizar consultas extendidas.
*   **Seguridad de Webhook Robustecida**: Protegido mediante limitación de tasa (120 req/min), middleware de seguridad Express (Helmet, cabecera `X-Powered-By` deshabilitada) y validación de firma mediante `FZAP_WEBHOOK_SECRET` utilizando comparaciones HMAC con SHA-256.

---

## Guía de Configuración de Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto (copiado de `.env.example`). A continuación se detallan los parámetros necesarios para ejecutar la aplicación:

| Variable | Descripción | Ejemplo / Valor Recomendado |
| :--- | :--- | :--- |
| **`PORT`** | Puerto en el que corre el servidor Express. | `3000` |
| **`FZAP_API_URL`** | Endpoint de la API de Fzap. | `http://fzap:8080` |
| **`FZAP_API_KEY`** | Token de autorización (ADMIN_TOKEN) que protege los endpoints de Fzap. | `tu_fzap_api_key` |
| **`FZAP_INSTANCE`** | Nombre de la instancia de WhatsApp en Fzap que usará el bot. | `bot_instance` |
| **`FZAP_WEBHOOK_URL`** | URL de callback a donde Fzap enviará los eventos de mensajes. | `http://whatsapp_bot:3000/webhook/messages` |
| **`FZAP_WEBHOOK_SECRET`** | Clave secreta para firmar y verificar la autenticidad del webhook. | `tu_secreto_de_webhook` |
| **`SISMO_DB_PATH`** | Ruta absoluta a la base de datos SQLite con los datos de personas localizadas. | `/app/repo_data/consolidado.db` |
| **`SITE_URL`** | URL del portal web oficial de búsqueda de personas. | `https://localizadosvenezuela.com` |
| **`DB_PATH`** | Ruta a la base de datos SQLite interna para el registro operacional del bot. | `/data/bot.db` |

---

## Esquema de la Base de Datos (SQLite)

La base de datos SQLite en `SISMO_DB_PATH` debe contener una tabla llamada `pacientes` con la siguiente estructura:

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| **`nombre`** | `TEXT` | Nombre completo de la persona localizada. |
| **`cedula`** | `TEXT` | Cédula de Identidad de la persona. |
| **`edad`** | `INTEGER`/`TEXT` | Edad de la persona. |
| **`hospital`** | `TEXT` | Centro asistencial, hospital o refugio donde se encuentra. |
| **`procedencia`** | `TEXT` | Lugar de procedencia o residencia de la persona. |
| **`servicio`** | `TEXT` | Servicio, área o estatus dentro del refugio u hospital. |
| **`nota`** | `TEXT` | Observaciones especiales o estado de salud reportado. |

---

## Instalación y Despliegue

Este proyecto está completamente contenedorizado y se despliega fácilmente con Docker y Docker Compose.

### Paso 1: Configurar el Entorno
1. Copia la plantilla de variables:
   ```bash
   cp .env.example .env
   ```
2. Abre el archivo `.env` y completa los parámetros requeridos según la tabla de configuración. Asegúrate de que las rutas a las bases de datos apunten a los volúmenes persistentes correctos.

### Paso 2: Iniciar los Servicios
Ejecuta el siguiente comando para compilar la imagen del bot e iniciar la API de Fzap junto con la base de datos PostgreSQL y el contenedor del bot:
```bash
docker compose up --build -d
```

### Paso 3: Vincular la Cuenta de WhatsApp
1. Abre el panel de administración de **Fzap Manager** en `http://TU_IP_SERVIDOR:8081`.
2. Selecciona la instancia configurada (`FZAP_INSTANCE`) y escanea el código QR desde la aplicación de WhatsApp en tu teléfono (Dispositivos vinculados -> Vincular un dispositivo).
3. El bot validará el estado automáticamente y comenzará a responder consultas.

---

## Uso del Bot (Comandos de WhatsApp)

*   **Menú de Ayuda / Bienvenida**: Al enviar `hola`, `ayuda`, `help`, `/ayuda`, `/help` o `#`, el bot responderá con las instrucciones de búsqueda y el menú inicial.
*   **Búsqueda por Cédula**: Envía cualquier número de 4 o más dígitos (ej. `12345678`).
*   **Búsqueda por Nombre**: Envía nombres, apellidos o palabras clave combinadas (ej. `Maria Rodriguez Caracas`).
