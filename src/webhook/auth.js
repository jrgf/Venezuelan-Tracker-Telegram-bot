/**
 * Webhook authentication middleware.
 *
 * Security model:
 *  - FZAP_WEBHOOK_SECRET is REQUIRED in production.
 *  - If set: validates the `apikey` header on every request.
 *  - If NOT set: logs a warning and falls back to subnet check.
 *
 * The IP subnet fallback (172.18.x.x) is intentionally kept as a
 * last-resort safety net, NOT as a primary security mechanism.
 * Docker Compose may reassign bridge subnets (172.19, 172.20, etc.)
 * on network recreation, causing silent auth failures.
 *
 * ⚠️  Always set FZAP_WEBHOOK_SECRET in production.
 */

const config = require('../config');

// Warn once at startup if secret is not configured
let _warned = false;

function webhookAuth(req, res, next) {
    const secret = config.fzap.webhookSecret;

    if (secret) {
        // ── Primary: HMAC-safe header comparison ──────────────────────────────
        const headerKey = req.headers['apikey'] || req.headers['authorization'] || '';
        // Use timingSafeEqual to prevent timing attacks
        const { timingSafeEqual } = require('crypto');
        let authorized = false;
        try {
            const a = Buffer.from(headerKey);
            const b = Buffer.from(secret);
            authorized = a.length === b.length && timingSafeEqual(a, b);
        } catch {
            authorized = false;
        }
        if (!authorized) {
            console.warn('[Auth] Unauthorized webhook request from', req.ip);
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return next();
    }

    // ── Fallback: subnet check (no secret configured) ─────────────────────────
    if (!_warned) {
        console.warn(
            '[Auth] ⚠️  FZAP_WEBHOOK_SECRET is not set. ' +
            'Falling back to IP subnet check — this is NOT secure for production. ' +
            'Set FZAP_WEBHOOK_SECRET in .env to enable proper authentication.'
        );
        _warned = true;
    }

    const ip = req.ip || '';
    // Accept common Docker bridge subnets and localhost
    const isInternal =
        ip === '::1' ||
        ip === '127.0.0.1' ||
        ip.startsWith('::ffff:127.') ||
        /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(ip) ||  // 172.16–172.31 (RFC1918)
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip);            // same without ::ffff:

    if (!isInternal) {
        console.warn('[Auth] Rejected external request (no secret configured):', ip);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

module.exports = webhookAuth;