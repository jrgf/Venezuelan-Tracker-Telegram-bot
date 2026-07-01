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

function maskCedula(cedula) {
    if (!cedula) return '';
    const clean = String(cedula).trim();
    if (clean.length <= 4) return '***';
    const start = clean.slice(0, 2);
    const end = clean.slice(-3);
    const middle = '*'.repeat(Math.max(3, clean.length - 5));
    return `${start}${middle}${end}`;
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
            "Este servicio automatizado te permite consultar información unificada en tiempo real de <b>SOS Venezuela</b>, <b>AcopioVE</b> y <b>ResponseGrid</b> para la asistencia humanitaria.",
            "",
            "🔍 <b>1. Buscar Personas Localizadas</b>:",
            "• Envía el número de cédula (mínimo 4 dígitos). Ejemplo: <code>17849208</code>",
            "• Envía el nombre y/o apellido. Ejemplo: <code>Pedro Pérez</code>",
            "",
            "🏠 <b>2. Buscar Refugios Activos</b> (AcopioVE):",
            "• Envía <code>refugio</code> + ciudad. Ejemplo: <code>refugio Caracas</code> o <code>refugio La Guaira</code>",
            "",
            "📦 <b>3. Centros de Acopio Consolidados</b> (AcopioVE + ResponseGrid):",
            "• Envía <code>acopio</code> + ciudad. Ejemplo: <code>acopio Valencia</code> o <code>acopio Caracas</code>",
            "",
            "📋 <b>4. Necesidades Urgentes e Insumos</b> (ResponseGrid):",
            "• Envía la palabra <code>necesidad</code> sola o con filtros de tipo, prioridad o ciudad.",
            "• Ejemplos: <code>necesidad agua</code>, <code>necesidad urgente caracas</code>, <code>necesidad alimentos</code>",
            "",
            "📊 <b>5. Resumen de la Emergencia</b> (ResponseGrid):",
            "• Escribe la palabra <code>resumen</code> o <code>estadísticas</code> para ver el estado general y el conteo consolidado de insumos y puntos de ayuda.",
            "",
            "🚨 <b>6. Directorio de Emergencias</b>:",
            "• Escribe la palabra <code>emergencia</code> o <code>telefono</code> para ver el directorio de primera respuesta.",
            "",
            "💡 <i>Nota: Este canal es puramente informativo y de consulta gratuita. Toda la información presentada es verificada de forma oficial y colaborativa por voluntarios en el terreno.</i>"
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

    // 4. Buscar Centros de Acopio Consolidados (AcopioVE API + ResponseGrid API)
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
            const responseGridUrl = process.env.RESPONSEGRID_API_URL || 'https://api.responsegrid.app';
            const emergencyId = process.env.RESPONSEGRID_EMERGENCY_ID || '11111111-1111-4111-8111-111111111111';

            const [acopioVeRes, responseGridRes] = await Promise.all([
                axios.get('https://api.acopiove.org/v1/centros', {
                    params: { tipo: 'acopio', ciudad: ciudad },
                    timeout: 8000
                }).catch(err => {
                    console.error('[AcopioVE] Error fetching acopio:', err.message);
                    return { data: { data: [] } };
                }),
                axios.get(`${responseGridUrl}/emergencies/${emergencyId}/public/resources`, {
                    params: { limit: 100 },
                    timeout: 8000
                }).catch(err => {
                    console.error('[ResponseGrid] Error fetching resources:', err.message);
                    return { data: { items: [] } };
                })
            ]);

            const consolidated = [];

            // 1. Agregar resultados de AcopioVE
            const centrosVe = acopioVeRes.data?.data || [];
            for (const ctr of centrosVe) {
                consolidated.push({
                    source: 'AcopioVE',
                    name: ctr.name,
                    address: ctr.address || '',
                    needs: ctr.necesita_ahora || '',
                    contact: ctr.contacto || '',
                    status: ctr.estado || 'abierto'
                });
            }

            // 2. Agregar resultados de ResponseGrid filtrando por ciudad
            const resourcesRg = responseGridRes.data?.items || [];
            const normCiudad = normalizeText(ciudad);
            for (const res of resourcesRg) {
                const address = res.location?.address || '';
                const city = res.city || '';
                if (normalizeText(address).includes(normCiudad) || normalizeText(city).includes(normCiudad)) {
                    consolidated.push({
                        source: 'ResponseGrid',
                        name: res.name,
                        address: address,
                        needs: Array.isArray(res.accepts) ? res.accepts.join(', ') : '',
                        contact: res.contact || '',
                        status: res.publicStatus === 'active' ? 'abierto' : (res.publicStatus === 'saturated' ? 'lleno' : 'cerrado')
                    });
                }
            }

            if (consolidated.length === 0) {
                const noCtrMsg = `🔍 No se encontraron centros de acopio activos en la ciudad de "${escapeHtml(ciudad)}".`;
                return sendText(jid, noCtrMsg);
            }

            const displayCentros = consolidated.slice(0, 5);
            const total = consolidated.length;

            let responseMessage = `📦 <b>Centros de Acopio en ${escapeHtml(ciudad)}</b> (Encontrados: ${total}):\n\n`;

            for (const ctr of displayCentros) {
                const statusEmoji = ctr.status === 'abierto' ? '🟢' : (ctr.status === 'lleno' ? '🟡' : '🔴');
                responseMessage += `🏢 <b>${escapeHtml(ctr.name)}</b> (${statusEmoji} ${escapeHtml(ctr.status.toUpperCase())}) [${escapeHtml(ctr.source)}]\n`;
                if (ctr.address) responseMessage += `📍 Dirección: ${escapeHtml(ctr.address)}\n`;
                if (ctr.needs) responseMessage += `📦 Acepta: ${escapeHtml(ctr.needs)}\n`;
                if (ctr.contact) responseMessage += `📞 Contacto: ${escapeHtml(ctr.contact)}\n`;
                responseMessage += `-------------------\n\n`;
            }

            responseMessage += `🔗 <i>Ver mapas de ayuda en vivo:</i>\n`;
            responseMessage += `• AcopioVE: https://acopiove.org\n`;
            responseMessage += `• ResponseGrid: https://responsegrid.app`;

            const finalMsg = responseMessage.trim();
            cache.set(cacheKey, finalMsg, 120); // 2 minutos de caché
            return sendText(jid, finalMsg);
        } catch (err) {
            console.error('[AcopioConsolidation] Error:', err.message);
            return sendText(jid, "⚠️ Ocurrió un error al buscar centros de acopio. Por favor, intenta de nuevo.");
        }
    }

    // 5. Buscar Necesidades Urgentes con Filtros Avanzados (ResponseGrid API)
    if (lowerQueryText.startsWith('necesidad') || lowerQueryText.startsWith('necesidades') || lowerQueryText.startsWith('insumos')) {
        const parts = queryText.split(/\s+/);
        let terms = parts.slice(1);

        // Mapear categorías y prioridades
        let category = null;
        let priority = null;
        const remainingTerms = [];

        const categoryMap = {
            agua: 'water',
            comida: 'food',
            alimento: 'food',
            alimentos: 'food',
            higiene: 'hygiene',
            ropa: 'clothing',
            vestimenta: 'clothing',
            refugio: 'shelter',
            albergue: 'shelter',
            medicina: 'medical',
            medicinas: 'medical',
            medico: 'medical',
            médico: 'medical',
            medicos: 'medical',
            médicos: 'medical',
            sanitario: 'medical',
            herramientas: 'tools'
        };

        const priorityMap = {
            urgente: 'urgent',
            alta: 'high',
            media: 'medium',
            baja: 'low'
        };

        for (const term of terms) {
            const cleanTerm = term.toLowerCase().replace(/[,.:;]/g, '').trim();
            if (categoryMap[cleanTerm]) {
                category = categoryMap[cleanTerm];
            } else if (priorityMap[cleanTerm]) {
                priority = priorityMap[cleanTerm];
            } else {
                remainingTerms.push(term);
            }
        }

        let ciudad = remainingTerms.join(' ').trim();
        if (ciudad.toLowerCase().startsWith('en ')) {
            ciudad = ciudad.slice(3).trim();
        } else if (ciudad.toLowerCase().startsWith('de ')) {
            ciudad = ciudad.slice(3).trim();
        }

        const cacheKey = `necesidades:${category || ''}:${priority || ''}:${ciudad || ''}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return sendText(jid, cachedData);
        }

        try {
            const responseGridUrl = process.env.RESPONSEGRID_API_URL || 'https://api.responsegrid.app';
            const emergencyId = process.env.RESPONSEGRID_EMERGENCY_ID || '11111111-1111-4111-8111-111111111111';

            const params = {};
            if (category) params.category = category;
            if (priority) params.priority = priority;

            const response = await axios.get(`${responseGridUrl}/emergencies/${emergencyId}/public/needs`, {
                params,
                timeout: 8000
            });
            const needs = response.data || [];

            if (needs.length === 0) {
                return sendText(jid, "🔍 No se encontraron necesidades urgentes registradas con esos filtros.");
            }

            // Filtrar localmente por ciudad si se especifica
            let filteredNeeds = needs;
            if (ciudad) {
                const normCiudad = normalizeText(ciudad);
                filteredNeeds = needs.filter(n => {
                    const addr = n.location?.address || '';
                    return normalizeText(addr).includes(normCiudad);
                });
            }

            if (filteredNeeds.length === 0) {
                const noNeedsMsg = `🔍 No se encontraron necesidades urgentes registradas en la ciudad de "${escapeHtml(ciudad)}".`;
                return sendText(jid, noNeedsMsg);
            }

            const displayNeeds = filteredNeeds.slice(0, 5);
            const total = filteredNeeds.length;

            const priorityLabels = {
                urgent: '🔴 URGENTE',
                high: '🟠 ALTA',
                medium: '🟡 MEDIA',
                low: '🟢 BAJA'
            };

            let filterDesc = '';
            if (category) filterDesc += ` de tipo <b>${escapeHtml(category.toUpperCase())}</b>`;
            if (priority) filterDesc += ` con prioridad <b>${escapeHtml(priority.toUpperCase())}</b>`;
            if (ciudad) filterDesc += ` en <b>${escapeHtml(ciudad)}</b>`;

            let responseMessage = `📋 <b>Necesidades Urgentes${filterDesc}</b> (Encontradas: ${total}):\n\n`;

            for (const need of displayNeeds) {
                const pLabel = priorityLabels[need.priority] || need.priority?.toUpperCase() || '🟡 MEDIA';
                responseMessage += `📦 <b>${escapeHtml(need.title)}</b> (${escapeHtml(pLabel)})\n`;
                if (need.location?.address) responseMessage += `📍 Ubicación: ${escapeHtml(need.location.address)}\n`;
                if (need.description) responseMessage += `ℹ️ Detalles: ${escapeHtml(need.description)}\n`;

                const itemsList = need.items || [];
                if (itemsList.length > 0) {
                    responseMessage += `📋 Artículos requeridos:\n`;
                    for (const item of itemsList) {
                        const unitLabel = item.unit ? ` ${item.unit}` : '';
                        responseMessage += `• ${item.quantity}${escapeHtml(unitLabel)} de ${escapeHtml(item.name)} (${escapeHtml(item.category)})\n`;
                    }
                }
                responseMessage += `-------------------\n\n`;
            }

            responseMessage += `🔗 <i>Más detalles e inscripciones de ayuda en:</i> \nhttps://responsegrid.app`;

            const finalMsg = responseMessage.trim();
            cache.set(cacheKey, finalMsg, 120); // 2 minutos de caché
            return sendText(jid, finalMsg);
        } catch (err) {
            console.error('[ResponseGrid] Error fetching needs:', err.message);
            return sendText(jid, "⚠️ Ocurrió un error al obtener la lista de necesidades. Por favor, intenta de nuevo.");
        }
    }

    // 6. Comando de Estadísticas/Resumen de Emergencia (ResponseGrid API)
    if (lowerQueryText === 'resumen' || lowerQueryText === 'estadisticas' || lowerQueryText === 'estadística' || lowerQueryText === 'estadísticas') {
        const cacheKey = 'resumen_emergencia';
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return sendText(jid, cachedData);
        }

        try {
            const responseGridUrl = process.env.RESPONSEGRID_API_URL || 'https://api.responsegrid.app';
            const emergencyId = process.env.RESPONSEGRID_EMERGENCY_ID || '11111111-1111-4111-8111-111111111111';

            const [facetsRes, needsRes] = await Promise.all([
                axios.get(`${responseGridUrl}/emergencies/${emergencyId}/public/resources/facets`, { timeout: 8000 }),
                axios.get(`${responseGridUrl}/emergencies/${emergencyId}/public/needs`, { timeout: 8000 })
            ]);

            const facets = facetsRes.data || {};
            const needsCount = (needsRes.data || []).length;
            const byCategory = facets.byCategory || {};

            let responseMessage = `📊 <b>Resumen de la Emergencia (Sismo Venezuela)</b> 📊\n\n`;
            responseMessage += `📋 <b>Solicitudes de Necesidad</b>: ${needsCount} activas en el terreno.\n\n`;
            responseMessage += `🏢 <b>Centros de Ayuda / Acopio</b>: ${facets.total || 0} registrados en total.\n`;

            const catLabels = {
                water: '💧 Agua',
                food: '🍎 Alimentos',
                medical: '💊 Material Médico',
                shelter: '🏠 Albergue/Refugio',
                hygiene: '🧼 Higiene',
                clothing: '👕 Ropa',
                tools: '🔧 Herramientas',
                other: '📦 Otros'
            };

            for (const [cat, count] of Object.entries(byCategory)) {
                const label = catLabels[cat] || `📦 ${cat.toUpperCase()}`;
                responseMessage += `• ${label}: ${count} puntos.\n`;
            }

            responseMessage += `\n🔗 <i>Ver mapa de ayuda interactivo e información oficial en:</i>\nhttps://responsegrid.app`;

            const finalMsg = responseMessage.trim();
            cache.set(cacheKey, finalMsg, 300); // 5 minutos de caché para estadísticas
            return sendText(jid, finalMsg);
        } catch (err) {
            console.error('[ResponseGrid] Error fetching stats:', err.message);
            return sendText(jid, "⚠️ Ocurrió un error al obtener las estadísticas. Por favor, intenta de nuevo.");
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
            const esMenor = row.edad && parseInt(row.edad, 10) < 18;

            responseMessage += `👤 <b>${escapeHtml(row.nombre.toUpperCase())}</b>\n`;
            if (row.cedula) responseMessage += `🆔 Cédula: ${escapeHtml(maskCedula(row.cedula))}\n`;
            if (row.edad) responseMessage += `🎂 Edad: ${escapeHtml(row.edad)} años\n`;

            if (row.fuente === 'LocalizadosVE') {
                const lugarInfo = esMenor ? '🏥 Hospital/Refugio: <i>[Protegido por seguridad de menores]</i>' : `🏥 Hospital/Refugio: ${escapeHtml(row.lugar)}`;
                responseMessage += `${lugarInfo}\n`;
                responseMessage += `🟢 Estatus: LOCALIZADO (Confirmado)\n`;
                
                if (row.nota) {
                    const notaInfo = esMenor ? 'ℹ️ Nota: <i>Restringida por protección al menor</i>' : `ℹ️ Nota: ${escapeHtml(row.nota)}`;
                    responseMessage += `${notaInfo}\n`;
                }
                
                if (!esMenor && row.slug) {
                    responseMessage += `🔗 Ficha: ${siteUrl}/localizados/${row.slug}\n`;
                } else if (esMenor) {
                    responseMessage += `⚠️ <i>La información de ubicación detallada de menores de edad está bajo reserva por seguridad. Contacta a las autoridades competentes para verificación familiar.</i>\n`;
                }
            } else {
                // Exclusivo de SOS Venezuela
                const estatusEmoji = row.estado === 'desaparecido' ? '🔴' : '🟢';
                const statusLabel = SOS_STATUS[row.statusSos] || (row.estado === 'desaparecido' ? 'Buscando información' : 'Localizado/a con vida');
                responseMessage += `${estatusEmoji} Estatus: ${escapeHtml(statusLabel)} (Reporte Comunitario)\n`;
                
                const lugarInfo = esMenor ? '📍 Lugar/Refugio: <i>[Protegido por seguridad de menores]</i>' : `📍 Lugar/Refugio: ${escapeHtml(row.lugar)}`;
                responseMessage += `${lugarInfo}\n`;
                
                if (row.nota) {
                    const notaInfo = esMenor ? 'ℹ️ Nota: <i>Restringida por protección al menor</i>' : `ℹ️ Nota: ${escapeHtml(row.nota)}`;
                    responseMessage += `${notaInfo}\n`;
                }
                
                if (!esMenor) {
                    responseMessage += `🔗 Ficha: https://sosvenezuela2026.com (Comunidad)\n`;
                } else {
                    responseMessage += `⚠️ <i>La información de ubicación detallada de menores de edad está bajo reserva por seguridad. Contacta a las autoridades competentes para verificación familiar.</i>\n`;
                }
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

module.exports = { routeMessage, maskCedula, normalizeText, escapeHtml };
