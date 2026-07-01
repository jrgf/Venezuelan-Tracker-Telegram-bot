# Bot de Telegram de Ayuda Sismo — Venezuela 2026

Un bot de Telegram ligero, seguro y optimizado para producción, diseñado para coordinar la asistencia humanitaria y la localización de personas tras el sismo de Venezuela de 2026. 

El bot consume directamente las APIs públicas de **Localizados Venezuela**, **SOS Venezuela**, **AcopioVE** y **ResponseGrid** en tiempo real mediante long polling nativo de Telegram (`getUpdates`), ofreciendo información consolidada de forma instantánea sin requerir base de datos local ni webhook público expuesto.

---

## Características Clave

*   **Búsqueda Dual y Fusión Inteligente (Smart Fusion)**:
    *   Al buscar una persona por nombre o cédula, el bot consulta en paralelo la API de **Localizados Venezuela** y la API de **SOS Venezuela**.
    *   **Algoritmo de De-duplicación**: Unifica las respuestas duplicadas utilizando coincidencia exacta sobre el nombre normalizado (removiendo mayúsculas, acentos y espacios innecesarios).
    *   **Priorización de Estatus**: Muestra el estado prioritario de **LOCALIZADO (Confirmado)** si una persona figura en un centro de salud o albergue oficial, anexando notas y reportes comunitarios previos de la red SOS, junto con los enlaces web de ambas plataformas.
*   **Integración de APIs en Tiempo Real**:
    *   **Localizados Venezuela**: Consulta de personas localizadas en centros de salud y refugios autorizados.
    *   **SOS Venezuela**: Registro comunitario de personas desaparecidas o reportadas a salvo. Incluye sección de "Similares" sugeridos en SOS si no hay coincidencia exacta del nombre.
    *   **AcopioVE (Refugios y Centros de Donación)**: Ubica albergues activos y puntos de donación por ciudad, mostrando dirección, estado de ocupación (abierto/lleno) y necesidades inmediatas.
    *   **ResponseGrid (Necesidades de Ayuda)**: Consulta en tiempo real las solicitudes activas de insumos, recursos y voluntariado validadas por coordinadores de emergencia, con soporte para filtros de categoría e intenciones de prioridad.
    *   **Directorio de Emergencia**: Acceso directo al listado oficial de números de primera respuesta del país.
*   **Telemetría de Analíticas Anónimas (PostHog)**:
    *   Integra analíticas en segundo plano (peticiones asíncronas no bloqueantes) con **PostHog** para recopilar métricas de volumen de uso y tipos de comandos solicitados de forma anónima.
*   **Blindaje de Seguridad (OWASP Top 10)**:
    *   Sanitización estricta de variables dinámicas mediante algoritmos XML/HTML escaping para neutralizar inyecciones de código HTML maliciosos, y rate limiting integrado a nivel de proceso en memoria para descartar spam de comandos.
*   **Formato Visual Limpio (HTML)**:
    *   Los mensajes enviados a Telegram están optimizados con formato HTML nativo (como `<b>`, `<i>`, y `<code>`) para una lectura organizada y estética.
    *   Implementa un fallback automático a texto plano en caso de que ocurra algún error de escape de caracteres HTML, garantizando que el bot nunca deje de responder al usuario.
*   **Caché en Memoria Local**:
    *   Implementa un sistema de caché por TTL (`Map` nativo de JS) para evitar exceder el rate-limit de las APIs externas:
        *   Directorio de Emergencias: 5 minutos.
        *   Búsquedas de Refugios/Acopio: 2 minutos.
        *   Necesidades de Ayuda (ResponseGrid): 2 minutos.
        *   Búsquedas de Personas (Búsqueda Dual): 1 minuto.

---

## Configuración de Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto. Las variables requeridas son:

| Variable | Descripción | Valor Ejemplo |
| :--- | :--- | :--- |
| **`TELEGRAM_BOT_TOKEN`** | Token de autorización del bot (entregado por @BotFather). | `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ` |
| **`SITE_URL`** | URL del portal web oficial de búsqueda de personas localizadas. | `https://localizadosvenezuela.com` |
| **`POSTHOG_API_KEY`** | Clave del proyecto de PostHog para analíticas de tráfico anónimas (opcional). | `phc_tu_clave_publica_posthog` |

---

## Instalación y Despliegue

### Paso 1: Configurar el Entorno
1. Copia la plantilla de variables o crea tu archivo `.env`:
   ```bash
   cp .env.example .env
   ```
2. Completa los valores en el archivo `.env` de tu servidor.

### Paso 2: Despliegue local (Desarrollo)
```bash
npm install
npm run dev
```

### Paso 3: Despliegue en Producción (Docker)
Inicia el bot usando Docker Compose de forma aislada:
```bash
docker compose -f docker-compose-prod.yml up -d --build telegram_bot_sismo
```

---

## Comandos del Bot (Uso en Telegram)

El bot procesa dinámicamente los siguientes mensajes y comandos:

*   **Menú de Ayuda**: Envía `/start`, `/ayuda`, `/help`, `hola` o `#` para ver el menú principal interactivo de comandos.
*   **Búsqueda de Personas**: Envía el nombre completo de la persona o su Cédula de Identidad (mínimo 4 números) para buscar registros confirmados en hospitales y refugios de forma unificada en ambas redes de búsqueda (Localizados VE + SOS Venezuela).
*   **Búsqueda de Refugios**: Envía la palabra `refugio` sola para ver todos los albergues, o incluye la ciudad (ej: `refugio Caracas` o `refugio La Guaira`) para ver los específicos de una localidad.
*   **Centros de Acopio Consolidados**: Envía la palabra `acopio` o `donar` seguida de la ciudad (ej: `acopio Valencia`) para ubicar de forma unificada y de-duplicada los centros de recolección de víveres de AcopioVE y de ResponseGrid.
*   **Necesidades Urgentes con Filtros**: Envía la palabra `necesidad` sola o con filtros de tipo, prioridad o ciudad (ej: `necesidad agua`, `necesidad urgente caracas`, `necesidad alimentos`) vía ResponseGrid.
*   **Resumen de la Emergencia (Estadísticas)**: Envía la palabra `resumen` o `estadísticas` para ver un reporte numérico y categorizado del estado actual de insumos y puntos de ayuda activos en la emergencia.
*   **Números de Emergencia**: Envía la palabra `emergencia` o `telefono` (o `/telefonos`) para obtener el directorio telefónico de ayuda.
