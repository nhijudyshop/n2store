/* =====================================================
   DEEPSEEK AI HELPER - For Invoice Analysis
   Alternative/Fallback to Gemini API
   
   DeepSeek API Documentation:
   https://platform.deepseek.com/api-docs
   
   Models:
   - deepseek-chat: General chat/analysis
   - deepseek-reasoner: Deep reasoning (more expensive)
   ===================================================== */

// Load DeepSeek API Key
const DEEPSEEK_API_KEY = (window.DEEPSEEK_API_KEY || "").trim();

// API Configuration
const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1';
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // 500ms between requests

// =====================================================
// API CALL HELPER
// =====================================================

async function callDeepSeekAPI(messages, options = {}) {
    const {
        model = DEEPSEEK_DEFAULT_MODEL,
        maxTokens = 4096,
        temperature = 0.7,
    } = options;

    if (!DEEPSEEK_API_KEY) {
        throw new Error('DeepSeek API key chưa được cấu hình. Vui lòng set DEEPSEEK_API_KEY.');
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();

    const url = `${DEEPSEEK_API_BASE}/chat/completions`;

    try {
        console.log(`[DEEPSEEK] Calling API with model: ${model}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                max_tokens: maxTokens,
                temperature: temperature,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        const result = await response.json();
        const text = result.choices?.[0]?.message?.content;

        if (!text) {
            throw new Error('No content in response');
        }

        // Log usage for monitoring
        if (result.usage) {
            console.log(`[DEEPSEEK] ✅ Success - Tokens: ${result.usage.total_tokens} (prompt: ${result.usage.prompt_tokens}, completion: ${result.usage.completion_tokens})`);
        }

        return text;

    } catch (error) {
        console.error(`[DEEPSEEK] ❌ Error:`, error.message);
        throw error;
    }
}

// =====================================================
// TEXT GENERATION
// =====================================================

async function generateText(prompt, options = {}) {
    const messages = [
        { role: 'user', content: prompt }
    ];
    return callDeepSeekAPI(messages, options);
}

// =====================================================
// IMAGE ANALYSIS (Vision)
// =====================================================

async function analyzeImage(base64Image, prompt, options = {}) {
    const {
        model = 'deepseek-chat', // deepseek-chat supports vision
        mimeType = 'image/jpeg',
    } = options;

    // DeepSeek uses OpenAI-compatible format for vision
    const messages = [
        {
            role: 'user',
            content: [
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:${mimeType};base64,${base64Image}`,
                    },
                },
                {
                    type: 'text',
                    text: prompt,
                },
            ],
        },
    ];

    return callDeepSeekAPI(messages, { ...options, model });
}

// =====================================================
// HELPER: Convert File to Base64
// =====================================================

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// =====================================================
// EXPORT
// =====================================================

window.DeepSeekAI = {
    generateText,
    analyzeImage,
    fileToBase64,
    callDeepSeekAPI,
    isConfigured: () => !!DEEPSEEK_API_KEY,
    getStats: () => ({
        configured: !!DEEPSEEK_API_KEY,
        model: DEEPSEEK_DEFAULT_MODEL,
        apiBase: DEEPSEEK_API_BASE,
    }),
};

console.log(`[DEEPSEEK-AI-HELPER] Loaded - API Key: ${DEEPSEEK_API_KEY ? 'Configured ✓' : '⚠️ NOT CONFIGURED'}`);
