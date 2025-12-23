/* =====================================================
   DEEPSEEK AI HELPER - For Invoice Analysis
   Multi-OCR Engine Support with Intelligent Fallback

   OCR Priority:
   1. Google Cloud Vision (highest accuracy, 95%+)
   2. DeepSeek-OCR via alphaXiv (good accuracy)
   3. Tesseract.js (fallback, lower accuracy)

   Flow:
   Image → [OCR Engine] → Raw text → [DeepSeek API] → Structured JSON
   ===================================================== */

// Load API Keys
const DEEPSEEK_API_KEY = (window.DEEPSEEK_API_KEY || "").trim();
const GOOGLE_CLOUD_VISION_API_KEY = (window.GOOGLE_CLOUD_VISION_API_KEY || "").trim();

// API Configuration
const WORKER_PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const DEEPSEEK_API_BASE = `${WORKER_PROXY_URL}/api/deepseek`;
const DEEPSEEK_OCR_API = `${WORKER_PROXY_URL}/api/deepseek-ocr`;
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';
const GOOGLE_VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500;

// OCR Status
let ocrWorker = null;
let ocrReady = false;
let deepseekOcrAvailable = true;
let googleVisionAvailable = true;

// =====================================================
// 1. GOOGLE CLOUD VISION OCR (Primary - Highest Accuracy)
// =====================================================

async function extractTextWithGoogleVision(base64Image) {
    if (!GOOGLE_CLOUD_VISION_API_KEY) {
        throw new Error('Google Cloud Vision API key not configured');
    }

    console.log('[GOOGLE-VISION] 📷 Calling Google Cloud Vision API...');

    const url = `${GOOGLE_VISION_API_URL}?key=${GOOGLE_CLOUD_VISION_API_KEY}`;

    const requestBody = {
        requests: [{
            image: { content: base64Image },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
            imageContext: { languageHints: ['vi', 'en'] }
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || response.statusText);
        }

        const result = await response.json();
        const fullText = result.responses?.[0]?.fullTextAnnotation?.text
            || result.responses?.[0]?.textAnnotations?.[0]?.description
            || '';

        if (!fullText) {
            throw new Error('No text found in image');
        }

        console.log(`[GOOGLE-VISION] ✅ Extracted ${fullText.length} characters`);
        return fullText;

    } catch (error) {
        console.error('[GOOGLE-VISION] ❌ Failed:', error.message);
        googleVisionAvailable = false;
        throw error;
    }
}

// =====================================================
// 2. DEEPSEEK-OCR via alphaXiv (Secondary)
// =====================================================

async function extractTextWithDeepSeekOCR(imageSource) {
    try {
        console.log('[DEEPSEEK-OCR] 📷 Calling DeepSeek-OCR (alphaXiv)...');

        // Convert to File for FormData
        let file;
        if (imageSource instanceof File) {
            file = imageSource;
        } else if (imageSource instanceof Blob) {
            file = new File([imageSource], 'image.jpg', { type: imageSource.type || 'image/jpeg' });
        } else if (typeof imageSource === 'string') {
            let base64Data = imageSource;
            let mimeType = 'image/jpeg';

            if (imageSource.startsWith('data:')) {
                const matches = imageSource.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) {
                    mimeType = matches[1];
                    base64Data = matches[2];
                }
            }

            const byteCharacters = atob(base64Data);
            const byteArray = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteArray[i] = byteCharacters.charCodeAt(i);
            }
            const blob = new Blob([byteArray], { type: mimeType });
            file = new File([blob], 'image.jpg', { type: mimeType });
        } else {
            throw new Error('Unsupported image source type');
        }

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(DEEPSEEK_OCR_API, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = typeof errorData.error === 'string'
                ? errorData.error
                : (errorData.message || JSON.stringify(errorData) || response.statusText);
            throw new Error(`DeepSeek-OCR failed: ${errorMsg}`);
        }

        const result = await response.json();
        const text = result.text || result.output || result.result || '';

        console.log(`[DEEPSEEK-OCR] ✅ Extracted ${text.length} characters`);
        return text;

    } catch (error) {
        console.error('[DEEPSEEK-OCR] ❌ Failed:', error.message);
        deepseekOcrAvailable = false;
        throw error;
    }
}

// =====================================================
// 3. TESSERACT.JS OCR (Fallback)
// =====================================================

