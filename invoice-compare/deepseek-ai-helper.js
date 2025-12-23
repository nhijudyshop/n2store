/* =====================================================
   DEEPSEEK AI HELPER - For Invoice Analysis
   Using Google Cloud Vision OCR + DeepSeek Text Analysis

   Flow:
   1. Image → Google Cloud Vision API (OCR) → Raw text
   2. Raw text → DeepSeek API → Structured JSON

   This approach provides high accuracy OCR (95%+) with
   DeepSeek's powerful text analysis capabilities.
   ===================================================== */

// Load API Keys
const DEEPSEEK_API_KEY = (window.DEEPSEEK_API_KEY || "").trim();
const GOOGLE_CLOUD_VISION_API_KEY = (window.GOOGLE_CLOUD_VISION_API_KEY || "").trim();

// API Configuration
const DEEPSEEK_API_BASE = 'https://api.deepseek.com';
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';
const GOOGLE_VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // 500ms between requests

// =====================================================
// GOOGLE CLOUD VISION OCR
// =====================================================

async function extractTextWithGoogleVision(base64Image) {
    if (!GOOGLE_CLOUD_VISION_API_KEY) {
        throw new Error('Google Cloud Vision API key chưa được cấu hình.');
    }

    console.log('[VISION] 📷 Calling Google Cloud Vision API for OCR...');

    const url = `${GOOGLE_VISION_API_URL}?key=${GOOGLE_CLOUD_VISION_API_KEY}`;

    const requestBody = {
        requests: [
            {
                image: {
                    content: base64Image
                },
                features: [
                    {
                        type: 'DOCUMENT_TEXT_DETECTION',
                        maxResults: 1
                    }
                ],
                imageContext: {
                    languageHints: ['vi', 'en']
                }
            }
        ]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error?.message || response.statusText;
            throw new Error(`Google Vision API Error: ${errorMsg}`);
        }

        const result = await response.json();

        // Extract text from response
        const textAnnotations = result.responses?.[0]?.textAnnotations;
        const fullTextAnnotation = result.responses?.[0]?.fullTextAnnotation;

        if (!textAnnotations && !fullTextAnnotation) {
            throw new Error('Không thể trích xuất text từ ảnh. Vui lòng thử ảnh rõ hơn.');
        }

        // Use fullTextAnnotation for better structured text
        const extractedText = fullTextAnnotation?.text || textAnnotations?.[0]?.description || '';

        console.log(`[VISION] ✅ OCR completed. Extracted ${extractedText.length} characters`);
        console.log('[VISION] Text Preview:', extractedText.substring(0, 500) + '...');

        return extractedText;

    } catch (error) {
        console.error('[VISION] ❌ Google Vision API Error:', error);
        throw error;
    }
}

// =====================================================
// TESSERACT.JS FALLBACK (if Google Vision fails)
// =====================================================

let ocrWorker = null;
let ocrReady = false;

