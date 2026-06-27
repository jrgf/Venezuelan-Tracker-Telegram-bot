/**
 * Fzap API provisioning — runs once on bot startup.
 *
 * Safe to run on every restart — idempotent.
 */

const axios = require('axios');
const config = require('../config');

// Admin Auth uses 'Authorization' header containing the ADMIN_TOKEN directly
const adminApi = axios.create({
    baseURL: config.fzap.apiUrl,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
        Authorization: config.fzap.apiKey, // Direct ADMIN_TOKEN value!
    },
});

// User Auth uses 'token' header
const userApi = axios.create({
    baseURL: config.fzap.apiUrl,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
        token: config.fzap.apiKey, // User Token!
    },
});

const WEBHOOK_URL = config.fzap.webhookUrl;

/**
 * Returns the list of existing instance names from Fzap.
 */
async function fetchExistingNames() {
    try {
        const { data } = await adminApi.get('/admin/users');
        const list = data && data.data ? data.data : [];
        return Array.isArray(list) ? list.map(u => u.name) : [];
    } catch (err) {
        console.error('[Provision] Failed to fetch existing users:', err.message);
        return [];
    }
}

/**
 * Provisions a single instance: create if missing, connect, and set webhook.
 */
async function provisionOne(instanceName, label) {
    if (!instanceName) {
        console.warn(`[Provision] Skipped ${label} — instance name not configured.`);
        return;
    }

    try {
        // 1. Create user if missing
        const existing = await fetchExistingNames();
        if (!existing.includes(instanceName)) {
            console.log(`[Provision] Creating Fzap user "${instanceName}" (${label})...`);
            await adminApi.post('/admin/users', {
                name: instanceName,
                token: config.fzap.apiKey,
                expiration: 0,
            });
        } else {
            console.log(`[Provision] Fzap user "${instanceName}" (${label}) already exists.`);
        }

        // 2. Trigger session connection (starts pairing/QR code generation if not logged in)
        console.log(`[Provision] Connecting Fzap session "${instanceName}"...`);
        try {
            await userApi.post('/session/connect', {});
        } catch (err) {
            console.log(`[Provision] Session connect returned: ${err.message}`);
        }

        // 3. Set webhook
        if (WEBHOOK_URL) {
            console.log(`[Provision] Setting webhook for "${instanceName}" → ${WEBHOOK_URL}...`);
            await userApi.post('/webhook', {
                url: WEBHOOK_URL,
                events: ['All'], // Subscribes to all events (Message, QR, etc.)
                headers: {
                    ...(config.fzap.webhookSecret && { apikey: config.fzap.webhookSecret }),
                },
            });
            console.log(`[Provision] Webhook configured successfully.`);
        }
    } catch (err) {
        console.error(`[Provision] ❌ Error provisioning ${label} (${instanceName}):`, err.response?.data?.message || err.message);
    }
}

/**
 * Main provisioning — provisions all configured instances.
 */
async function provisionFzap() {
    if (!config.fzap.apiUrl || !config.fzap.apiKey) {
        console.warn('[Provision] Skipped — FZAP_API_URL or FZAP_API_KEY not set.');
        return;
    }

    if (!config.fzap.instanceName) {
        console.warn('[Provision] No instance configured for provisioning.');
        return;
    }

    console.log('[Provision] Starting Fzap provisioning...');
    await provisionOne(config.fzap.instanceName, 'bot');
    console.log('[Provision] ✅ Fzap provisioning complete.');
}

module.exports = { provisionFzap };
