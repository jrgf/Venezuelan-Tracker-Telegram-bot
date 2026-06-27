/**
 * Bot Buscador de Personas — Terremoto Venezuela 2026
 * Entry point: Express server with Fzap API webhooks.
 *
 * Security hardening applied:
 *  - /health restricted to localhost
 *  - Rate limiting on webhook endpoint
 *  - JSON payload limit reduced to 5mb
 *  - Helmet HTTP security headers
 */

const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const webhookAuth = require('./webhook/auth');
const webhookHandler = require('./webhook/handler');
const { provisionFzap } = require('./services/fzapProvision');


const app = express();

app.use(helmet());
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb', type: 'application/json' }));
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));

const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
});

app.get('/health', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const allowedIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    if (!allowedIps.includes(clientIp)) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.json({ status: 'ok' });
});

app.use('/webhook', webhookLimiter, webhookAuth, webhookHandler);

app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
    console.error('[Server] Unhandled error:', err.constructor.name);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = config.port;
app.listen(PORT, async () => {
    console.log(`
┌──────────────────────────────────────────────┐
│  🇻🇪 Buscador de Personas — Sismo VE 2026   │
├──────────────────────────────────────────────┤
│  Server running on port ${String(PORT).padEnd(21)}│
│  Webhook: POST /webhook/messages             │
│  Health:  GET  /health (localhost only)       │
└──────────────────────────────────────────────┘
  `);

    if (!config.fzap.apiUrl) console.warn('⚠️  FZAP_API_URL not set');
    if (!config.fzap.instanceName) console.warn('⚠️  FZAP_INSTANCE not set');

    await provisionFzap();
});

module.exports = app;