async function initializeTesseractOCR() {
    if (ocrReady && ocrWorker) {
        return ocrWorker;
    }

    try {
        console.log('[TESSERACT] 🔤 Initializing Tesseract.js as fallback...');

        if (typeof Tesseract === 'undefined') {
            throw new Error('Tesseract.js not loaded.');
        }

        ocrWorker = await Tesseract.createWorker('vie+eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    console.log(`[TESSERACT] Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        ocrReady = true;
        console.log('[TESSERACT] ✅ Tesseract initialized');
        return ocrWorker;

    } catch (error) {
        console.error('[TESSERACT] ❌ Initialization failed:', error);
        throw error;
    }
}

async function extractTextWithTesseract(imageSource) {
    try {
        console.log('[TESSERACT] 📷 Extracting text with Tesseract.js...');

        const worker = await initializeTesseractOCR();

        let imageData = imageSource;
        if (typeof imageSource === 'string' && !imageSource.startsWith('data:') && !imageSource.startsWith('http')) {
            imageData = `data:image/jpeg;base64,${imageSource}`;
        }

        const result = await worker.recognize(imageData);
        const text = result.data.text;

        console.log(`[TESSERACT] ✅ OCR completed. Extracted ${text.length} characters`);

        return text;

    } catch (error) {
        console.error('[TESSERACT] ❌ OCR failed:', error);
        throw error;
    }
}

// =====================================================
// SMART OCR - Try Google Vision first, fallback to Tesseract
// =====================================================

async function extractTextFromImage(base64Image, mimeType = 'image/jpeg') {
    // Try Google Cloud Vision first (more accurate)
    if (GOOGLE_CLOUD_VISION_API_KEY) {
        try {
            return await extractTextWithGoogleVision(base64Image);
        } catch (error) {
            console.warn('[OCR] Google Vision failed, trying Tesseract fallback...', error.message);
        }
    }

    // Fallback to Tesseract.js
    const imageData = `data:${mimeType};base64,${base64Image}`;
    return await extractTextWithTesseract(imageData);
}

// =====================================================
// DEEPSEEK API CALL
// =====================================================

async function callDeepSeekAPI(messages, options = {}) {
    const {
        model = DEEPSEEK_DEFAULT_MODEL,
        maxTokens = 4096,
        temperature = 0.3,
    } = options;

    if (!DEEPSEEK_API_KEY) {
        throw new Error('DeepSeek API key chưa được cấu hình.');
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
        console.log(`[DEEPSEEK] 🤖 Calling API with model: ${model}`);

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
            const errorMsg = errorData.error?.message || response.statusText;
            throw new Error(`DeepSeek API Error: ${errorMsg}`);
        }

        const result = await response.json();
        const text = result.choices?.[0]?.message?.content;

        if (!text) {
            throw new Error('No content in response');
        }

        if (result.usage) {
            console.log(`[DEEPSEEK] ✅ Success - Tokens: ${result.usage.total_tokens}`);
        }

        return text;

    } catch (error) {
        console.error(`[DEEPSEEK] ❌ API Error:`, error.message);
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
// IMAGE ANALYSIS (Google Vision OCR + DeepSeek)
// =====================================================

async function analyzeImage(base64Image, prompt, options = {}) {
    const { mimeType = 'image/jpeg' } = options;

    console.log('[ANALYZE] 🖼️ Starting image analysis...');
    console.log('[ANALYZE] Step 1: OCR with Google Cloud Vision');

    // Step 1: Extract text using OCR
    const extractedText = await extractTextFromImage(base64Image, mimeType);

    if (!extractedText || extractedText.trim().length < 10) {
        throw new Error('OCR không thể trích xuất đủ text từ ảnh. Vui lòng thử ảnh rõ hơn.');
    }

    console.log('[ANALYZE] Step 2: Analyze with DeepSeek');

    // Step 2: Send extracted text to DeepSeek for analysis
    const analysisPrompt = `Dưới đây là text được trích xuất từ hình ảnh hóa đơn bằng OCR:

--- BẮT ĐẦU TEXT TỪ ẢNH ---
${extractedText}
--- KẾT THÚC TEXT TỪ ẢNH ---

${prompt}`;

    const result = await callDeepSeekAPI([
        { role: 'user', content: analysisPrompt }
    ], options);

    return result;
}

// =====================================================
// ANALYZE MULTIPLE IMAGES
// =====================================================

async function analyzeMultipleImages(images, prompt, options = {}) {
    console.log(`[ANALYZE] 🖼️ Analyzing ${images.length} image(s)...`);

    const allTexts = [];

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        console.log(`[ANALYZE] Processing image ${i + 1}/${images.length}...`);

        const text = await extractTextFromImage(img.base64, img.mimeType || 'image/jpeg');

        if (text && text.trim().length > 10) {
            allTexts.push(`--- ẢNH ${i + 1} ---\n${text}`);
        }
    }

    if (allTexts.length === 0) {
        throw new Error('Không thể trích xuất text từ bất kỳ ảnh nào.');
    }

    const combinedText = allTexts.join('\n\n');

    const analysisPrompt = `Dưới đây là text được trích xuất từ ${images.length} hình ảnh hóa đơn:

${combinedText}

${prompt}`;

    const result = await callDeepSeekAPI([
        { role: 'user', content: analysisPrompt }
    ], options);

    return result;
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
// CLEANUP
// =====================================================

async function terminateOCR() {
    if (ocrWorker) {
        await ocrWorker.terminate();
        ocrWorker = null;
        ocrReady = false;
        console.log('[TESSERACT] 🧹 Worker terminated');
    }
}

// =====================================================
// INITIALIZATION (for compatibility)
// =====================================================

async function initializeOCR() {
    // Google Vision doesn't need initialization
    // This is kept for API compatibility
    if (GOOGLE_CLOUD_VISION_API_KEY) {
        console.log('[OCR] ✅ Google Cloud Vision ready');
        return true;
    }

    // Fall back to Tesseract initialization
    return await initializeTesseractOCR();
}

// =====================================================
// EXPORT
// =====================================================

window.DeepSeekAI = {
    // Core functions
    generateText,
    analyzeImage,
    analyzeMultipleImages,
    callDeepSeekAPI,

    // OCR functions
    extractTextFromImage,
    extractTextWithGoogleVision,
    extractTextWithTesseract,
    initializeOCR,
    terminateOCR,

    // Utilities
    fileToBase64,

    // Status
    isConfigured: () => !!DEEPSEEK_API_KEY,
    isGoogleVisionConfigured: () => !!GOOGLE_CLOUD_VISION_API_KEY,
    isOCRReady: () => !!GOOGLE_CLOUD_VISION_API_KEY || ocrReady,

    getStats: () => ({
        deepseekConfigured: !!DEEPSEEK_API_KEY,
        googleVisionConfigured: !!GOOGLE_CLOUD_VISION_API_KEY,
        tesseractReady: ocrReady,
        model: DEEPSEEK_DEFAULT_MODEL,
        ocrEngine: GOOGLE_CLOUD_VISION_API_KEY ? 'Google Cloud Vision' : 'Tesseract.js',
    }),
};

// Log status on load
console.log(`[AI-HELPER] ====================================`);
console.log(`[AI-HELPER] DeepSeek API: ${DEEPSEEK_API_KEY ? '✅ Configured' : '❌ NOT CONFIGURED'}`);
console.log(`[AI-HELPER] Google Cloud Vision: ${GOOGLE_CLOUD_VISION_API_KEY ? '✅ Configured' : '⚠️ Will use Tesseract fallback'}`);
console.log(`[AI-HELPER] OCR Engine: ${GOOGLE_CLOUD_VISION_API_KEY ? 'Google Cloud Vision (High Accuracy)' : 'Tesseract.js (Fallback)'}`);
console.log(`[AI-HELPER] ====================================`);
