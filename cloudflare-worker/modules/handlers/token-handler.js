/**
 * Token Handler
 * Handles /api/token endpoint - TPOS authentication
 * Caches tokens PER USERNAME:COMPANYID to support multiple accounts & companies
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

/**
 * Handle POST /api/token
 * Fetches and caches TPOS authentication token
 * Supports X-Company-Id header for multi-company token caching
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleTokenRequest(request) {
    // Read body to extract username for cache key
    const bodyBuffer = await request.arrayBuffer();
    const bodyText = new TextDecoder().decode(bodyBuffer);
    const cacheKey = extractUsernameFromBody(bodyText);

    // Read X-Company-Id header for multi-company support
    const companyId = request.headers.get('X-Company-Id') || null;

    console.log(`[TOKEN-HANDLER] Token request for: "${cacheKey}"${companyId ? ` company: ${companyId}` : ''}`);

    // Check cache first (per username + companyId)
    const cachedToken = getCachedToken(cacheKey, companyId);
    if (cachedToken) {
        console.log(`[TOKEN-HANDLER] Returning cached token for "${cacheKey}" company: ${companyId || 'default'}`);
        return jsonResponse(cachedToken);
    }

    // Cache miss - fetch new token from TPOS
    console.log(`[TOKEN-HANDLER] Cache miss for "${cacheKey}" company: ${companyId || 'default'}, fetching new token...`);

    try {
        // Build headers
        const headers = new Headers(request.headers);
        headers.set('Origin', 'https://tomato.tpos.vn/');
        headers.set('Referer', 'https://tomato.tpos.vn/');
        // Remove X-Company-Id from forwarded headers (not a TPOS header)
        headers.delete('X-Company-Id');

        // Forward to TPOS token endpoint
        const tposResponse = await fetchWithRetry(
            API_ENDPOINTS.TPOS.TOKEN,
            {
                method: 'POST',
                headers: headers,
                body: bodyBuffer, // Use the already-read buffer
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

        // If companyId specified and token is for different company, try switch
        if (companyId) {
            const switchedToken = await trySwitchCompany(tokenData.access_token, companyId);
            if (switchedToken) {
                cacheToken(switchedToken, cacheKey, companyId);
                console.log(`[TOKEN-HANDLER] Switched to company ${companyId} for "${cacheKey}"`);
                return jsonResponse(switchedToken);
            }
        }

        // Cache the token (per username + companyId)
        cacheToken(tokenData, cacheKey, companyId);

        console.log(`[TOKEN-HANDLER] New token fetched and cached for "${cacheKey}" company: ${companyId || 'default'}`);

        return jsonResponse(tokenData);

    } catch (error) {
        console.error('[TOKEN-HANDLER] Error:', error.message);
        return errorResponse('Failed to fetch token: ' + error.message, 500);
    }
}

/**
 * Try to switch TPOS company context
 * TPOS uses ResUsers/ODataService.SwitchCompany to change company
 * Returns new token data if successful, null otherwise
 * @param {string} accessToken - Current valid token
 * @param {string|number} companyId - Target company ID
 * @returns {Promise<object|null>}
 */
async function trySwitchCompany(accessToken, companyId) {
    try {
        const switchUrl = `${API_ENDPOINTS.TPOS.ODATA}/ResUsers/ODataService.SwitchCompany`;

        console.log(`[TOKEN-HANDLER] Switching to company ${companyId}...`);

        const response = await fetchWithRetry(switchUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json;charset=UTF-8',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://tomato.tpos.vn',
                'Referer': 'https://tomato.tpos.vn/',
                'tposappversion': '6.2.6.1'
            },
            body: JSON.stringify({ companyId: parseInt(companyId) })
        }, 2, 1000, 10000);

        if (!response.ok) {
            console.warn(`[TOKEN-HANDLER] SwitchCompany failed: ${response.status}`);
            return null;
        }

        const data = await response.json();

        // SwitchCompany typically returns new token data
        if (data.access_token) {
            return data;
        }

        // Some TPOS versions return the token in a different format
        if (data.token || data.Token) {
            return {
                access_token: data.token || data.Token,
                expires_in: data.expires_in || data.ExpiresIn || 1296000,
                token_type: 'Bearer'
            };
        }

        console.warn('[TOKEN-HANDLER] SwitchCompany response has no token:', Object.keys(data));
        return null;

    } catch (error) {
        console.warn(`[TOKEN-HANDLER] SwitchCompany error: ${error.message}`);
        return null;
    }
}
