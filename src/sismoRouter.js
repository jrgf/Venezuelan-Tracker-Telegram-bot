const axios = require('axios');
const config = require('./config');
const { sendText } = require('./services/telegram');

async function routeMessage(parsed) {
    const jid = parsed.remoteJid;
    const text = parsed.text?.trim() || '';

    if (parsed.messageType !== 'text') {
        return;
    }

    const queryText = text.trim();
    const lowerQueryText = queryText.toLowerCase();
    const command = lowerQueryText.startsWith('/')
        ? lowerQueryText.split(/\s+/, 1)[0].split('@', 1)[0]
        : '';

    if (
        queryText === '#' ||
        command === '/start' ||
        command === '/ayuda' ||
        command === '/help' ||
        lowerQueryText === 'hola' ||
        lowerQueryText === 'ayuda' ||
        lowerQueryText === 'help'
    ) {
        const welcome = [
            "🇻🇪 *Buscador de Personas Localizadas — Terremoto Venezuela 2026* 🇻🇪",
            "",
            "Este servicio automatizado te permite consultar si un familiar o conocido se encuentra en las listas de personas localizadas en centros de asistencia, hospitales o refugios oficiales.",
            "",
            "📢 *¿Cómo realizar una búsqueda?*",
            "• *Por cédula*: Envía el número de cédula (mínimo 4 dígitos). Ejemplo: `17849208`",
            "• *Por nombre*: Envía el nombre y/o apellido de la persona. Ejemplo: `Johanna Aguero`",
            "",
            "💡 _Nota: La base de datos se alimenta en tiempo real con reportes oficiales de personas localizadas._"
        ].join('\n');
        return sendText(jid, welcome);
    }

    if (command) {
        return;
    }

    if (queryText.length < 2) {
        return sendText(
            jid,
            "⚠️ La consulta es muy corta. Por favor, escribe al menos 2 caracteres para iniciar la búsqueda.",
        );
    }

    const siteUrl = config.siteUrl;

    try {
        const response = await axios.get(`${siteUrl}/api/v1/localizados`, {
            params: {
                q: queryText,
                page: 1,
                limit: 6
            },
            timeout: 8000
        });

        const rows = response.data?.data || [];
        const total = response.data?.meta?.total || rows.length;

        if (rows.length === 0) {
            const noResults = [
                `🔍 No se encontraron registros para: "${queryText}"`,
                "",
                "Ten en cuenta lo siguiente:",
                "• Este registro contiene únicamente personas ya localizadas y confirmadas.",
                "• Asegúrate de escribir el nombre o la cédula correctamente.",
                "",
                `🔗 También puedes buscar en la web oficial: ${siteUrl}/buscar?q=${encodeURIComponent(queryText)}`
            ].join('\n');
            return sendText(jid, noResults);
        }

        const displayRows = rows.slice(0, 5);
        const hasMore = total > 5 || rows.length > 5;

        let responseMessage = `🔍 *Resultados para: "${queryText}"* (Encontrados: ${total}):\n\n`;

        for (const row of displayRows) {
            responseMessage += `👤 *${(row.nombreCompleto || '').toUpperCase()}*\n`;
            if (row.cedula) responseMessage += `🆔 Cédula: ${row.cedula}\n`;
            if (row.edad) responseMessage += `🎂 Edad: ${row.edad} años\n`;
            responseMessage += `🏥 Hospital/Refugio: ${row.lugarNombre || 'No especificado'}\n`;
            
            const nota = row.observaciones || (row.condicion !== 'desconocido' ? row.condicion : '');
            if (nota) responseMessage += `ℹ️ Nota: ${nota}\n`;
            
            responseMessage += `🔗 Ficha: ${siteUrl}/localizados/${row.slug}\n`;
            responseMessage += `-------------------\n\n`;
        }

        if (hasMore) {
            responseMessage += `⚠️ _Hay más resultados coincidentes. Puedes verlos todos buscando en la web:_ \n🔗 ${siteUrl}/buscar?q=${encodeURIComponent(queryText)}`;
        } else {
            responseMessage += `🔗 _Ver más información en:_ \n${siteUrl}`;
        }

        return sendText(jid, responseMessage.trim());
    } catch (err) {
        console.error('[Sismo] Error calling Localizados API:', err.message);
        return sendText(
            jid,
            "⚠️ Ocurrió un error al procesar tu búsqueda. Por favor, intenta de nuevo más tarde.",
        );
    }
}

module.exports = { routeMessage };
