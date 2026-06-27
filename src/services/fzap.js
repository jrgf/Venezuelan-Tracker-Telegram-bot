/**
 * Fzap API client — sending text messages to WhatsApp.
 */

const axios = require('axios');
const config = require('../config');

const api = axios.create({
    baseURL: config.fzap.apiUrl,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
        token: config.fzap.apiKey,
    },
});

/**
 * Sends a text message to a WhatsApp number.
 * POST /chat/send/text
 *
 * @param {string} remoteJid - Recipient JID (e.g. "5511999999999@s.whatsapp.net")
 * @param {string} text - Message content
 * @param {string} [instance] - Ignored (session routing is handled via user token)
 */
async function sendText(remoteJid, text, instance) {
    if (Array.isArray(text)) text = text.join('\n');

    try {
        const payload = {
            phone: remoteJid,
            body: text,
        };

        const { data } = await api.post('/chat/send/text', payload);
        return data;
    } catch (err) {
        console.error('[Fzap] sendText error:', err.response?.status, err.constructor.name);
        throw err;
    }
}

module.exports = { sendText };
