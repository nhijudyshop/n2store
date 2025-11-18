// =====================================================
// TOKEN ROUTE - /api/token
// Proxy to TPOS OAuth token endpoint
// =====================================================

const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const TPOS_TOKEN_URL = 'https://services.tpos.dev/oauth/token';

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

        // Create form data
        const params = new URLSearchParams();
        params.append('grant_type', grant_type);
        params.append('username', username);
        params.append('password', password);
        params.append('client_id', client_id);

        // Request token from TPOS
        const response = await fetch(TPOS_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString()
        });

        if (!response.ok) {
            throw new Error(`TPOS API responded with ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        console.log('[TOKEN] ✅ Token obtained successfully');

        // Return token data
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
