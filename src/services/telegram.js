/**
 * Telegram Bot API client.
 */

const axios = require('axios');
const config = require('../config');

const MAX_MESSAGE_LENGTH = 3900;

function getApiUrl(method) {
    if (!config.telegram.botToken) {
        throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }
    return `https://api.telegram.org/bot${config.telegram.botToken}/${method}`;
}

function splitMessage(text) {
    const chunks = [];
    const value = String(Array.isArray(text) ? text.join('\n') : text);
    for (let i = 0; i < value.length; i += MAX_MESSAGE_LENGTH) {
        chunks.push(value.slice(i, i + MAX_MESSAGE_LENGTH));
    }
    return chunks.length ? chunks : [''];
}

async function sendText(chatId, text) {
    try {
        let lastResponse;
        for (const chunk of splitMessage(text)) {
            const { data } = await axios.post(getApiUrl('sendMessage'), {
                chat_id: chatId,
                text: chunk,
                disable_web_page_preview: true,
            }, { timeout: 10000 });
            lastResponse = data;
        }
        return lastResponse;
    } catch (err) {
        console.error('[Telegram] sendText error:', err.response?.status, err.constructor.name);
        throw err;
    }
}

async function getUpdates(offset, timeout) {
    try {
        const { data } = await axios.post(getApiUrl('getUpdates'), {
            offset,
            timeout,
            allowed_updates: ['message'],
        }, { timeout: (timeout + 5) * 1000 });

        return Array.isArray(data?.result) ? data.result : [];
    } catch (err) {
        console.error('[Telegram] getUpdates error:', err.response?.status, err.constructor.name);
        throw err;
    }
}

async function deleteWebhook() {
    try {
        await axios.post(getApiUrl('deleteWebhook'), { drop_pending_updates: false }, { timeout: 10000 });
    } catch (err) {
        console.error('[Telegram] deleteWebhook error:', err.response?.status, err.constructor.name);
    }
}

module.exports = { sendText, getUpdates, deleteWebhook };
