// =====================================================
// ODATA ROUTE - /api/odata/*
// Proxy to TPOS OData endpoint
// =====================================================

const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const TPOS_ODATA_BASE = 'https://services.tpos.dev/api/odata';

// GET /api/odata/* - Proxy all OData requests
router.all('/*', async (req, res) => {
    try {
        const path = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        const fullUrl = `${TPOS_ODATA_BASE}/${path}${queryString ? '?' + queryString : ''}`;

        console.log(`[ODATA] ${req.method} ${fullUrl}`);

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

        // Forward request to TPOS
        const response = await fetch(fullUrl, options);

        if (!response.ok) {
            throw new Error(`TPOS OData API responded with ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        console.log(`[ODATA] ✅ Success`);

        // Return data
        res.json(data);

    } catch (error) {
        console.error('[ODATA] ❌ Error:', error.message);
        res.status(500).json({
            error: 'Failed to fetch OData',
            message: error.message
        });
    }
});

module.exports = router;
