/**
 * Token Handler
 * Handles /api/token endpoint - TPOS authentication
 *
 * @module cloudflare-worker/modules/handlers/token-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { jsonResponse, errorResponse } from '../utils/cors-utils.js';
import { getCachedToken, cacheToken } from '../utils/token-cache.js';
import { API_ENDPOINTS } from '../../config/endpoints.js';

/**
 * Handle POST /api/token
 * Fetches and caches TPOS authentication token
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleTokenRequest(request) {
    // Check cache first
    const cachedToken = getCachedToken();
    if (cachedToken) {
        console.log('[TOKEN-HANDLER] Returning cached token');
        return jsonResponse(cachedToken);
    }

    // Cache miss - fetch new token from TPOS
    console.log('[TOKEN-HANDLER] Cache miss, fetching new token...');

    try {
        // Build headers
        const headers = new Headers(request.headers);
        headers.set('Origin', 'https://tomato.tpos.vn/');
        headers.set('Referer', 'https://tomato.tpos.vn/');

        // Forward to TPOS token endpoint
        const tposResponse = await fetchWithRetry(
            API_ENDPOINTS.TPOS.TOKEN,
            {
                method: 'POST',
                headers: headers,
                body: await request.arrayBuffer(),
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

        // Cache the token
        cacheToken(tokenData);

        console.log('[TOKEN-HANDLER] New token fetched and cached');

        return jsonResponse(tokenData);

    } catch (error) {
        console.error('[TOKEN-HANDLER] Error:', error.message);
        return errorResponse('Failed to fetch token: ' + error.message, 500);
    }
}
