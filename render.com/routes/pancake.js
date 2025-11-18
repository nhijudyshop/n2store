// =====================================================
// PANCAKE ROUTE - /api/pancake/*
// Proxy to Pancake Chat API endpoint
// =====================================================

const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const router = express.Router();

const PANCAKE_BASE = 'https://pancake.vn/api/v1';

// Create HTTPS agent (for consistency, though Pancake likely has valid cert)
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// GET /api/pancake/* - Proxy all Pancake requests
router.all('/*', async (req, res) => {
    try {
        const path = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        const fullUrl = `${PANCAKE_BASE}/${path}${queryString ? '?' + queryString : ''}`;

        console.log(`[PANCAKE] ${req.method} ${fullUrl}`);

        // Prepare headers
        const headers = {
            'Content-Type': 'application/json'
        };

        // Copy authorization if present
        if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization;
        }

        // Prepare request options
        const options = {
            method: req.method,
            headers: headers,
            agent: httpsAgent  // Use agent that ignores SSL errors
        };

        // Add body for POST/PUT requests
        if (req.method === 'POST' || req.method === 'PUT') {
            options.body = JSON.stringify(req.body);
        }

        // Forward request to Pancake API
        const response = await fetch(fullUrl, options);

        if (!response.ok) {
            throw new Error(`Pancake API responded with ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        console.log(`[PANCAKE] ✅ Success`);

        // Return data
        res.json(data);

    } catch (error) {
        console.error('[PANCAKE] ❌ Error:', error.message);
        res.status(500).json({
            error: 'Failed to fetch Pancake data',
            message: error.message
        });
    }
});

module.exports = router;
