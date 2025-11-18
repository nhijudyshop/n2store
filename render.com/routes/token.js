// =====================================================
// TOKEN ROUTE - /api/token
// Proxy to TPOS OAuth token endpoint
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

// POST /api/token - Get OAuth token
router.post('/', async (req, res) => {
    try {
        console.log('[TOKEN] Fetching token from TPOS...');

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
            console.error('[TOKEN] ❌ Response missing access_token:', data);
            throw new Error('Invalid token response - missing access_token');
        }

        console.log('[TOKEN] ✅ Token obtained successfully');
        console.log('[TOKEN] Token expires in:', data.expires_in, 'seconds');
        console.log('[TOKEN] Token type:', data.token_type);

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
