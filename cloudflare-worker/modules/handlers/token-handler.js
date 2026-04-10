// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Token Handler
 * Handles /api/token endpoint - TPOS authentication
 * Caches tokens PER USERNAME to support multiple accounts
 *
 * QUAN TRỌNG: KHÔNG dùng `new Headers(request.headers)` — browser headers
 * gây TPOS reject 400. Xem docs/architecture/CLOUDFLARE-WORKER-HEADERS.md
 *
 * @module cloudflare-worker/modules/handlers/token-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { jsonResponse, errorResponse } from '../utils/cors-utils.js';
import { getCachedToken, cacheToken } from '../utils/token-cache.js';
import { API_ENDPOINTS } from '../config/endpoints.js';

/**
 * Extract username from request body
 * @param {string} body - URL-encoded form body
 * @returns {string} - Username or '_default'
 */
function extractUsernameFromBody(body) {
    try {
        const params = new URLSearchParams(body);
        const username = params.get('username');
        if (username) {
            return username;
        }
        // For refresh_token grant, use a different key
        const grantType = params.get('grant_type');
        if (grantType === 'refresh_token') {
            return '_refresh_' + (params.get('refresh_token') || '').substring(0, 20);
        }
    } catch (e) {
        console.warn('[TOKEN-HANDLER] Could not parse body for username');
    }
    return '_default';
}

// Server-side TPOS credentials — browser no longer sends these
const CREDENTIALS_BY_COMPANY = {
    1: { grant_type: 'password', username: 'nvktlive1', password: 'Aa@28612345678', client_id: 'tmtWebApp' },
    2: { grant_type: 'password', username: 'nvktshop1', password: 'Aa@28612345678', client_id: 'tmtWebApp' }
};

/**
 * Handle POST /api/token
 * Fetches and caches TPOS authentication token.
 *
 * Supports two modes:
 *   1. Proxy auth (NEW): JSON body `{ companyId: 1|2 }` — credentials stored server-side
 *   2. Legacy passthrough: form-urlencoded body — forwarded as-is (backward compat)
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleTokenRequest(request) {
    // Read body once
    const bodyBuffer = await request.arrayBuffer();
    const bodyText = new TextDecoder().decode(bodyBuffer);

    // Detect mode: JSON proxy auth vs legacy form passthrough
    const contentType = request.headers.get('Content-Type') || '';
    const isJsonProxy = contentType.includes('application/json');

    let tposBody;
    let cacheKey;

    if (isJsonProxy) {
        // NEW: Proxy auth — browser sends { companyId } , we inject credentials
        try {
            const { companyId } = JSON.parse(bodyText);
            const cid = parseInt(companyId, 10) || 1;
            const creds = CREDENTIALS_BY_COMPANY[cid] || CREDENTIALS_BY_COMPANY[1];
            cacheKey = creds.username;

            // Build form body for TPOS
            const form = new URLSearchParams();
            form.append('grant_type', creds.grant_type);
            form.append('username', creds.username);
            form.append('password', creds.password);
            form.append('client_id', creds.client_id);
            tposBody = form.toString();

            console.log(`[TOKEN-HANDLER] Proxy auth for company ${cid} (user: ${creds.username})`);
        } catch (e) {
            return errorResponse('Invalid JSON body: ' + e.message, 400);
        }
    } else {
        // LEGACY: Form passthrough — forward as-is
        cacheKey = extractUsernameFromBody(bodyText);
        tposBody = bodyBuffer;
        console.log(`[TOKEN-HANDLER] Legacy passthrough for: "${cacheKey}"`);
    }

    // Check cache first (per username)
    const cachedToken = getCachedToken(cacheKey);
    if (cachedToken) {
        console.log(`[TOKEN-HANDLER] Returning cached token for "${cacheKey}"`);
        return jsonResponse(cachedToken);
    }

    // Cache miss - fetch new token from TPOS
    console.log(`[TOKEN-HANDLER] Cache miss for "${cacheKey}", fetching new token...`);

    try {
        // Build clean headers — only send what TPOS needs
        const headers = new Headers();
        headers.set('Content-Type', 'application/x-www-form-urlencoded');
        headers.set('Origin', 'https://tomato.tpos.vn/');
        headers.set('Referer', 'https://tomato.tpos.vn/');

        // Forward to TPOS token endpoint
        const tposResponse = await fetchWithRetry(
            API_ENDPOINTS.TPOS.TOKEN,
            {
                method: 'POST',
                headers: headers,
                body: tposBody,
            },
            3, 1000, 10000
        );

        if (!tposResponse.ok) {
            const errorText = await tposResponse.text();
            console.error(`[TOKEN-HANDLER] TPOS error ${tposResponse.status}:`, errorText);
            throw new Error(`TPOS API responded with ${tposResponse.status}: ${tposResponse.statusText}`);
        }

        const tokenData = await tposResponse.json();

        // Validate response
        if (!tokenData.access_token) {
            console.error('[TOKEN-HANDLER] Response missing access_token:', tokenData);
            throw new Error('Invalid token response - missing access_token');
        }

        // Cache the token (per username)
        cacheToken(tokenData, cacheKey);

        console.log(`[TOKEN-HANDLER] New token fetched and cached for "${cacheKey}"`);

        return jsonResponse(tokenData);

    } catch (error) {
        console.error('[TOKEN-HANDLER] Error:', error.message);
        return errorResponse('Failed to fetch token: ' + error.message, 500);
    }
}
