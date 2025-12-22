/* =====================================================
   DEEPSEEK AI HELPER - For Invoice Analysis
   Using OCR + Text Analysis approach

   DeepSeek API Documentation:
   https://platform.deepseek.com/api-docs

   NOTE: DeepSeek's public API (api.deepseek.com) does NOT support
   image/vision analysis. Only text-based models are available:
   - deepseek-chat: General chat/analysis
   - deepseek-reasoner: Deep reasoning (more expensive)

   This helper uses OCR (Tesseract.js) to extract text from images,
   then sends the text to DeepSeek for structured analysis.
   ===================================================== */

// Load DeepSeek API Key
const DEEPSEEK_API_KEY = (window.DEEPSEEK_API_KEY || "").trim();

// API Configuration
const DEEPSEEK_API_BASE = 'https://api.deepseek.com';
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // 500ms between requests

// OCR Status
let ocrWorker = null;
let ocrReady = false;

// =====================================================
// OCR INITIALIZATION
// =====================================================

async function initializeOCR() {
    if (ocrReady && ocrWorker) {
        return ocrWorker;
    }

    try {
        console.log('[DEEPSEEK] 🔤 Initializing OCR (Tesseract.js)...');

        // Check if Tesseract is available
        if (typeof Tesseract === 'undefined') {
            throw new Error('Tesseract.js not loaded. Please include tesseract.min.js');
        }

        // Create worker with Vietnamese + English language support
        ocrWorker = await Tesseract.createWorker('vie+eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        ocrReady = true;
        console.log('[DEEPSEEK] ✅ OCR initialized successfully');
        return ocrWorker;

    } catch (error) {
        console.error('[DEEPSEEK] ❌ OCR initialization failed:', error);
        throw error;
    }
}

// =====================================================
// OCR TEXT EXTRACTION
// =====================================================

async function extractTextFromImage(imageSource) {
    try {
        console.log('[DEEPSEEK] 📷 Extracting text from image using OCR...');

        const worker = await initializeOCR();

        // imageSource can be: base64, URL, File, or Blob
        let imageData = imageSource;

        // If it's base64 without data URI prefix, add it
        if (typeof imageSource === 'string' && !imageSource.startsWith('data:') && !imageSource.startsWith('http')) {
            imageData = `data:image/jpeg;base64,${imageSource}`;
        }

        const result = await worker.recognize(imageData);
        const text = result.data.text;

        console.log(`[DEEPSEEK] ✅ OCR completed. Extracted ${text.length} characters`);
        console.log('[DEEPSEEK] OCR Text Preview:', text.substring(0, 500) + '...');

        return text;

    } catch (error) {
        console.error('[DEEPSEEK] ❌ OCR extraction failed:', error);
        throw new Error('Không thể trích xuất text từ ảnh: ' + error.message);
    }
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

    console.log('[DEEPSEEK] 🖼️ Starting image analysis (OCR + AI)...');

    // Step 1: Extract text using OCR
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
        const text = await extractTextFromImage(imageData);

        if (text && text.trim().length > 10) {
            allTexts.push(`--- ẢNH ${i + 1} ---\n${text}`);
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
        console.log('[DEEPSEEK] 🧹 OCR worker terminated');
    }
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
    initializeOCR,
    terminateOCR,

    // Utilities
    fileToBase64,

    // Status
    isConfigured: () => !!DEEPSEEK_API_KEY,
    isOCRReady: () => ocrReady,

    getStats: () => ({
        configured: !!DEEPSEEK_API_KEY,
        model: DEEPSEEK_DEFAULT_MODEL,
        apiBase: DEEPSEEK_API_BASE,
        ocrReady: ocrReady,
        approach: 'OCR + Text Analysis',
    }),
};

// Log status on load
console.log(`[DEEPSEEK-AI-HELPER] Loaded`);
console.log(`[DEEPSEEK] API Key: ${DEEPSEEK_API_KEY ? 'Configured ✓' : '⚠️ NOT CONFIGURED'}`);
console.log(`[DEEPSEEK] Approach: OCR (Tesseract.js) + DeepSeek Text Analysis`);
console.log(`[DEEPSEEK] Note: DeepSeek API does NOT support direct image analysis`);
