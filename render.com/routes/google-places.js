// =====================================================
// GOOGLE PLACES API PROXY ROUTE
// Proxy requests to Google Places API (New) with server-side API key
// =====================================================

const express = require('express');
const router = express.Router();

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_API_URL = 'https://places.googleapis.com/v1/places:autocomplete';

// Health check
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Google Places Autocomplete Proxy',
        hasApiKey: !!GOOGLE_PLACES_API_KEY
    });
});

// Autocomplete endpoint
// POST /api/google-places/autocomplete
// Body: { input: "123 nguyễn huệ", languageCode?: "vi", regionCode?: "VN" }
router.post('/autocomplete', async (req, res) => {
    try {
        if (!GOOGLE_PLACES_API_KEY) {
            return res.status(500).json({
                error: { message: 'GOOGLE_PLACES_API_KEY not configured on server' }
            });
        }

        const { input, languageCode = 'vi', regionCode = 'VN' } = req.body;

        if (!input || input.trim().length < 2) {
            return res.status(400).json({
                error: { message: 'Input must be at least 2 characters' }
            });
        }

        console.log(`[GOOGLE-PLACES] Autocomplete request: "${input.trim()}"`);

        const requestBody = {
            input: input.trim(),
            languageCode,
            regionCode,
            includedRegionCodes: [regionCode]
        };

        const response = await fetch(PLACES_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            console.error('[GOOGLE-PLACES] API error:', data.error.message);
        } else {
            const count = data.suggestions?.length || 0;
            console.log(`[GOOGLE-PLACES] Success - ${count} suggestions`);
        }

        res.json(data);

    } catch (error) {
        console.error('[GOOGLE-PLACES] Server error:', error.message);
        res.status(500).json({
            error: { message: 'Proxy server error: ' + error.message }
        });
    }
});

module.exports = router;
