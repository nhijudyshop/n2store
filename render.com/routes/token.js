// =====================================================
// TOKEN ROUTE - /api/token
// Proxy to TPOS OAuth token endpoint with server-side caching
// =====================================================

const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const router = express.Router();

const TPOS_TOKEN_URL = 'https://tomato.tpos.vn/token';

// Create HTTPS agent that ignores SSL certificate errors
// TPOS uses self-signed certificate
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// =====================================================
// TPOS TOKEN CACHE (In-memory)
// =====================================================
const tokenCache = {
    access_token: null,
    expiry: null,
    expires_in: null,
    token_type: null,
    refresh_token: null
};

/**
 * Check if cached token is still valid
 * @returns {boolean}
 */
function isCachedTokenValid() {
    if (!tokenCache.access_token || !tokenCache.expiry) {
        return false;
    }

    // Add 5-minute buffer before expiry
    const buffer = 5 * 60 * 1000;
    const now = Date.now();

    return now < (tokenCache.expiry - buffer);
}

/**
 * Cache token data
 * @param {object} tokenData - Token response from TPOS
 */
function cacheToken(tokenData) {
    const expiryTimestamp = Date.now() + (tokenData.expires_in * 1000);

    tokenCache.access_token = tokenData.access_token;
    tokenCache.expiry = expiryTimestamp;
    tokenCache.expires_in = tokenData.expires_in;
    tokenCache.token_type = tokenData.token_type || 'Bearer';
    tokenCache.refresh_token = tokenData.refresh_token || null;

    console.log('[RENDER-TOKEN] ✅ Token cached, expires at:', new Date(expiryTimestamp).toISOString());
    console.log('[RENDER-TOKEN] Token lifetime:', Math.floor(tokenData.expires_in / 3600), 'hours');
}

/**
 * Get cached token if valid
 * @returns {object|null}
 */
function getCachedToken() {
    if (isCachedTokenValid()) {
        const remainingSeconds = Math.floor((tokenCache.expiry - Date.now()) / 1000);
        console.log('[RENDER-TOKEN] ✅ Using cached token, expires in:', Math.floor(remainingSeconds / 60), 'minutes');
        return {
            access_token: tokenCache.access_token,
            expires_in: remainingSeconds,
            token_type: tokenCache.token_type,
            refresh_token: tokenCache.refresh_token
        };
    }
    return null;
}

// POST /api/token - Get OAuth token with caching
router.post('/', async (req, res) => {
    try {
        // Check cache first
        const cachedToken = getCachedToken();
        if (cachedToken) {
            console.log('[RENDER-TOKEN] 🚀 Returning cached token');
            return res.json(cachedToken);
        }

        // Cache miss - fetch new token from TPOS
        console.log('[RENDER-TOKEN] 🔄 Cache miss, fetching new token from TPOS...');

        // Get credentials from request body
        const { grant_type, username, password, client_id } = req.body;

        // Validate required fields
        if (!grant_type || !username || !password || !client_id) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['grant_type', 'username', 'password', 'client_id']
            });
        }

        // Create form data (URL-encoded format)
        const formBody = `grant_type=${encodeURIComponent(grant_type)}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&client_id=${encodeURIComponent(client_id)}`;

        // Request token from TPOS
        const response = await fetch(TPOS_TOKEN_URL, {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json;charset=UTF-8',
                'tposappversion': '5.11.16.1',
                'x-tpos-lang': 'vi',
                'Referer': 'https://tomato.tpos.vn/'
            },
            body: formBody,
            agent: httpsAgent  // Use agent that ignores SSL errors
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[TOKEN] ❌ TPOS error ${response.status}:`, errorText);
            throw new Error(`TPOS API responded with ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate response contains access_token
        if (!data.access_token) {
            console.error('[RENDER-TOKEN] ❌ Response missing access_token:', data);
            throw new Error('Invalid token response - missing access_token');
        }

        console.log('[RENDER-TOKEN] ✅ Token obtained successfully');
        console.log('[RENDER-TOKEN] Token expires in:', data.expires_in, 'seconds');
        console.log('[RENDER-TOKEN] Token type:', data.token_type);

        // Cache the token
        cacheToken(data);

        // Return token data (includes access_token, expires_in, refresh_token, etc.)
        res.json(data);

    } catch (error) {
        console.error('[TOKEN] ❌ Error:', error.message);
        res.status(500).json({
            error: 'Failed to fetch token',
            message: error.message
        });
    }
});

module.exports = router;
