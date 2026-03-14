/**
 * Dynamic Header Builder for Pancake API requests
 * Builds proper headers to mimic browser requests
 */

/**
 * Build Pancake request headers with proper Referer and JWT cookie
 * Used by handlePancakeDirect for 24h policy bypass
 * @param {string} refererUrl - Referer URL (varies by page)
 * @param {string} jwtToken - JWT token for Cookie header (optional)
 * @returns {Headers}
 */
export function buildPancakeHeaders(refererUrl = 'https://pancake.vn/multi_pages', jwtToken = null) {
    const headers = new Headers();

    headers.set('Accept', 'application/json, text/plain, */*');
    headers.set('Accept-Language', 'en-US,en;q=0.9,vi;q=0.8');
    headers.set('Origin', 'https://pancake.vn');
    headers.set('Referer', refererUrl);
    headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    // Security headers to mimic Chrome browser
    headers.set('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
    headers.set('sec-ch-ua-mobile', '?0');
    headers.set('sec-ch-ua-platform', '"macOS"');
    headers.set('sec-fetch-dest', 'empty');
    headers.set('sec-fetch-mode', 'cors');
    headers.set('sec-fetch-site', 'same-origin');

    // JWT cookie - critical for authentication
    if (jwtToken) {
        headers.set('Cookie', `jwt=${jwtToken}; locale=vi`);
    }

    return headers;
}
