/* =====================================================
   DEEPSEEK AI HELPER - For Invoice Analysis
   Using DeepSeek-OCR (via alphaXiv) + DeepSeek Chat Analysis

   DeepSeek API Documentation:
   https://platform.deepseek.com/api-docs

   NOTE: DeepSeek's public API (api.deepseek.com) does NOT support
   image/vision analysis. Only text-based models are available:
   - deepseek-chat: General chat/analysis
   - deepseek-reasoner: Deep reasoning (more expensive)

   This helper uses DeepSeek-OCR (hosted on alphaXiv) to extract text
   from images, then sends the text to DeepSeek for structured analysis.
   Tesseract.js is available as fallback OCR if DeepSeek-OCR fails.
   ===================================================== */

// Load DeepSeek API Key
const DEEPSEEK_API_KEY = (window.DEEPSEEK_API_KEY || "").trim();

// API Configuration - Use Cloudflare Worker proxy to bypass CORS
const WORKER_PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const DEEPSEEK_API_BASE = `${WORKER_PROXY_URL}/api/deepseek`;
const DEEPSEEK_OCR_API = `${WORKER_PROXY_URL}/api/deepseek-ocr`;
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

// OCR Configuration
const OCR_PRIMARY = 'deepseek-ocr'; // 'deepseek-ocr' or 'tesseract'
const OCR_FALLBACK_ENABLED = true;

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // 500ms between requests

// OCR Status
let ocrWorker = null;
let ocrReady = false;
let deepseekOcrAvailable = true; // Will be set to false if DeepSeek-OCR fails

// =====================================================
// DEEPSEEK-OCR (via alphaXiv)
// =====================================================

async function extractTextWithDeepSeekOCR(imageSource) {
    try {
        console.log('[DEEPSEEK-OCR] 📷 Extracting text using DeepSeek-OCR (alphaXiv)...');

        // Convert base64 to Blob/File for FormData
        let file;

        if (imageSource instanceof File) {
            file = imageSource;
        } else if (imageSource instanceof Blob) {
            file = new File([imageSource], 'image.jpg', { type: imageSource.type || 'image/jpeg' });
        } else if (typeof imageSource === 'string') {
            // Handle base64 string
            let base64Data = imageSource;
            let mimeType = 'image/jpeg';

            if (imageSource.startsWith('data:')) {
                // Extract mime type and base64 data from data URI
                const matches = imageSource.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) {
                    mimeType = matches[1];
                    base64Data = matches[2];
                }
            }

            // Convert base64 to Blob
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            file = new File([blob], 'image.jpg', { type: mimeType });
        } else {
            throw new Error('Unsupported image source type');
        }

        console.log('[DEEPSEEK-OCR] File size:', file.size, 'bytes');

        // Create FormData
        const formData = new FormData();
        formData.append('file', file);

        // Call DeepSeek-OCR via worker proxy
        const response = await fetch(DEEPSEEK_OCR_API, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = typeof errorData.error === 'string'
                ? errorData.error
                : (errorData.message || JSON.stringify(errorData) || response.statusText);
            throw new Error(`DeepSeek-OCR failed (${response.status}): ${errorMsg}`);
        }

        const result = await response.json();

        // Extract text from response (handle different response formats)
        let text = '';
        if (result.text) {
            text = result.text;
        } else if (result.output) {
            text = result.output;
        } else if (result.result) {
            text = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
        } else if (typeof result === 'string') {
            text = result;
        } else {
            text = JSON.stringify(result);
        }

        console.log(`[DEEPSEEK-OCR] ✅ Completed. Extracted ${text.length} characters`);
        console.log('[DEEPSEEK-OCR] Text Preview:', text.substring(0, 500) + (text.length > 500 ? '...' : ''));

        return text;

    } catch (error) {
        console.error('[DEEPSEEK-OCR] ❌ Failed:', error.message);
        deepseekOcrAvailable = false;
        throw error;
    }
}

// =====================================================
// TESSERACT.JS OCR (Fallback)
// =====================================================

