/**
 * Sequential Task Queue per key (JID).
 * Ensures that for any given JID (user), messages are processed one by one,
 * while different JIDs are processed in parallel.
 *
 * This prevents Race Conditions in async flows (Read -> Await -> Write).
 * If a user sends 3 photos at once, they will be processed sequentially,
 * ensuring the session data (items list) is never overwritten.
 */

const queues = new Map();

/**
 * Enqueues an async task for a given key.
 * If a queue exists for this key, the task is appended.
 * If not, a new queue is started.
 *
 * @param {string} key - Unique identifier (remoteJid)
 * @param {Function} task - Async function to execute
 * @returns {Promise<any>} Result of the task
 */
async function enqueue(key, task) {
    // Current tail of the promise chain for this key
    const currentQueue = queues.get(key) || Promise.resolve();

    // The new tail: waits for current tail then runs the task
    const nextTask = currentQueue
        .then(async () => {
            try {
                return await task();
            } catch (err) {
                console.error(`[TaskQueue] Error in task for ${key}:`, err.message);
                // We don't rethrow to avoid "breaking" the chain for subsequent messages,
                // but errors are logged.
            } finally {
                // Garbage collection: if this specific promise is still the tail,
                // delete the map entry so we don't leak memory.
                if (queues.get(key) === nextTask) {
                    queues.delete(key);
                }
            }
        });

    // Update the tail in the map
    queues.set(key, nextTask);

    return nextTask;
}

module.exports = { enqueue };
