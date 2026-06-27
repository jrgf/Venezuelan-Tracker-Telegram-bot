/**
 * Bot Buscador de Personas — Terremoto Venezuela 2026
 * Telegram long-polling entry point.
 */

const config = require('./config');
const { getUpdates, deleteWebhook } = require('./services/telegram');
const { parseMessage } = require('./telegramParser');
const { routeMessage } = require('./sismoRouter');
const { enqueue } = require('./utils/taskQueue');

const POLL_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 3000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function processUpdate(update) {
    const parsed = parseMessage(update);
    if (!parsed || parsed.chatType !== 'private') {
        return;
    }

    console.log(`[Telegram] Message from (${parsed.remoteJid}): ${parsed.messageType}`);
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
