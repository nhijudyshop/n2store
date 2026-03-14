/**
 * CORS Utilities for Cloudflare Worker
 * Handles Cross-Origin Resource Sharing headers
 */

export const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, Accept, Accept-Language, Referer, Origin, User-Agent, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform, sec-fetch-dest, sec-fetch-mode, sec-fetch-site, tposappversion',
    'Access-Control-Max-Age': '86400'
};

/**
 * Handle CORS preflight request
 * @param {Request} request
 * @returns {Response|null} - Response for OPTIONS, null otherwise
 */
export function corsPreflightResponse() {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
    });
}

/**
 * Create a Response with CORS headers added
 * @param {object} data - JSON response data
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
export function corsResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
        }
    });
}

/**
 * Proxy an existing Response with CORS headers
 * @param {Response} response - Original response
 * @returns {Response}
 */
export function proxyResponseWithCors(response) {
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
        newHeaders.set(key, value);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
    });
}

/**
 * Create error JSON response with CORS headers
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
export function errorResponse(message, status = 500) {
    return corsResponse({
        success: false,
        error: message
    }, status);
}

/**
 * Create success JSON response with CORS headers
 * @param {any} data - Response data
 * @returns {Response}
 */
export function successResponse(data) {
    return corsResponse({
        success: true,
        data
    }, 200);
}
