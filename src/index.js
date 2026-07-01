/**
 * Bot Buscador de Personas — Terremoto Venezuela 2026
 * Telegram long-polling entry point.
 */

const config = require('./config');
const { getUpdates, deleteWebhook } = require('./services/telegram');
const { parseMessage } = require('./telegramParser');
const { routeMessage } = require('./sismoRouter');
const { enqueue } = require('./utils/taskQueue');
const { trackEvent } = require('./utils/tracker');

const POLL_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 3000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// In-memory rate limiting store for Telegram spammers
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 20; // Máximo 20 mensajes por minuto

function isRateLimited(userId) {
    const now = Date.now();
    const userRecord = rateLimitMap.get(userId);
    if (!userRecord) {
        rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }
    if (now > userRecord.resetTime) {
        rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }
    userRecord.count++;
    return userRecord.count > RATE_LIMIT_MAX_REQUESTS;
}

async function processUpdate(update) {
    const parsed = parseMessage(update);
    if (!parsed || parsed.chatType !== 'private') {
        return;
    }

    if (isRateLimited(parsed.remoteJid)) {
        console.warn(`[Telegram] Rate limit exceeded for user (${parsed.remoteJid}), discarding message.`);
        return;
    }

    console.log(`[Telegram] Message from (${parsed.remoteJid}): ${parsed.messageType}`);

    // Classify command for telemetry
    const queryText = parsed.text?.trim()?.toLowerCase() || '';
    let command = 'search_person';
    const cmdWord = queryText.startsWith('/') ? queryText.split(/\s+/, 1)[0].split('@', 1)[0] : '';

    if (queryText === '#' || cmdWord === '/start' || cmdWord === '/ayuda' || cmdWord === '/help' || queryText === 'hola' || queryText === 'ayuda' || queryText === 'help') {
        command = 'welcome';
    } else if (queryText === 'emergencia' || queryText === 'emergencias' || queryText === 'telefono' || queryText === 'telefonos' || cmdWord === '/telefonos') {
        command = 'emergency';
    } else if (queryText.startsWith('refugio')) {
        command = 'refugio';
    } else if (queryText.startsWith('acopio') || queryText.startsWith('donar') || cmdWord === '/centros') {
        command = 'acopio';
    } else if (queryText.startsWith('necesidad') || queryText.startsWith('necesidades') || queryText.startsWith('insumos')) {
        command = 'need';
    } else if (queryText === 'resumen' || queryText === 'estadisticas' || queryText === 'estadística' || queryText === 'estadísticas') {
        command = 'stats';
    }

    // Track the message event in the background (no await to avoid latency)
    trackEvent(parsed.remoteJid, 'message_received', {
        channel: 'telegram',
        command: command,
        message_type: parsed.messageType
    });

    await enqueue(parsed.remoteJid, async () => routeMessage(parsed));
}

async function poll() {
    if (!config.telegram.botToken) {
        console.error('[Telegram] TELEGRAM_BOT_TOKEN is not set.');
        process.exitCode = 1;
        return;
    }

    await deleteWebhook();
    console.log('[Telegram] Polling started.');

    let offset = 0;
    while (true) {
        try {
            const updates = await getUpdates(offset, POLL_TIMEOUT_SECONDS);
            for (const update of updates) {
                offset = update.update_id + 1;
                await processUpdate(update);
            }
        } catch (err) {
            console.error('[Telegram] Polling error:', err.response?.status || err.constructor.name);
            await sleep(RETRY_DELAY_MS);
        }
    }
}

if (require.main === module) {
    poll();
}

module.exports = { poll, processUpdate };
