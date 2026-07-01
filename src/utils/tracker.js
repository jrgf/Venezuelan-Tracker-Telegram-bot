const axios = require('axios');

/**
 * Tracks an anonymous event to PostHog in the background.
 *
 * @param {string} distinctId - Anonymized chat ID or JID
 * @param {string} eventName - E.g. "message_received"
 * @param {Object} [properties] - Additional properties (channel, command, etc.)
 */
async function trackEvent(distinctId, eventName, properties = {}) {
    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) {
        return; // Silent bypass if no tracking API key is configured
    }

    try {
        await axios.post('https://us.i.posthog.com/capture/', {
            api_key: apiKey,
            event: eventName,
            properties: {
                distinct_id: distinctId,
                ...properties,
                $lib: 'custom-axios'
            }
        }, {
            timeout: 5000
        });
    } catch (err) {
        console.error('[Tracker] PostHog event transmission failed:', err.message);
    }
}

module.exports = { trackEvent };
