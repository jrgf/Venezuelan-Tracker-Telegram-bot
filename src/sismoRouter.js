const axios = require('axios');
const config = require('./config');
const { sendText } = require('./services/telegram');

const SOS_PERSONS_URL = 'https://sosvenezuela2026.com/api/persons/list';
const SOS_STATUS = {
    found_alive: 'Localizado/a con vida',
    seeking_info: 'Buscando información',
    found_deceased: 'Fallecido/a'
};

function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizeName(text) {
    return normalizeText(text)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function wordsFromQuery(text) {
    return normalizeText(text).split(/\s+/).filter(Boolean);
}

function containsAllWords(text, words) {
    const normalized = normalizeText(text);
    return words.every(word => normalized.includes(word));
}

function localizadosText(row) {
    return [
        row.nombreCompleto,
        row.cedula,
        row.lugarNombre,
        row.observaciones,
        row.condicion
    ].filter(Boolean).join(' ');
}

function mapSosRow(row) {
    const status = SOS_STATUS[row.status] || row.status || 'Sin estado';

    return {
        nombreCompleto: row.display_name || 'Persona reportada',
        cedula: row.cedula_masked,
        lugarNombre: row.hospital_name || row.parroquia || row.municipio,
        observaciones: `SOS Venezuela 2026: ${status}`,
        condicion: 'desconocido'
    };
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
            "🇻🇪 <b>Buscador de Personas — Terremoto Venezuela 2026</b> 🇻🇪",
            "",
            "Este servicio automatizado te permite consultar si un familiar o conocido se encuentra en listas de personas localizadas o reportadas por fuentes de apoyo.",
            "",
            "📢 <b>¿Cómo realizar una búsqueda?</b>",
            "• <b>Por cédula</b>: Envía el número de cédula (mínimo 4 dígitos). Ejemplo: <code>17849208</code>",
            "• <b>Por nombre</b>: Envía el nombre y/o apellido de la persona. Ejemplo: <code>Johanna Aguero</code>",
            "",
            "💡 <i>Nota: La búsqueda cruza registros localizados y reportes de SOS Venezuela 2026.</i>"
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
        console.info('[Sismo] Cross-check search started', {
            type: isCedula ? 'cedula' : 'text',
            queryLength: queryText.length
        });

        const [localizadosResult, sosResult] = await Promise.allSettled([
            axios.get(`${siteUrl}/api/v1/localizados`, {
                params: {
                    q: queryText,
                    page: 1,
                    limit
                },
                timeout: 8000
            }),
            axios.get(SOS_PERSONS_URL, {
                params: {
                    q: queryText
                },
                timeout: 8000
            })
        ]);

        console.info('[Sismo] Cross-check API results', {
            localizados: localizadosResult.status,
            sos: sosResult.status
        });

        if (localizadosResult.status === 'rejected' && sosResult.status === 'rejected') {
            throw localizadosResult.reason;
        }
        if (localizadosResult.status === 'rejected') {
            console.error('[Sismo] Error calling Localizados API:', localizadosResult.reason.message);
        }
        if (sosResult.status === 'rejected') {
            console.error('[Sismo] Error calling SOS API:', sosResult.reason.message);
        }

        const localResponse = localizadosResult.status === 'fulfilled' ? localizadosResult.value : null;
        const localRows = localResponse?.data?.data || [];
        const localTotal = isCedula ? (localResponse?.data?.meta?.total ?? localRows.length) : 0;
        const sosRows = sosResult.status === 'fulfilled' && Array.isArray(sosResult.value.data)
            ? sosResult.value.data
            : [];
        const queryWords = wordsFromQuery(queryText);
        const filteredLocalRows = isCedula
            ? localRows
            : localRows.filter(row => containsAllWords(localizadosText(row), queryWords));
        const sosExactRows = isCedula
            ? []
            : sosRows.filter(row => normalizeName(row.display_name) === normalizeName(queryText));
        const filteredSosRows = sosExactRows.map(mapSosRow);
        const rows = [...filteredLocalRows, ...filteredSosRows];
        const similarSosRows = !isCedula && rows.length === 0
            ? sosRows.slice(0, 3).map(mapSosRow)
            : [];
        const total = (isCedula ? localTotal : filteredLocalRows.length) + filteredSosRows.length;
        const displayRows = rows.slice(0, 5);
        const hasMore = total > displayRows.length;
        console.info('[Sismo] Cross-check search completed', {
            localizadosMatches: filteredLocalRows.length,
            sosMatches: filteredSosRows.length,
            sosSimilar: similarSosRows.length,
            total,
            displayed: displayRows.length
        });

        if (displayRows.length === 0 && similarSosRows.length === 0) {
            const noResults = [
                `🔍 No se encontraron registros para: "${escapeHtml(queryText)}"`,
                "",
                "Ten en cuenta lo siguiente:",
                "• La búsqueda cruza registros localizados y reportes de SOS Venezuela 2026.",
                "• Asegúrate de escribir el nombre o la cédula correctamente.",
                "",
                `🔗 También puedes buscar en la web oficial: ${siteUrl}/buscar?q=${encodeURIComponent(queryText)}`
            ].join('\n');
            return sendText(jid, noResults);
        }

        let responseMessage = displayRows.length > 0
            ? `🔍 <b>Resultados para: "${escapeHtml(queryText)}"</b> (Encontrados: ${total}):\n\n`
            : `🔍 No se encontraron coincidencias exactas para: "${escapeHtml(queryText)}"\n\n`;

        for (const row of displayRows) {
            responseMessage += `👤 <b>${escapeHtml((row.nombreCompleto || '').toUpperCase())}</b>\n`;
            if (row.cedula) responseMessage += `🆔 Cédula: ${escapeHtml(row.cedula)}\n`;
            if (row.edad) responseMessage += `🎂 Edad: ${escapeHtml(row.edad)} años\n`;
            responseMessage += `🏥 Hospital/Refugio: ${escapeHtml(row.lugarNombre || 'No especificado')}\n`;

            const nota = row.observaciones || (row.condicion !== 'desconocido' ? row.condicion : '');
            if (nota) responseMessage += `ℹ️ Nota: ${escapeHtml(nota)}\n`;

            if (row.slug) {
                responseMessage += `🔗 Ficha: ${siteUrl}/localizados/${row.slug}\n`;
            }
            responseMessage += `-------------------\n\n`;
        }

        if (similarSosRows.length > 0) {
            responseMessage += `🔎 <b>Similares en SOS Venezuela 2026</b>\n`;
            responseMessage += `<i>No son coincidencias exactas por nombre.</i>\n\n`;

            for (const row of similarSosRows) {
                responseMessage += `👤 <b>${escapeHtml((row.nombreCompleto || '').toUpperCase())}</b>\n`;
                responseMessage += `🏥 Hospital/Refugio: ${escapeHtml(row.lugarNombre || 'No especificado')}\n`;
                responseMessage += `ℹ️ Nota: ${escapeHtml(row.observaciones)}\n`;
                responseMessage += `-------------------\n\n`;
            }
        }

        if (hasMore) {
            responseMessage += `⚠️ <i>Hay más resultados coincidentes en las fuentes consultadas.</i>\n🔗 ${siteUrl}/buscar?q=${encodeURIComponent(queryText)}`;
        } else if (displayRows.length > 0) {
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
