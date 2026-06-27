/**
 * @typedef {object} ParsedMessage
 * @property {string} remoteJid - Telegram chat id as a string
 * @property {string} pushName - Sender's display name
 * @property {string} messageType - 'text' | 'unknown'
 * @property {string} [text] - Message text body
 * @property {string} chatType - Telegram chat type
 */

function displayName(from = {}) {
    return [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || '';
}

function parseMessage(update) {
    try {
        const message = update?.message;
        const chat = message?.chat;
        if (!chat?.id) return null;

        const text = message.text || message.caption || '';

        return {
            remoteJid: String(chat.id),
            pushName: displayName(message.from),
            messageType: text ? 'text' : 'unknown',
            text,
            chatType: chat.type || 'private',
        };
    } catch (err) {
        console.error('[Parser] Error parsing message:', err.constructor.name);
        return null;
    }
}

module.exports = { parseMessage };
