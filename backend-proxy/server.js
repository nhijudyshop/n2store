const express = require('express');
const cors = require('cors');

const app = express();

// CORS - Allow requests from your GitHub Pages
app.use(cors({
    origin: [
        'https://nhijudyshop.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '10mb' }));

// Get API key from environment variable (set on Render)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Gemini Proxy Server is running',
        hasApiKey: !!GEMINI_API_KEY
    });
});

// Main chat endpoint
// POST /api/chat
// Body: { model: "gemini-2.0-flash", contents: [...] }
app.post('/api/chat', async (req, res) => {
    try {
        if (!GEMINI_API_KEY) {
            return res.status(500).json({
                error: { message: 'API Key not configured on server' }
            });
        }

        const { model = 'gemini-2.0-flash', contents } = req.body;

        if (!contents || !Array.isArray(contents)) {
            return res.status(400).json({
                error: { message: 'Invalid request: contents array is required' }
            });
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

        console.log(`[Proxy] Request to ${model} with ${contents.length} content(s)`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        const data = await response.json();

        if (data.error) {
            console.error('[Proxy] Gemini API error:', data.error.message);
        } else {
            console.log('[Proxy] Success');
        }

        res.json(data);

    } catch (error) {
        console.error('[Proxy] Server error:', error.message);
        res.status(500).json({
            error: { message: 'Proxy server error: ' + error.message }
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Gemini Proxy Server running on port ${PORT}`);
    console.log(`API Key configured: ${GEMINI_API_KEY ? 'Yes' : 'No'}`);
});
