/* =====================================================
   GEMINI AI HELPER - Auto Key Rotation
   Based on AI/GEMINI-AI-GUIDE.md
   ===================================================== */

// Load API Keys from GitHub Secrets or environment
const GEMINI_KEYS = (window.GEMINI_KEYS || "").split(",").filter(k => k.trim());
const HF_KEYS = (window.HF_KEYS || "").split(",").filter(k => k.trim());

// Key rotation state
let currentGeminiIndex = 0;
let currentHFIndex = 0;
const failedGeminiKeys = new Map(); // key -> timestamp
const failedHFKeys = new Map();

const FAILURE_TIMEOUT = 30000; // 30 seconds

// =====================================================
// KEY MANAGEMENT
// =====================================================

function markGeminiKeyFailed(apiKey) {
    failedGeminiKeys.set(apiKey, Date.now());
    console.warn(`[GEMINI] Key marked as failed, will retry after 30s`);
}

function markHFKeyFailed(apiKey) {
    failedHFKeys.set(apiKey, Date.now());
    console.warn(`[HF] Key marked as failed, will retry after 30s`);
}

function cleanupFailedKeys(failedMap) {
    const now = Date.now();
    for (const [key, timestamp] of failedMap.entries()) {
        if (now - timestamp > FAILURE_TIMEOUT) {
            failedMap.delete(key);
        }
    }
}

function getNextGeminiKey() {
    if (GEMINI_KEYS.length === 0) {
        throw new Error('No Gemini API keys configured');
    }

    cleanupFailedKeys(failedGeminiKeys);

    const maxAttempts = GEMINI_KEYS.length * 2;
    let attempts = 0;

    while (attempts < maxAttempts) {
        const key = GEMINI_KEYS[currentGeminiIndex];
        currentGeminiIndex = (currentGeminiIndex + 1) % GEMINI_KEYS.length;

        if (!failedGeminiKeys.has(key)) {
            return key;
        }
        attempts++;
    }

    // All keys failed recently, clear and retry
    console.warn('[GEMINI] All keys failed, clearing and retrying...');
    failedGeminiKeys.clear();
    return GEMINI_KEYS[0];
}

function getNextHFKey() {
    if (HF_KEYS.length === 0) {
        throw new Error('No HuggingFace API keys configured');
    }

    cleanupFailedKeys(failedHFKeys);

    const maxAttempts = HF_KEYS.length * 2;
    let attempts = 0;

    while (attempts < maxAttempts) {
        const key = HF_KEYS[currentHFIndex];
        currentHFIndex = (currentHFIndex + 1) % HF_KEYS.length;

        if (!failedHFKeys.has(key)) {
            return key;
        }
        attempts++;
    }

    console.warn('[HF] All keys failed, clearing and retrying...');
    failedHFKeys.clear();
    return HF_KEYS[0];
}

// =====================================================
// GEMINI API - TEXT GENERATION
// =====================================================

async function callGeminiAPI(prompt, options = {}) {
    const {
        model = 'gemini-flash-latest',
        maxRetries = Math.max(GEMINI_KEYS.length, 3),
        temperature = 0.7,
    } = options;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const apiKey = getNextGeminiKey();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            console.log(`[GEMINI] Attempt ${attempt + 1}/${maxRetries} using model: ${model}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: temperature,
                        maxOutputTokens: 8192,
                    }
                })
            });

            // Handle rate limit and quota errors
            if (response.status === 429 || response.status === 403 || response.status === 503) {
                console.warn(`[GEMINI] Error ${response.status}, rotating key...`);
                markGeminiKeyFailed(apiKey);
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
        model = 'gemini-flash-latest',
        maxRetries = Math.max(GEMINI_KEYS.length, 3),
        mimeType = 'image/jpeg',
    } = options;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const apiKey = getNextGeminiKey();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            console.log(`[GEMINI-VISION] Attempt ${attempt + 1}/${maxRetries}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
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
                        temperature: 0.4, // Lower temperature for more accurate extraction
                        maxOutputTokens: 8192,
                    }
                })
            });

            // Handle rate limit and quota errors
            if (response.status === 429 || response.status === 403 || response.status === 503) {
                console.warn(`[GEMINI-VISION] Error ${response.status}, rotating key...`);
                markGeminiKeyFailed(apiKey);
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

    // If we get here, all retries failed
    throw new Error(`Gemini Vision failed after ${maxRetries} attempts. All API keys are exhausted or rate limited.`);
}

// =====================================================
// HELPER: Convert File to Base64
// =====================================================

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
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
        geminiKeys: GEMINI_KEYS.length,
        hfKeys: HF_KEYS.length,
        failedGemini: failedGeminiKeys.size,
        failedHF: failedHFKeys.size,
    })
};

console.log('[GEMINI-AI-HELPER] Loaded with', GEMINI_KEYS.length, 'Gemini keys and', HF_KEYS.length, 'HF keys');
