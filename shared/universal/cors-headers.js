// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * CORS Headers Utilities
 * Standard CORS configuration for all services
 *
 * @module shared/universal/cors-headers
 */

/**
 * Origins phép dùng credentials (cookies/Authorization) khi gọi API.
 * Browser sẽ yêu cầu `Access-Control-Allow-Origin` phải là specific origin (không wildcard)
 * + `Access-Control-Allow-Credentials: true` khi request có `credentials: 'include'`
 * hoặc dùng `navigator.sendBeacon` (luôn kèm cookies).
 */
const CREDENTIALED_ORIGIN_PATTERNS = [
    /^https:\/\/nhijudyshop\.github\.io$/,
    /^https:\/\/[a-z0-9-]+\.pages\.dev$/,
    /^http:\/\/localhost(?::\d+)?$/,
    /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
];

function isCredentialedOrigin(origin) {
    if (!origin) return false;
    return CREDENTIALED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

/**
 * Build CORS headers dynamic theo origin request.
 * - Match allowlist → trả specific origin + Allow-Credentials: true
 * - Không match → trả `*` (public API, không dùng credentials)
 */
export function buildCorsHeaders(request) {
    const origin = request?.headers?.get?.('Origin') || '';
    const allowCred = isCredentialedOrigin(origin);
    return {
        'Access-Control-Allow-Origin': allowCred ? origin : '*',
        ...(allowCred ? { 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        // Include Cache-Control / Pragma / If-* so clients sending cache-busting or conditional
        // headers don't trip the preflight (doi-soat search sends `cache-control: no-cache`).
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, Accept, Cache-Control, Pragma, If-None-Match, If-Modified-Since, If-Match, If-Unmodified-Since, tposappversion, x-tpos-lang, feature-version, X-Page-Access-Token, X-Auth-Data, X-User-Id, X-Idempotency-Key',
        'Access-Control-Expose-Headers': 'X-Retry-Count',
        'Access-Control-Max-Age': '86400',
    };
}

/**
 * Standard CORS headers — backward compat (static `*`).
 * ⚠️ Không dùng với credentialed requests. Dùng `buildCorsHeaders(request)` thay thế.
 */
export const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
        'Content-Type, Authorization, Accept, Cache-Control, Pragma, If-None-Match, If-Modified-Since, If-Match, If-Unmodified-Since, tposappversion, x-tpos-lang, feature-version, X-Page-Access-Token, X-Auth-Data, X-User-Id, X-Idempotency-Key',
    'Access-Control-Expose-Headers': 'X-Retry-Count',
    'Access-Control-Max-Age': '86400',
};

/**
 * CORS headers for browser fetch responses
 */
export const CORS_HEADERS_SIMPLE = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Cache-Control, Pragma',
};

/**
 * Create a Response with CORS headers (for Cloudflare Workers / Service Workers)
 * @param {any} body - Response body (will be JSON stringified if object)
 * @param {number} status - HTTP status code
 * @param {object} extraHeaders - Additional headers to include
 * @param {Request} [request] - Request để derive Origin (cho credentialed requests)
 * @returns {Response}
 */
export function corsResponse(body, status = 200, extraHeaders = {}, request = null) {
    const bodyString = typeof body === 'object' ? JSON.stringify(body) : body;
    const corsHeaders = request ? buildCorsHeaders(request) : CORS_HEADERS;

    return new Response(bodyString, {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
            ...extraHeaders,
        },
    });
}

/**
 * Create a CORS preflight response (for OPTIONS requests)
 * @param {Request} [request] - Request để derive Origin (echo back khi match allowlist)
 * @returns {Response}
 */
export function corsPreflightResponse(request = null) {
    return new Response(null, {
        status: 204,
        headers: request ? buildCorsHeaders(request) : CORS_HEADERS,
    });
}

/**
 * Create an error response with CORS headers
 * @param {string} message - Error message
 * @param {number} status - HTTP status code (default: 500)
 * @param {object} extraData - Additional data to include
 * @returns {Response}
 */
export function corsErrorResponse(message, status = 500, extraData = {}) {
    return corsResponse(
        {
            success: false,
            error: message,
            ...extraData,
        },
        status
    );
}

/**
 * Create a success response with CORS headers
 * @param {any} data - Response data
 * @param {object} extraData - Additional data to include
 * @returns {Response}
 */
export function corsSuccessResponse(data, extraData = {}) {
    return corsResponse(
        {
            success: true,
            data,
            ...extraData,
        },
        200
    );
}

/**
 * Add CORS headers to an existing Response
 * @param {Response} response - Original response
 * @param {Request} [request] - Request để derive Origin (optional)
 * @returns {Response} New response with CORS headers
 */
export function addCorsHeaders(response, request = null) {
    const newResponse = new Response(response.body, response);
    const corsHeaders = request ? buildCorsHeaders(request) : CORS_HEADERS;
    Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
    });
    return newResponse;
}

/**
 * Clone response and add CORS headers (for proxying)
 * @param {Response} response - Original response from upstream
 * @param {Request} [request] - Request để derive Origin (optional)
 * @returns {Response} New response with CORS headers added
 */
export function proxyResponseWithCors(response, request = null) {
    const newResponse = new Response(response.body, response);
    const corsHeaders = request ? buildCorsHeaders(request) : CORS_HEADERS;
    // Clear cache-busting "origin:*" set by upstream — we may be overriding to specific origin
    newResponse.headers.delete('Access-Control-Allow-Origin');
    newResponse.headers.delete('Access-Control-Allow-Credentials');
    Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
    });
    // Expose retry count to browser if request was retried
    if (response._retryCount > 0) {
        newResponse.headers.set('X-Retry-Count', String(response._retryCount));
    }
    return newResponse;
}
