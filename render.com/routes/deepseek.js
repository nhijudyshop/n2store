// =====================================================
// DEEPSEEK AI PROXY ROUTE
// Proxy requests to DeepSeek API with server-side API key
// =====================================================

const express = require('express');
const router = express.Router();

// API Key from environment variable (set on Render)
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// Health check
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'DeepSeek AI Proxy',
        hasApiKey: !!DEEPSEEK_API_KEY,
        model: 'deepseek-chat'
    });
});

// Main chat endpoint
// POST /api/deepseek/chat
// Body: { model?: "deepseek-chat", messages: [...], max_tokens?: 4096, temperature?: 0.3 }
router.post('/chat', async (req, res) => {
    try {
        if (!DEEPSEEK_API_KEY) {
            return res.status(500).json({
                error: { message: 'DEEPSEEK_API_KEY not configured on server' }
            });
        }

        const { 
            model = 'deepseek-chat', 
            messages, 
            max_tokens = 4096, 
            temperature = 0.3 
        } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: { message: 'Invalid request: messages array is required' }
            });
        }

        console.log(`[DEEPSEEK] Request with ${messages.length} message(s)`);

        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens,
                temperature
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('[DEEPSEEK] API error:', data.error.message || data.error);
        } else {
            const tokens = data.usage?.total_tokens || 'N/A';
            console.log(`[DEEPSEEK] Success - Tokens: ${tokens}`);
        }

        res.json(data);

    } catch (error) {
        console.error('[DEEPSEEK] Server error:', error.message);
        res.status(500).json({
            error: { message: 'Proxy server error: ' + error.message }
        });
    }
});

module.exports = router;
