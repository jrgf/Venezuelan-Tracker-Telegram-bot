/**
 * Parses Fzap API MESSAGES_UPSERT webhook payloads.
 * Extracts sender JID and message text for the earthquake person finder bot.
 *
 * @lid note: WhatsApp sometimes sends remoteJid as an internal @lid identifier
 * instead of the real phone number JID. When this happens, we fall back to
 * body.sender which Fzap API always provides as a real @s.whatsapp.net JID.
 */

/**
 * @typedef {object} ParsedMessage
 * @property {string} remoteJid - Sender's WhatsApp JID (always @s.whatsapp.net)
 * @property {string} pushName - Sender's display name
 * @property {string} messageType - 'text' | 'unknown'
 * @property {string} [text] - Message text body (for text messages)
 * @property {boolean} fromMe - Whether this message was sent BY the bot
 */

/**
 * Resolves the JID to use for sending replies.
 * Uses remoteJid as-is — including @lid — since the Fzap API patch
 * handles @lid resolution on the send side via validateNumber: false.
 *
 * @param {string} remoteJid - JID from key.remoteJid
 * @returns {string} JID to use for replies
 */
function resolveJid(remoteJid) {
    if (typeof remoteJid !== 'string') return '';
    return remoteJid.replace(/:[^@]+@/, '@');
}

/**
 * Parses a raw Fzap API webhook body into a structured message.
 * @param {object} body - Webhook request body
 * @returns {ParsedMessage|null} Parsed message or null if unparseable
 */
function parseMessage(body) {
    try {
        const rawData = body.data || body;
        const data = Array.isArray(rawData) ? rawData[0] : rawData;

        const message =
            data?.message ||
            data?.Message ||
            body.event?.Message ||
            body.event?.message ||
            body.event?.RawMessage ||
            body.event?.rawMessage;

        let remoteJid = '';
        let fromMe = false;
        let pushName = '';

        const key = data?.key || data?.Key;
        if (key) {
            remoteJid = key.remoteJid || key.remoteJID || '';
            fromMe = key.fromMe === true;
            pushName = data.pushName || '';
        } else {
            const info = body.event?.Info || body.event?.info;
            if (info) {
                const senderAlt = info.SenderAlt || info.senderAlt || '';
                const sender = info.Sender || info.sender || '';
                const chat = info.Chat || info.chat || '';
                
                if (senderAlt && senderAlt.includes('@s.whatsapp.net')) {
                    remoteJid = senderAlt;
                } else if (sender && sender.includes('@s.whatsapp.net')) {
                    remoteJid = sender;
                } else if (chat && chat.includes('@s.whatsapp.net')) {
                    remoteJid = chat;
                } else {
                    remoteJid = chat || sender || senderAlt || info.MessageSource?.Chat || '';
                }
                
                fromMe = !!(info.IsFromMe || info.isFromMe || info.MessageSource?.IsFromMe);
                pushName = info.PushName || info.pushName || '';
            }
        }

        if (!remoteJid || !message) return null;

        const cleanJid = resolveJid(remoteJid);

        if (message.conversation || message.extendedTextMessage) {
            return {
                remoteJid: cleanJid,
                pushName,
                messageType: 'text',
                text: message.conversation || message.extendedTextMessage?.text || '',
                fromMe,
            };
        }

        return {
            remoteJid: cleanJid,
            pushName,
            messageType: 'unknown',
            text: '',
            fromMe,
        };
    } catch (error) {
        console.error('[Parser] Error parsing message:', error.message);
        return null;
    }
}

module.exports = { parseMessage };