async function initializeTesseractOCR() {
    if (ocrReady && ocrWorker) {
        return ocrWorker;
    }

    try {
        console.log('[TESSERACT] 🔤 Initializing Tesseract.js OCR...');

        // Check if Tesseract is available
        if (typeof Tesseract === 'undefined') {
            throw new Error('Tesseract.js not loaded. Please include tesseract.min.js');
        }

        // Create worker with Vietnamese + English language support
        ocrWorker = await Tesseract.createWorker('vie+eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    console.log(`[TESSERACT] Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        ocrReady = true;
        console.log('[TESSERACT] ✅ Initialized successfully');
        return ocrWorker;

    } catch (error) {
        console.error('[TESSERACT] ❌ Initialization failed:', error);
        throw error;
    }
}

async function extractTextWithTesseract(imageSource) {
    try {
        console.log('[TESSERACT] 📷 Extracting text using Tesseract.js...');

        const worker = await initializeTesseractOCR();

        // imageSource can be: base64, URL, File, or Blob
        let imageData = imageSource;

        // If it's base64 without data URI prefix, add it
        if (typeof imageSource === 'string' && !imageSource.startsWith('data:') && !imageSource.startsWith('http')) {
            imageData = `data:image/jpeg;base64,${imageSource}`;
        }

        const result = await worker.recognize(imageData);
        const text = result.data.text;

        console.log(`[TESSERACT] ✅ Completed. Extracted ${text.length} characters`);
        console.log('[TESSERACT] Text Preview:', text.substring(0, 500) + (text.length > 500 ? '...' : ''));

        return text;

    } catch (error) {
        console.error('[TESSERACT] ❌ Failed:', error);
        throw new Error('Tesseract OCR failed: ' + error.message);
    }
}

// =====================================================
// UNIFIED OCR EXTRACTION (DeepSeek-OCR primary, Tesseract fallback)
// =====================================================

async function extractTextFromImage(imageSource) {
    // Try DeepSeek-OCR first (if available and configured as primary)
    if (OCR_PRIMARY === 'deepseek-ocr' && deepseekOcrAvailable) {
        try {
            return await extractTextWithDeepSeekOCR(imageSource);
        } catch (error) {
            console.warn('[OCR] DeepSeek-OCR failed, trying fallback...');

            if (OCR_FALLBACK_ENABLED) {
                console.log('[OCR] 🔄 Falling back to Tesseract.js...');
                return await extractTextWithTesseract(imageSource);
            }
            throw error;
        }
    }

    // Use Tesseract directly if configured or DeepSeek-OCR unavailable
    return await extractTextWithTesseract(imageSource);
}

// =====================================================
// API CALL HELPER
// =====================================================

async function callDeepSeekAPI(messages, options = {}) {
    const {
        model = DEEPSEEK_DEFAULT_MODEL,
        maxTokens = 4096,
        temperature = 0.3, // Lower temperature for more accurate extraction
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

    // Use worker proxy directly (it handles routing to DeepSeek)
    const url = DEEPSEEK_API_BASE;

    try {
        console.log(`[DEEPSEEK] 🤖 Calling API via Worker proxy with model: ${model}`);

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
            throw new Error(`HTTP ${response.status}: ${errorMsg}`);
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
// IMAGE ANALYSIS (OCR + DeepSeek)
// =====================================================

async function analyzeImage(base64Image, prompt, options = {}) {
    const {
        mimeType = 'image/jpeg',
    } = options;

    console.log('[DEEPSEEK] 🖼️ Starting image analysis (DeepSeek-OCR + AI)...');

    // Step 1: Extract text using OCR (DeepSeek-OCR or Tesseract fallback)
    const imageData = `data:${mimeType};base64,${base64Image}`;
    const extractedText = await extractTextFromImage(imageData);

    if (!extractedText || extractedText.trim().length < 10) {
        throw new Error('OCR không thể trích xuất đủ text từ ảnh. Vui lòng thử ảnh rõ hơn.');
    }

    // Step 2: Send extracted text to DeepSeek for analysis
    const analysisPrompt = `Dưới đây là text được trích xuất từ hình ảnh hóa đơn bằng OCR:

--- BẮT ĐẦU TEXT TỪ ẢNH ---
${extractedText}
--- KẾT THÚC TEXT TỪ ẢNH ---

${prompt}`;

    console.log('[DEEPSEEK] 📝 Sending extracted text to DeepSeek for analysis...');

    const result = await callDeepSeekAPI([
        { role: 'user', content: analysisPrompt }
    ], options);

    return result;
}

// =====================================================
// ANALYZE MULTIPLE IMAGES
// =====================================================

async function analyzeMultipleImages(images, prompt, options = {}) {
    console.log(`[DEEPSEEK] 🖼️ Analyzing ${images.length} image(s)...`);

    // Extract text from all images
    const allTexts = [];

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        console.log(`[DEEPSEEK] Processing image ${i + 1}/${images.length}...`);

        const imageData = `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`;

        try {
            const text = await extractTextFromImage(imageData);
            if (text && text.trim().length > 10) {
                allTexts.push(`--- ẢNH ${i + 1} ---\n${text}`);
            }
        } catch (error) {
            console.warn(`[DEEPSEEK] Failed to extract text from image ${i + 1}:`, error.message);
        }
    }

    if (allTexts.length === 0) {
        throw new Error('Không thể trích xuất text từ bất kỳ ảnh nào. Vui lòng thử ảnh rõ hơn.');
    }

    // Combine and analyze
    const combinedText = allTexts.join('\n\n');

    const analysisPrompt = `Dưới đây là text được trích xuất từ ${images.length} hình ảnh hóa đơn bằng OCR:

${combinedText}

${prompt}`;

    console.log('[DEEPSEEK] 📝 Sending combined text to DeepSeek for analysis...');

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
        console.log('[TESSERACT] 🧹 OCR worker terminated');
    }
}

// =====================================================
// EXPORT
// =====================================================

// Alias for backward compatibility
async function initializeOCR() {
    // DeepSeek-OCR doesn't need initialization (cloud API)
    // Only initialize Tesseract if fallback is enabled
    if (OCR_FALLBACK_ENABLED) {
        try {
            await initializeTesseractOCR();
        } catch (e) {
            console.warn('[OCR] Tesseract initialization failed (fallback may not work):', e.message);
        }
    }
    console.log('[OCR] Ready - Primary: DeepSeek-OCR, Fallback: Tesseract.js');
    return true;
}

window.DeepSeekAI = {
    // Core functions
    generateText,
    analyzeImage,
    analyzeMultipleImages,
    callDeepSeekAPI,

    // OCR functions
    extractTextFromImage,
    extractTextWithDeepSeekOCR,
    extractTextWithTesseract,
    initializeOCR,  // Backward compatible alias
    initializeTesseractOCR,
    terminateOCR,

    // Utilities
    fileToBase64,

    // Status
    isConfigured: () => !!DEEPSEEK_API_KEY,
    isOCRReady: () => ocrReady,
    isDeepSeekOCRAvailable: () => deepseekOcrAvailable,

    getStats: () => ({
        configured: !!DEEPSEEK_API_KEY,
        model: DEEPSEEK_DEFAULT_MODEL,
        apiBase: DEEPSEEK_API_BASE,
        ocrApi: DEEPSEEK_OCR_API,
        proxyUrl: WORKER_PROXY_URL,
        ocrPrimary: OCR_PRIMARY,
        ocrFallbackEnabled: OCR_FALLBACK_ENABLED,
        tesseractReady: ocrReady,
        deepseekOcrAvailable: deepseekOcrAvailable,
        approach: 'DeepSeek-OCR (alphaXiv) + DeepSeek Chat Analysis',
    }),
};

// Log status on load
console.log(`[DEEPSEEK-AI-HELPER] Loaded`);
console.log(`[DEEPSEEK] API Key: ${DEEPSEEK_API_KEY ? 'Configured ✓' : '⚠️ NOT CONFIGURED'}`);
console.log(`[DEEPSEEK] OCR: DeepSeek-OCR (alphaXiv) with Tesseract.js fallback`);
console.log(`[DEEPSEEK] Proxy: ${WORKER_PROXY_URL}`);
console.log(`[DEEPSEEK] OCR Endpoint: ${DEEPSEEK_OCR_API}`);
