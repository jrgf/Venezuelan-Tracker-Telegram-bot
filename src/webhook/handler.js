/**
 * Webhook handler — receives Fzap API events and dispatches them
 * to the earthquake person finder router.
 */

const { Router } = require('express');
const { parseMessage } = require('./parser');
const { routeMessage } = require('../sismoRouter');
const { enqueue } = require('../utils/taskQueue');

const router = Router();

/**
 * POST /webhook/messages
 * Receives MESSAGES_UPSERT events from Fzap API.
 */
router.post('/messages', async (req, res) => {
    // Respond immediately so Fzap API doesn't retry
    res.status(200).json({ status: 'received' });

    try {
        const body = req.body;

        let eventName = 'unknown';
        if (typeof body.type === 'string') {
            eventName = body.type.toLowerCase();
        } else if (typeof body.event === 'string') {
            eventName = body.event.toLowerCase();
        } else if (typeof body.event === 'object' && body.event !== null && body.event.name) {
            eventName = String(body.event.name).toLowerCase();
        } else if (body.type) {
            eventName = String(body.type).toLowerCase();
        }

        console.log(`[Webhook] Event: "${eventName}" from instance: ${body.instance || 'default'}`);

        const isValidEvent = !eventName || 
                             eventName === 'messages.upsert' || 
                             eventName === 'messages_upsert' || 
                             eventName === 'message';

        if (!isValidEvent) {
            return;
        }

        const parsed = parseMessage(body);
        if (!parsed) {
            console.log('[Webhook] Could not parse message, skipping');
            return;
        }

        // Ignore messages sent by the bot itself
        if (parsed.fromMe) {
            return;
        }

        // Ignore group messages (only handle direct messages)
        if (parsed.remoteJid.endsWith('@g.us')) {
            return;
        }

        // M-7: Log only metadata — no message content, no pushName
        console.log(`[Webhook] Message from (${parsed.remoteJid}): ${parsed.messageType}`);

        // Route the message sequentially per JID to avoid race conditions
        await enqueue(parsed.remoteJid, async () => {
            return await routeMessage(parsed, body.instance || '');
        });
    } catch (error) {
        // Don't log error.message if it could contain user data
        console.error('[Webhook] Error processing message:', error.constructor.name);
    }
});

module.exports = router;