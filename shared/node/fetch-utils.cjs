/**
 * Shared Fetch Utilities (CommonJS)
 * CommonJS-compatible version for render.com and other Node.js services
 *
 * SOURCE OF TRUTH: /shared/universal/fetch-utils.js (ESM)
 * When updating fetch logic, update BOTH files.
 *
 * @module shared/node/fetch-utils
 */

const fetch = require('node-fetch');
const AbortController = globalThis.AbortController;

/**
 * Delays execution for a specified number of milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with a timeout
 * @param {string} resource - The resource to fetch
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @returns {Promise<Response>}
 * @throws {Error} When request times out
 */
async function fetchWithTimeout(resource, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
}

/**
 * Fetch with retry logic and exponential backoff
 * Retries on 5xx server errors, 429 rate limiting, and network errors
 * @param {string} resource - The resource to fetch
 * @param {object} options - Fetch options
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} initialDelay - Initial delay in ms (default: 1000)
 * @param {number} timeout - Timeout per request in ms (default: 10000)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(resource, options = {}, maxRetries = 3, initialDelay = 1000, timeout = 10000) {
    let lastError;
    let lastResponse;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchWithTimeout(resource, options, timeout);

            // Retry on server errors (500+) and rate limiting (429)
            if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
                let delayMs = initialDelay * Math.pow(2, attempt);

                // Respect Retry-After header for 429 responses
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    if (retryAfter) {
                        const retrySeconds = parseInt(retryAfter, 10);
                        if (!isNaN(retrySeconds)) {
                            delayMs = Math.max(delayMs, retrySeconds * 1000);
                        }
                    }
                }

                console.warn(`[FETCH-RETRY] ${response.status === 429 ? 'Rate limited' : 'Server error'} ${response.status}, attempt ${attempt + 1}/${maxRetries + 1}, waiting ${delayMs}ms`);
                lastResponse = response;
                await delay(delayMs);
                continue;
            }

            return response;
        } catch (error) {
            lastError = error;
            console.warn(`[FETCH-RETRY] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);

            if (attempt < maxRetries) {
                const delayMs = initialDelay * Math.pow(2, attempt);
                await delay(delayMs);
            }
        }
    }

    if (lastResponse) return lastResponse;
    throw lastError;
}

module.exports = {
    delay,
    fetchWithTimeout,
    fetchWithRetry,
};
