/**
 * Fetch Utilities for Cloudflare Worker
 * Provides retry logic and timeout for fetch requests
 */

/**
 * Delay execution
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Fetch with retry and exponential backoff
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} baseDelay - Base delay in ms (default: 1000)
 * @param {number} timeoutMs - Timeout per request in ms (default: 15000)
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3, baseDelay = 1000, timeoutMs = 15000) {
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const waitTime = baseDelay * Math.pow(2, attempt - 1);
                console.log(`[FETCH-RETRY] Attempt ${attempt + 1}/${maxRetries}, waiting ${waitTime}ms...`);
                await delay(waitTime);
            }

            const response = await fetchWithTimeout(url, options, timeoutMs);

            // Retry on 429 (rate limited) and 5xx errors
            if (response.status === 429 || response.status >= 500) {
                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
                console.warn(`[FETCH-RETRY] Got ${response.status}, will retry...`);
                continue;
            }

            return response;
        } catch (error) {
            lastError = error;
            if (error.name === 'AbortError') {
                console.warn(`[FETCH-RETRY] Request timed out (${timeoutMs}ms)`);
            } else {
                console.warn(`[FETCH-RETRY] Request error:`, error.message);
            }
        }
    }

    throw lastError || new Error('All retries failed');
}

/**
 * Simple fetch wrapper (no retry)
 * @param {string} url
 * @param {object} options
 * @returns {Promise<Response>}
 */
export async function simpleFetch(url, options = {}) {
    return fetchWithTimeout(url, options, 15000);
}

/**
 * Safe fetch that never throws - returns null on error
 * @param {string} url
 * @param {object} options
 * @returns {Promise<Response|null>}
 */
export async function safeFetch(url, options = {}) {
    try {
        return await fetchWithTimeout(url, options, 10000);
    } catch {
        return null;
    }
}