async function initializeTesseractOCR() {
    if (ocrReady && ocrWorker) return ocrWorker;

    try {
        console.log('[TESSERACT] 🔤 Initializing Tesseract.js...');

        if (typeof Tesseract === 'undefined') {
            throw new Error('Tesseract.js not loaded');
        }

        ocrWorker = await Tesseract.createWorker('vie+eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    console.log(`[TESSERACT] Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        ocrReady = true;
        console.log('[TESSERACT] ✅ Initialized');
        return ocrWorker;

    } catch (error) {
        console.error('[TESSERACT] ❌ Init failed:', error);
        throw error;
    }
}

async function extractTextWithTesseract(imageSource) {
    try {
        console.log('[TESSERACT] 📷 Extracting text...');

        const worker = await initializeTesseractOCR();

        let imageData = imageSource;
        if (typeof imageSource === 'string' && !imageSource.startsWith('data:') && !imageSource.startsWith('http')) {
            imageData = `data:image/jpeg;base64,${imageSource}`;
        }

        const result = await worker.recognize(imageData);
        const text = result.data.text;

        console.log(`[TESSERACT] ✅ Extracted ${text.length} characters`);
        return text;

    } catch (error) {
        console.error('[TESSERACT] ❌ Failed:', error);
        throw error;
    }
}

// =====================================================
// SMART OCR - Auto-select best available engine
// =====================================================

async function extractTextFromImage(imageSource, mimeType = 'image/jpeg') {
    // Prepare base64 for Google Vision
    let base64Data = imageSource;
    if (typeof imageSource === 'string' && imageSource.startsWith('data:')) {
        base64Data = imageSource.split(',')[1];
    }

    // 1. Try Google Cloud Vision first (most accurate)
    if (GOOGLE_CLOUD_VISION_API_KEY && googleVisionAvailable) {
        try {
            console.log('[OCR] 🔍 Trying Google Cloud Vision (Primary)...');
            return await extractTextWithGoogleVision(base64Data);
        } catch (error) {
            console.warn('[OCR] Google Vision failed:', error.message);
        }
    }

    // 2. Try DeepSeek-OCR (alphaXiv) as secondary
    if (deepseekOcrAvailable) {
        try {
            console.log('[OCR] 🔍 Trying DeepSeek-OCR (Secondary)...');
            return await extractTextWithDeepSeekOCR(imageSource);
        } catch (error) {
            console.warn('[OCR] DeepSeek-OCR failed:', error.message);
        }
    }

    // 3. Fallback to Tesseract.js
    console.log('[OCR] 🔍 Falling back to Tesseract.js...');
    return await extractTextWithTesseract(imageSource);
}

// Get current OCR engine name
function getCurrentOCREngine() {
    if (GOOGLE_CLOUD_VISION_API_KEY && googleVisionAvailable) {
        return 'Google Cloud Vision';
    }
    if (deepseekOcrAvailable) {
        return 'DeepSeek-OCR';
    }
    return 'Tesseract.js';
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
        throw new Error('DeepSeek API key not configured');
    }

    // Rate limiting
    const now = Date.now();
    if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
        await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL - (now - lastRequestTime)));
    }
    lastRequestTime = Date.now();

    try {
        console.log(`[DEEPSEEK] 🤖 Calling API (model: ${model})...`);

        const response = await fetch(DEEPSEEK_API_BASE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model, messages, max_tokens: maxTokens, temperature,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || response.statusText);
        }

        const result = await response.json();
        const text = result.choices?.[0]?.message?.content;

        if (!text) throw new Error('No content in response');

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
    return callDeepSeekAPI([{ role: 'user', content: prompt }], options);
}

// =====================================================
// IMAGE ANALYSIS (OCR + DeepSeek)
// =====================================================

async function analyzeImage(base64Image, prompt, options = {}) {
    const { mimeType = 'image/jpeg' } = options;

    console.log('[ANALYZE] 🖼️ Starting image analysis...');

    // Step 1: OCR
    const imageData = `data:${mimeType};base64,${base64Image}`;
    const extractedText = await extractTextFromImage(imageData, mimeType);

    if (!extractedText || extractedText.trim().length < 10) {
        throw new Error('OCR không thể trích xuất đủ text từ ảnh.');
    }

    // Step 2: DeepSeek Analysis
    console.log('[ANALYZE] 📝 Analyzing with DeepSeek...');

    const analysisPrompt = `Dưới đây là text được trích xuất từ hình ảnh hóa đơn bằng OCR:

--- BẮT ĐẦU TEXT TỪ ẢNH ---
${extractedText}
--- KẾT THÚC TEXT TỪ ẢNH ---

${prompt}`;

    return await callDeepSeekAPI([{ role: 'user', content: analysisPrompt }], options);
}

