// =====================================================
// CHATOMNI ROUTE - /api/api-ms/chatomni/*
// Proxy to ChatOmni API endpoint
// =====================================================

const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const CHATOMNI_BASE = 'https://services.tpos.dev/api/api-ms/chatomni';

// GET /api/api-ms/chatomni/* - Proxy all ChatOmni requests
router.all('/*', async (req, res) => {
    try {
        const path = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        const fullUrl = `${CHATOMNI_BASE}/${path}${queryString ? '?' + queryString : ''}`;

        console.log(`[CHATOMNI] ${req.method} ${fullUrl}`);

        // Get authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                error: 'Missing Authorization header'
            });
        }

        // Prepare headers
        const headers = {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        };

        // Prepare request options
        const options = {
            method: req.method,
            headers: headers
        };

        // Add body for POST/PUT requests
        if (req.method === 'POST' || req.method === 'PUT') {
            options.body = JSON.stringify(req.body);
        }

        // Forward request to ChatOmni API
        const response = await fetch(fullUrl, options);

        if (!response.ok) {
            throw new Error(`ChatOmni API responded with ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        console.log(`[CHATOMNI] ✅ Success`);

        // Return data
        res.json(data);

    } catch (error) {
        console.error('[CHATOMNI] ❌ Error:', error.message);
        res.status(500).json({
            error: 'Failed to fetch ChatOmni data',
            message: error.message
        });
    }
});

module.exports = router;
