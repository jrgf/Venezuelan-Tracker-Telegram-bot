const axios = require('axios');
const config = require('./config');
const { sendText } = require('./services/telegram');
const cache = require('./utils/cache');

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

    // 1. Mensaje de Bienvenida y Menú de Ayuda
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
            "🇻🇪 <b>Asistente de Ayuda Sismo — Venezuela 2026</b> 🇻🇪",
            "",
            "Este servicio automatizado te permite consultar información en tiempo real para la asistencia humanitaria.",
            "",
            "🔍 <b>1. Buscar Personas Localizadas</b> (en hospitales/refugios):",
            "• Envía el número de cédula (mínimo 4 dígitos). Ejemplo: <code>17849208</code>",
            "• Envía el nombre y/o apellido de la persona. Ejemplo: <code>Johanna Aguero</code>",
            "",
            "🏠 <b>2. Buscar Refugios Activos</b>:",
            "• Envía la palabra <b>refugio</b> y opcionalmente la ciudad. Ejemplo: <code>refugio Caracas</code> o <code>refugio La Guaira</code>",
            "",
            "📦 <b>3. Centros de Acopio (Donaciones)</b>:",
            "• Envía la palabra <b>acopio</b> y la ciudad. Ejemplo: <code>acopio Valencia</code> o <code>acopio Caracas</code>",
            "",
            "🚨 <b>4. Teléfonos de Emergencia</b>:",
            "• Escribe la palabra <b>emergencia</b> o <b>telefono</b> para ver el directorio de primera respuesta.",
            "",
            "💡 <i>Nota: Datos actualizados de forma colaborativa por voluntarios y reportes oficiales de SOS Venezuela y AcopioVE.</i>"
        ].join('\n');
        return sendText(jid, welcome);
    }

    if (command && !command.startsWith('/telefonos') && !command.startsWith('/centros')) {
        return;
    }

    // 2. Directorio de Emergencia
    if (
        lowerQueryText === 'emergencia' ||
        lowerQueryText === 'emergencias' ||
        lowerQueryText === 'telefono' ||
        lowerQueryText === 'telefonos' ||
        lowerQueryText === '/telefonos'
    ) {
        const cacheKey = 'emergencias';
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return sendText(jid, cachedData);
        }

        try {
            const response = await axios.get('https://api.acopiove.org/v1/telefonos', { timeout: 8000 });
            const telefonos = response.data?.data || [];
            
            if (telefonos.length === 0) {
                return sendText(jid, "⚠️ No se encontraron números de emergencia registrados en el directorio en este momento.");
            }

            let responseMessage = "🚨 <b>Directorio de Emergencia y Primera Respuesta</b> 🚨\n\n";
            const limitList = telefonos.slice(0, 10);

            for (const tel of limitList) {
                responseMessage += `📞 <b>${escapeHtml(tel.entity || 'Servicio de Emergencia')}</b>\n`;
                if (tel.number) responseMessage += `Número: <b>${escapeHtml(tel.number)}</b>\n`;
                if (tel.city || tel.state) responseMessage += `Ubicación: ${escapeHtml([tel.city, tel.state].filter(Boolean).join(', '))}\n`;
                if (tel.description) responseMessage += `Nota: ${escapeHtml(tel.description)}\n`;
                responseMessage += `-------------------\n\n`;
            }

            responseMessage += "🔗 <i>Ver directorio completo en:</i> \nhttps://acopiove.org";
            
            const finalMsg = responseMessage.trim();
            cache.set(cacheKey, finalMsg, 300); // 5 minutos de caché
            return sendText(jid, finalMsg);
        } catch (err) {
            console.error('[AcopioVE] Error fetching telefonos:', err.message);
            return sendText(jid, "⚠️ Ocurrió un error al obtener el directorio de emergencias. Por favor, intenta de nuevo.");
        }
    }

    // 3. Buscar Refugios Activos (AcopioVE API)
    if (lowerQueryText.startsWith('refugio')) {
        const parts = queryText.split(/\s+/);
        let ciudad = parts.slice(1).join(' ').trim();

        if (ciudad.toLowerCase().startsWith('en ')) {
            ciudad = ciudad.slice(3).trim();
        } else if (ciudad.toLowerCase().startsWith('de ')) {
            ciudad = ciudad.slice(3).trim();
        }

        const cacheKey = `refugios:${ciudad}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return sendText(jid, cachedData);
        }

        try {
            const params = { tipo: 'refugio' };
            if (ciudad) {
                params.ciudad = ciudad;
            }

            const response = await axios.get('https://api.acopiove.org/v1/centros', { params, timeout: 8000 });
            const refugios = response.data?.data || [];

            if (refugios.length === 0) {
                const noRefMsg = ciudad 
                    ? `🔍 No se encontraron refugios registrados en la ciudad de "${escapeHtml(ciudad)}".`
                    : "🔍 No se encontraron refugios activos registrados en este momento.";
                return sendText(jid, noRefMsg);
            }

            const displayRefugios = refugios.slice(0, 5);
            const total = response.data?.meta?.count || refugios.length;

            let responseMessage = ciudad 
                ? `🏥 <b>Refugios en ${escapeHtml(ciudad)}</b> (Encontrados: ${total}):\n\n`
                : `🏥 <b>Refugios Activos</b> (Encontrados: ${total}):\n\n`;

            for (const ref of displayRefugios) {
                const estado = ref.estado || '';
                const estadoEmoji = estado === 'abierto' ? '🟢' : (estado === 'lleno' ? '🟡' : '🔴');
                responseMessage += `🏠 <b>${escapeHtml(ref.name)}</b> (${estadoEmoji} ${escapeHtml(estado.toUpperCase())})\n`;
                if (ref.address) responseMessage += `📍 Dirección: ${escapeHtml(ref.address)}\n`;
                if (ref.necesita_ahora) responseMessage += `📦 Necesita ahora: ${escapeHtml(ref.necesita_ahora)}\n`;
                if (ref.contacto) responseMessage += `📞 Contacto: ${escapeHtml(ref.contacto)}\n`;
                responseMessage += `-------------------\n\n`;
            }

            if (total > 5) {
                responseMessage += `🔗 <i>Hay más refugios. Ver listado completo en:</i> \nhttps://acopiove.org/refugios`;
            } else {
                responseMessage += `🔗 <i>Más información en:</i> \nhttps://acopiove.org`;
            }

            const finalMsg = responseMessage.trim();
            cache.set(cacheKey, finalMsg, 120); // 2 minutos de caché
            return sendText(jid, finalMsg);
        } catch (err) {
            console.error('[AcopioVE] Error fetching refugios:', err.message);
            return sendText(jid, "⚠️ Ocurrió un error al obtener la lista de refugios. Por favor, intenta de nuevo.");
        }
    }

    // 4. Buscar Centros de Acopio (AcopioVE API)
    if (lowerQueryText.startsWith('acopio') || lowerQueryText.startsWith('donar') || command.startsWith('/centros')) {
        const parts = queryText.split(/\s+/);
        let ciudad = parts.slice(1).join(' ').trim();

        if (ciudad.toLowerCase().startsWith('en ')) {
            ciudad = ciudad.slice(3).trim();
        } else if (ciudad.toLowerCase().startsWith('de ')) {
            ciudad = ciudad.slice(3).trim();
        }

        if (!ciudad) {
            return sendText(jid, "⚠️ Por favor, indica la ciudad para buscar centros de acopio. Ejemplo: `acopio Caracas` o `acopio Valencia`.");
        }

        const cacheKey = `acopio:${ciudad}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return sendText(jid, cachedData);
        }

        try {
            const response = await axios.get('https://api.acopiove.org/v1/centros', {
                params: {
                    tipo: 'acopio',
                    ciudad: ciudad
                },
                timeout: 8000
            });
            const centros = response.data?.data || [];

            if (centros.length === 0) {
                const noCtrMsg = `🔍 No se encontraron centros de acopio activos en la ciudad de "${escapeHtml(ciudad)}".`;
                return sendText(jid, noCtrMsg);
            }

            const displayCentros = centros.slice(0, 5);
            const total = response.data?.meta?.count || centros.length;

            let responseMessage = `📦 <b>Centros de Acopio en ${escapeHtml(ciudad)}</b> (Encontrados: ${total}):\n\n`;

            for (const ctr of displayCentros) {
                const estado = ctr.estado || '';
                const estadoEmoji = estado === 'abierto' ? '🟢' : (estado === 'lleno' ? '🟡' : '🔴');
                responseMessage += `🏢 <b>${escapeHtml(ctr.name)}</b> (${estadoEmoji} ${escapeHtml(estado.toUpperCase())})\n`;
                if (ctr.address) responseMessage += `📍 Dirección: ${escapeHtml(ctr.address)}\n`;
                if (ctr.necesita_ahora) responseMessage += `📦 Necesita: ${escapeHtml(ctr.necesita_ahora)}\n`;
                if (ctr.contacto) responseMessage += `📞 Contacto: ${escapeHtml(ctr.contacto)}\n`;
                responseMessage += `-------------------\n\n`;
            }

            if (total > 5) {
                responseMessage += `🔗 <i>Hay más centros. Ver todos en el mapa:</i> \nhttps://acopiove.org`;
            } else {
                responseMessage += `🔗 <i>Más detalles en:</i> \nhttps://acopiove.org`;
            }

            const finalMsg = responseMessage.trim();
            cache.set(cacheKey, finalMsg, 120); // 2 minutos de caché
            return sendText(jid, finalMsg);
        } catch (err) {
            console.error('[AcopioVE] Error fetching acopio:', err.message);
            return sendText(jid, "⚠️ Ocurrió un error al buscar centros de acopio. Por favor, intenta de nuevo.");
        }
    }

    // 5. Búsqueda de Personas por Defecto (Fusión de Localizados + SOS Venezuela)
    if (queryText.length < 2) {
        return sendText(
            jid,
            "⚠️ La consulta es muy corta. Por favor, escribe al menos 2 caracteres para iniciar la búsqueda.",
        );
    }

    const cacheKey = `personas:${queryText}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
        return sendText(jid, cachedData);
    }

    const siteUrl = config.siteUrl;
    const isCedula = /^\d+$/.test(queryText);
    const limit = isCedula ? 6 : 100;

    try {
        const [locResult, sosResult] = await Promise.allSettled([
            axios.get(`${siteUrl}/api/v1/localizados`, {
                params: {
                    q: queryText,
                    page: 1,
                    limit
                },
                timeout: 8000
            }),
            axios.get('https://sosvenezuela2026.com/api/persons/list', {
                params: {
                    q: queryText
                },
                timeout: 8000
            })
        ]);

        const locRows = locResult.status === 'fulfilled' ? (locResult.value.data?.data || []) : [];
        const sosRows = sosResult.status === 'fulfilled' ? (sosResult.value.data || []) : [];

        const consolidated = [];

        // Agregar de Localizados Venezuela
        for (const loc of locRows) {
            consolidated.push({
                nombre: loc.nombreCompleto,
                cedula: loc.cedula,
                edad: loc.edad,
                lugar: loc.lugarNombre || 'No especificado',
                nota: loc.observaciones || (loc.condicion !== 'desconocido' ? loc.condicion : ''),
                fuente: 'LocalizadosVE',
                slug: loc.slug,
                estado: 'localizado',
                idSos: null,
                parroquiaSos: null,
                statusSos: null
            });
        }

        // Unificar con SOS Venezuela
        for (const sos of sosRows) {
            const normNameSos = normalizeText(sos.display_name);
            const matchIndex = consolidated.findIndex(item => normalizeText(item.nombre) === normNameSos);

            if (matchIndex !== -1) {
                const existing = consolidated[matchIndex];
                existing.idSos = sos.id;
                existing.parroquiaSos = sos.parroquia;
                existing.statusSos = sos.status;
                
                const notaSos = sos.status === 'seeking_info' 
                    ? '(Reportado inicialmente como desaparecido en la comunidad)' 
                    : '(Confirmado también hallado en red SOS)';
                existing.nota = existing.nota ? `${existing.nota} ${notaSos}` : notaSos;
            } else {
                const estado = sos.status === 'seeking_info' ? 'desaparecido' : 'hallado';
                consolidated.push({
                    nombre: sos.display_name,
                    cedula: sos.cedula_masked,
                    edad: null,
                    lugar: sos.hospital_name || sos.parroquia || 'No especificado',
                    nota: sos.status === 'seeking_info' ? 'Reportado como desaparecido' : 'Reportado hallado con vida',
                    fuente: 'SOSVE',
                    slug: null,
                    estado: estado,
                    idSos: sos.id,
                    parroquiaSos: sos.parroquia,
                    statusSos: sos.status
                });
            }
        }

        // Filtrar estrictamente por palabras clave si no es cédula
        let finalFiltered = consolidated;
        if (!isCedula) {
            const queryWords = normalizeText(queryText).split(/\s+/).filter(Boolean);
            finalFiltered = consolidated.filter(p => {
                const normalizedName = normalizeText(p.nombre);
                return queryWords.every(word => normalizedName.includes(word));
            });
        }

        // Búsqueda de similares de SOS si no hay coincidencias exactas
        const similarSosRows = !isCedula && finalFiltered.length === 0
            ? sosRows.slice(0, 3)
            : [];

        const total = finalFiltered.length;
        const displayRows = finalFiltered.slice(0, 5);
        const hasMore = finalFiltered.length > displayRows.length;

        if (displayRows.length === 0 && similarSosRows.length === 0) {
            const noResults = [
                `🔍 No se encontraron registros para: "${escapeHtml(queryText)}"`,
                "",
                "Ten en cuenta lo siguiente:",
                "• El registro oficial contiene únicamente personas ya localizadas.",
                "• El registro comunitario SOS contiene reportes de búsqueda.",
                "• Asegúrate de escribir el nombre o la cédula correctamente.",
                "",
                `🔗 También puedes buscar en la web oficial: ${siteUrl}/buscar?q=${encodeURIComponent(queryText)}`
            ].join('\n');
            
            cache.set(cacheKey, noResults, 60);
            return sendText(jid, noResults);
        }

        let responseMessage = displayRows.length > 0
            ? `🔍 <b>Resultados unificados para: "${escapeHtml(queryText)}"</b> (Encontrados: ${total}):\n\n`
            : `🔍 No se encontraron coincidencias exactas para: "${escapeHtml(queryText)}"\n\n`;

        for (const row of displayRows) {
            responseMessage += `👤 <b>${escapeHtml(row.nombre.toUpperCase())}</b>\n`;
            if (row.cedula) responseMessage += `🆔 Cédula: ${escapeHtml(row.cedula)}\n`;
            if (row.edad) responseMessage += `🎂 Edad: ${escapeHtml(row.edad)} años\n`;

            if (row.fuente === 'LocalizadosVE') {
                responseMessage += `🏥 Hospital/Refugio: ${escapeHtml(row.lugar)}\n`;
                responseMessage += `🟢 Estatus: LOCALIZADO (Confirmado)\n`;
                if (row.nota) responseMessage += `ℹ️ Nota: ${escapeHtml(row.nota)}\n`;
                responseMessage += `🔗 Ficha: ${siteUrl}/localizados/${row.slug}\n`;
            } else {
                const estatusEmoji = row.estado === 'desaparecido' ? '🔴' : '🟢';
                const statusLabel = SOS_STATUS[row.statusSos] || (row.estado === 'desaparecido' ? 'Buscando información' : 'Localizado/a con vida');
                responseMessage += `${estatusEmoji} Estatus: ${escapeHtml(statusLabel)} (Reporte Comunitario)\n`;
                if (row.lugar) responseMessage += `📍 Lugar/Refugio: ${escapeHtml(row.lugar)}\n`;
                if (row.nota) responseMessage += `ℹ️ Nota: ${escapeHtml(row.nota)}\n`;
                responseMessage += `🔗 Ficha: https://sosvenezuela2026.com (Comunidad)\n`;
            }
            responseMessage += `-------------------\n\n`;
        }

        if (similarSosRows.length > 0) {
            responseMessage += `🔎 <b>Similares en SOS Venezuela 2026</b>\n`;
            responseMessage += `<i>No son coincidencias exactas por nombre.</i>\n\n`;

            for (const row of similarSosRows) {
                const statusLabel = SOS_STATUS[row.status] || row.status || 'Buscando información';
                const lugar = row.hospital_name || row.parroquia || row.municipio || 'No especificado';
                responseMessage += `👤 <b>${escapeHtml((row.display_name || '').toUpperCase())}</b>\n`;
                responseMessage += `🏥 Hospital/Refugio: ${escapeHtml(lugar)}\n`;
                responseMessage += `ℹ️ Nota: SOS Venezuela 2026: ${escapeHtml(statusLabel)}\n`;
                responseMessage += `-------------------\n\n`;
            }
        }

        if (hasMore) {
            responseMessage += `⚠️ <i>Hay más resultados coincidentes en las fuentes consultadas.</i>\n🔗 ${siteUrl}/buscar?q=${encodeURIComponent(queryText)}`;
        } else if (displayRows.length > 0) {
            responseMessage += `🔗 <i>Ver más información en:</i> \n${siteUrl}`;
        }

        const finalMsg = responseMessage.trim();
        cache.set(cacheKey, finalMsg, 60);
        return sendText(jid, finalMsg);
    } catch (err) {
        console.error('[Sismo] Error calling consolidated APIs:', err.message);
        return sendText(
            jid,
            "⚠️ Ocurrió un error al procesar tu búsqueda. Por favor, intenta de nuevo más tarde.",
        );
    }
}

module.exports = { routeMessage };
