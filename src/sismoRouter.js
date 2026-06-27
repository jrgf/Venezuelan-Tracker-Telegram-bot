const axios = require('axios');
const config = require('./config');
const { sendText } = require('./services/telegram');

function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

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
            "🇻🇪 <b>Buscador de Personas Localizadas — Terremoto Venezuela 2026</b> 🇻🇪",
            "",
            "Este servicio automatizado te permite consultar si un familiar o conocido se encuentra en las listas de personas localizadas en centros de asistencia, hospitales o refugios oficiales.",
            "",
            "📢 <b>¿Cómo realizar una búsqueda?</b>",
            "• <b>Por cédula</b>: Envía el número de cédula (mínimo 4 dígitos). Ejemplo: <code>17849208</code>",
            "• <b>Por nombre</b>: Envía el nombre y/o apellido de la persona. Ejemplo: <code>Johanna Aguero</code>",
            "",
            "💡 <i>Nota: La base de datos se alimenta en tiempo real con reportes oficiales de personas localizadas.</i>"
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
    const isCedula = /^\d+$/.test(queryText);
    const limit = isCedula ? 6 : 100;

    try {
        const response = await axios.get(`${siteUrl}/api/v1/localizados`, {
            params: {
                q: queryText,
                page: 1,
                limit
            },
            timeout: 8000
        });

        const rows = response.data?.data || [];
        let total = 0;
        let hasMore = false;
        let displayRows = [];

        if (isCedula) {
            total = response.data?.meta?.total || rows.length;
            displayRows = rows.slice(0, 5);
            hasMore = total > 5 || rows.length > 5;
        } else {
            const queryWords = normalizeText(queryText).split(/\s+/).filter(Boolean);
            const filteredRows = rows.filter(row => {
                const normalizedName = normalizeText(row.nombreCompleto);
                return queryWords.every(word => normalizedName.includes(word));
            });
            total = filteredRows.length;
            displayRows = filteredRows.slice(0, 5);
            hasMore = filteredRows.length > 5;
        }

        if (displayRows.length === 0) {
            const noResults = [
                `🔍 No se encontraron registros para: "${escapeHtml(queryText)}"`,
                "",
                "Ten en cuenta lo siguiente:",
                "• Este registro contiene únicamente personas ya localizadas y confirmadas.",
                "• Asegúrate de escribir el nombre o la cédula correctamente.",
                "",
                `🔗 También puedes buscar en la web oficial: ${siteUrl}/buscar?q=${encodeURIComponent(queryText)}`
            ].join('\n');
            return sendText(jid, noResults);
        }

        let responseMessage = `🔍 <b>Resultados para: "${escapeHtml(queryText)}"</b> (Encontrados: ${total}):\n\n`;

        for (const row of displayRows) {
            responseMessage += `👤 <b>${escapeHtml((row.nombreCompleto || '').toUpperCase())}</b>\n`;
            if (row.cedula) responseMessage += `🆔 Cédula: ${escapeHtml(row.cedula)}\n`;
            if (row.edad) responseMessage += `🎂 Edad: ${escapeHtml(row.edad)} años\n`;
            responseMessage += `🏥 Hospital/Refugio: ${escapeHtml(row.lugarNombre || 'No especificado')}\n`;
            
            const nota = row.observaciones || (row.condicion !== 'desconocido' ? row.condicion : '');
            if (nota) responseMessage += `ℹ️ Nota: ${escapeHtml(nota)}\n`;
            
            responseMessage += `🔗 Ficha: ${siteUrl}/localizados/${row.slug}\n`;
            responseMessage += `-------------------\n\n`;
        }

        if (hasMore) {
            responseMessage += `⚠️ <i>Hay más resultados coincidentes. Puedes verlos todos buscando en la web:</i> \n🔗 ${siteUrl}/buscar?q=${encodeURIComponent(queryText)}`;
        } else {
            responseMessage += `🔗 <i>Ver más información en:</i> \n${siteUrl}`;
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
