/* =====================================================
   GEMINI AI HELPER - PRO Key Only Version
   Sử dụng duy nhất 1 PRO key với model gemini-2.0-flash
   ===================================================== */

// Load PRO Key from GitHub Secrets or environment
const GEMINI_PRO_KEY = (window.GEMINI_PRO_KEY || "").trim();

// Fallback: check window.GEMINI_KEYS if PRO key not set
const GEMINI_KEYS = GEMINI_PRO_KEY
    ? [GEMINI_PRO_KEY]
    : (window.GEMINI_KEYS || "").split(",").filter(k => k.trim());

// Default model - sử dụng gemini-2.0-flash thay vì gemini-flash-latest
const DEFAULT_MODEL = 'gemini-2.0-flash';

// Key rotation state
let currentKeyIndex = 0;
const failedKeys = new Map(); // key -> timestamp
const FAILURE_TIMEOUT = 60000; // 60 seconds

// Request rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests
let requestCount = 0;
const MAX_REQUESTS_PER_MINUTE = 15; // Higher limit for PRO key
let requestResetTime = Date.now();

// =====================================================
// RATE LIMITING
// =====================================================

async function checkRateLimit() {
    const now = Date.now();

    // Reset counter every minute
    if (now - requestResetTime > 60000) {
        requestCount = 0;
        requestResetTime = now;
    }

    // Check if we've exceeded rate limit
    if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
        const waitTime = 60000 - (now - requestResetTime);
        console.warn(`[RATE-LIMIT] Max requests per minute reached. Wait ${Math.ceil(waitTime / 1000)}s`);
        throw new Error(`Đã đạt giới hạn ${MAX_REQUESTS_PER_MINUTE} request/phút. Vui lòng chờ ${Math.ceil(waitTime / 1000)} giây.`);
    }

    // Enforce minimum interval between requests
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        console.log(`[RATE-LIMIT] Waiting ${waitTime}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    lastRequestTime = Date.now();
    requestCount++;
}

// =====================================================
// KEY MANAGEMENT
// =====================================================

function markKeyFailed(apiKey) {
    failedKeys.set(apiKey, Date.now());
    console.warn(`[GEMINI] Key marked as failed, will retry after ${FAILURE_TIMEOUT / 1000}s`);
}

function cleanupFailedKeys() {
    const now = Date.now();
    for (const [key, timestamp] of failedKeys.entries()) {
        if (now - timestamp > FAILURE_TIMEOUT) {
            failedKeys.delete(key);
        }
    }
}

function getNextKey() {
    if (GEMINI_KEYS.length === 0) {
        throw new Error('No Gemini API keys configured. Set GEMINI_PRO_KEY or GEMINI_KEYS.');
    }

    cleanupFailedKeys();

    const maxAttempts = GEMINI_KEYS.length * 2;
    let attempts = 0;

    while (attempts < maxAttempts) {
        const key = GEMINI_KEYS[currentKeyIndex];
        currentKeyIndex = (currentKeyIndex + 1) % GEMINI_KEYS.length;

        if (!failedKeys.has(key)) {
            return key;
        }
        attempts++;
    }

    // All keys failed recently, clear and retry
    console.warn('[GEMINI] All keys failed, clearing and retrying...');
    failedKeys.clear();
    return GEMINI_KEYS[0];
}

// =====================================================
// GEMINI API - TEXT GENERATION
// =====================================================

async function callGeminiAPI(prompt, options = {}) {
    const {
        model = DEFAULT_MODEL,
        maxRetries = Math.max(GEMINI_KEYS.length, 3),
        temperature = 1.0,
        thinkingLevel = 'high',
    } = options;

    // Check rate limit before making request
    await checkRateLimit();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const apiKey = getNextKey();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            console.log(`[GEMINI] Attempt ${attempt + 1}/${maxRetries} using model: ${model}`);

            const requestBody = {
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: temperature,
                    maxOutputTokens: 8192,
                }
            };

            // Add thinking config for Gemini 3 models
            if (model.includes('gemini-3')) {
                requestBody.generationConfig.thinkingConfig = { thinkingLevel: thinkingLevel };
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            // Handle rate limit and quota errors
            if (response.status === 429 || response.status === 403 || response.status === 503) {
                console.warn(`[GEMINI] Error ${response.status}, rotating key...`);
                markKeyFailed(apiKey);
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error('No text in response');
            }

            console.log(`[GEMINI] ✅ Success`);
            return text;

        } catch (error) {
            console.error(`[GEMINI] Attempt ${attempt + 1} failed:`, error.message);

            if (attempt === maxRetries - 1) {
                throw new Error(`Gemini API failed after ${maxRetries} attempts: ${error.message}`);
            }

            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
    }
}

// =====================================================
// GEMINI API - VISION (IMAGE ANALYSIS)
// =====================================================

async function analyzeImageWithGemini(base64Image, prompt, options = {}) {
    const {
        model = DEFAULT_MODEL,
        maxRetries = Math.max(GEMINI_KEYS.length, 3),
        mimeType = 'image/jpeg',
        thinkingLevel = 'low',
    } = options;

    // Check rate limit before making request
    await checkRateLimit();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const apiKey = getNextKey();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            console.log(`[GEMINI-VISION] Attempt ${attempt + 1}/${maxRetries} using model: ${model}`);

            const requestBody = {
                contents: [{
                    parts: [
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Image
                            }
                        },
                        { text: prompt }
                    ]
                }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 8192,
                }
            };

            // Add thinking config for Gemini 3 models
            if (model.includes('gemini-3')) {
                requestBody.generationConfig.thinkingConfig = { thinkingLevel: thinkingLevel };
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            // Handle rate limit and quota errors
            if (response.status === 429 || response.status === 403 || response.status === 503) {
                console.warn(`[GEMINI-VISION] Error ${response.status}, rotating key...`);
                markKeyFailed(apiKey);
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error('No text in response');
            }

            console.log(`[GEMINI-VISION] ✅ Success`);
            return text;

        } catch (error) {
            console.error(`[GEMINI-VISION] Attempt ${attempt + 1} failed:`, error.message);

            if (attempt === maxRetries - 1) {
                throw new Error(`Gemini Vision failed after ${maxRetries} attempts: ${error.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
    }

    throw new Error(`Gemini Vision failed after ${maxRetries} attempts. API key exhausted or rate limited.`);
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

window.GeminiAI = {
    callGeminiAPI,
    analyzeImageWithGemini,
    fileToBase64,
    getStats: () => ({
        totalKeys: GEMINI_KEYS.length,
        proKeyConfigured: !!GEMINI_PRO_KEY,
        failedKeys: failedKeys.size,
        currentModel: DEFAULT_MODEL,
    }),
    resetKeys: () => {
        failedKeys.clear();
        currentKeyIndex = 0;
        console.log('[GEMINI] Keys reset');
    }
};

console.log(`[GEMINI-AI-HELPER] Loaded with ${GEMINI_KEYS.length} key(s), using model: ${DEFAULT_MODEL}`);
