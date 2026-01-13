/**
 * Shared Fetch Utilities
 * Works in both Browser and Node.js environments
 *
 * @module shared/universal/fetch-utils
 */

/**
 * Delays execution for a specified number of milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with a timeout
 * @param {string|Request} resource - The resource to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @returns {Promise<Response>}
 * @throws {Error} When request times out
 */
export async function fetchWithTimeout(resource, options = {}, timeout = 10000) {
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
 * Fetches a URL with retry logic and exponential backoff
 * @param {string|Request} resource - The resource to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} retries - Number of retries (default: 3)
 * @param {number} delayMs - Initial delay for exponential backoff (default: 1000)
 * @param {number} timeoutMs - Timeout for each attempt (default: 10000)
 * @returns {Promise<Response>}
 * @throws {Error} When all retries are exhausted
 */
export async function fetchWithRetry(resource, options = {}, retries = 3, delayMs = 1000, timeoutMs = 10000) {
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetchWithTimeout(resource, options, timeoutMs);

            // Retry on server errors (5xx)
            if (!response.ok && response.status >= 500) {
                if (i < retries) {
                    const waitTime = delayMs * Math.pow(2, i);
                    console.warn(`[FETCH-RETRY] Received ${response.status} for ${resource}. Retrying in ${waitTime}ms...`);
                    await delay(waitTime);
                    continue;
                }
            }
            return response;
        } catch (error) {
            // Retry on timeout or network errors
            if (i < retries && (error.name === 'AbortError' || error instanceof TypeError || error.message?.includes('timeout'))) {
                const waitTime = delayMs * Math.pow(2, i);
                console.warn(`[FETCH-RETRY] Attempt ${i + 1}/${retries + 1} failed for ${resource}: ${error.message}. Retrying in ${waitTime}ms...`);
                await delay(waitTime);
                continue;
            }
            throw error;
        }
    }
    throw new Error(`Failed to fetch ${resource} after ${retries + 1} attempts.`);
}

/**
 * Simple fetch wrapper with default error handling
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} When response is not ok
 */
export async function simpleFetch(url, options = {}) {
    const response = await fetch(url, options);

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
}

/**
 * Fetch with automatic JSON parsing and error handling
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {object} config - Additional configuration
 * @param {number} config.retries - Number of retries
 * @param {number} config.timeout - Timeout in ms
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function safeFetch(url, options = {}, config = {}) {
    const { retries = 3, timeout = 10000 } = config;

    try {
        const response = await fetchWithRetry(url, options, retries, 1000, timeout);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            return { success: false, error: `HTTP ${response.status}: ${errorText}` };
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
