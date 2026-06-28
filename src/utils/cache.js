const store = new Map();

function get(key) {
    const entry = store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
        store.delete(key);
        return null;
    }

    return entry.value;
}

function set(key, value, ttlSeconds = 120) {
    store.set(key, {
        value,
        expiry: Date.now() + (ttlSeconds * 1000)
    });
}

module.exports = { get, set };