// =====================================================
// ANALYZE MULTIPLE IMAGES
// =====================================================

async function analyzeMultipleImages(images, prompt, options = {}) {
    console.log(`[ANALYZE] 🖼️ Processing ${images.length} image(s)...`);

    const allTexts = [];

    for (let i = 0; i < images.length; i++) {
        console.log(`[ANALYZE] Image ${i + 1}/${images.length}...`);
        try {
            const imageData = `data:${images[i].mimeType || 'image/jpeg'};base64,${images[i].base64}`;
            const text = await extractTextFromImage(imageData);
            if (text && text.trim().length > 10) {
                allTexts.push(`--- ẢNH ${i + 1} ---\n${text}`);
            }
        } catch (error) {
            console.warn(`[ANALYZE] Image ${i + 1} failed:`, error.message);
        }
    }

    if (allTexts.length === 0) {
        throw new Error('Không thể trích xuất text từ bất kỳ ảnh nào.');
    }

    const analysisPrompt = `Dưới đây là text từ ${images.length} hình ảnh hóa đơn:

${allTexts.join('\n\n')}

${prompt}`;

    return await callDeepSeekAPI([{ role: 'user', content: analysisPrompt }], options);
}

// =====================================================
// UTILITIES
// =====================================================

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function terminateOCR() {
    if (ocrWorker) {
        await ocrWorker.terminate();
        ocrWorker = null;
        ocrReady = false;
        console.log('[TESSERACT] 🧹 Worker terminated');
    }
}

async function initializeOCR() {
    console.log('[OCR] Initializing...');
    if (GOOGLE_CLOUD_VISION_API_KEY) {
        console.log('[OCR] ✅ Google Cloud Vision ready');
    }
    if (deepseekOcrAvailable) {
        console.log('[OCR] ✅ DeepSeek-OCR ready');
    }
    return true;
}

// =====================================================
// EXPORT
// =====================================================

window.DeepSeekAI = {
    // Core
    generateText,
    analyzeImage,
    analyzeMultipleImages,
    callDeepSeekAPI,

    // OCR
    extractTextFromImage,
    extractTextWithGoogleVision,
    extractTextWithDeepSeekOCR,
    extractTextWithTesseract,
    initializeOCR,
    initializeTesseractOCR,
    terminateOCR,
    getCurrentOCREngine,

    // Utils
    fileToBase64,

    // Status
    isConfigured: () => !!DEEPSEEK_API_KEY,
    isGoogleVisionConfigured: () => !!GOOGLE_CLOUD_VISION_API_KEY,
    isDeepSeekOCRAvailable: () => deepseekOcrAvailable,
    isOCRReady: () => !!GOOGLE_CLOUD_VISION_API_KEY || deepseekOcrAvailable || ocrReady,

    getStats: () => ({
        deepseekConfigured: !!DEEPSEEK_API_KEY,
        googleVisionConfigured: !!GOOGLE_CLOUD_VISION_API_KEY,
        deepseekOcrAvailable,
        tesseractReady: ocrReady,
        currentOCREngine: getCurrentOCREngine(),
        model: DEEPSEEK_DEFAULT_MODEL,
        proxyUrl: WORKER_PROXY_URL,
    }),
};

// Log status
console.log(`[AI-HELPER] ====================================`);
console.log(`[AI-HELPER] DeepSeek API: ${DEEPSEEK_API_KEY ? '✅' : '❌'}`);
console.log(`[AI-HELPER] Google Cloud Vision: ${GOOGLE_CLOUD_VISION_API_KEY ? '✅ (Primary)' : '❌'}`);
console.log(`[AI-HELPER] DeepSeek-OCR: ✅ (Secondary)`);
console.log(`[AI-HELPER] Tesseract.js: ✅ (Fallback)`);
console.log(`[AI-HELPER] Current OCR: ${getCurrentOCREngine()}`);
console.log(`[AI-HELPER] ====================================`);
