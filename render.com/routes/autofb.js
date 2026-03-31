// =====================================================
// AUTOFB.PRO BALANCE ROUTE
// Login with SVG captcha solving via sharp + Gemini Vision (+ Tesseract fallback)
// =====================================================

const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AUTOFB_BASE = 'https://autofb.pro';

const COMMON_HEADERS = {
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    'Cookie': 'NEXT_LOCALE=vi',
    'Referer': `${AUTOFB_BASE}/vi/login`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};

// =====================================================
// SVG Captcha Processing
// =====================================================

function cleanCaptchaSvg(svg) {
    let cleaned = svg.replace(/<path[^>]*fill="none"[^>]*\/>/g, '');
    cleaned = cleaned.replace('fill="#f0f0f0"', 'fill="#ffffff"');
    cleaned = cleaned.replace(/fill="#(?!ffffff)[a-fA-F0-9]{6}"/g, 'fill="#000000"');
    return cleaned;
}

async function svgToPngBuffer(svgString) {
    const cleanSvg = cleanCaptchaSvg(svgString);
    const scaledSvg = cleanSvg
        .replace('width="250"', 'width="1250"')
        .replace('height="50"', 'height="250"');

    return sharp(Buffer.from(scaledSvg))
        .flatten({ background: '#ffffff' })
        .threshold(128)
        .extend({ top: 40, bottom: 40, left: 40, right: 40, background: '#ffffff' })
        .png()
        .toBuffer();
}

// =====================================================
// Gemini Vision OCR (primary)
// =====================================================

async function solveCaptchaWithGemini(svgString) {
    if (!GEMINI_API_KEY) return null;

    const pngBuffer = await svgToPngBuffer(svgString);
    const pngBase64 = pngBuffer.toString('base64');

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: 'This captcha image contains exactly 4 numerical digits (0-9). What are the 4 digits? Reply with ONLY the 4 digits, nothing else.' },
                    { inline_data: { mime_type: 'image/png', data: pngBase64 } }
                ]
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 10 }
        })
    });

    if (!res.ok) {
        const err = await res.text();
        console.error(`[AUTOFB] Gemini API error: ${res.status} ${err.substring(0, 200)}`);
        return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const digits = text.replace(/[^0-9]/g, '');
    return digits.length === 4 ? digits : null;
}

// =====================================================
// Tesseract OCR (fallback)
// =====================================================

async function solveCaptchaWithTesseract(svgString) {
    const pngBuffer = await svgToPngBuffer(svgString);

    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    });

    const { data: { text, confidence } } = await worker.recognize(pngBuffer);
    await worker.terminate();

    const digits = text.trim().replace(/\s+/g, '');
    console.log(`[AUTOFB] Tesseract OCR: "${digits}" (confidence: ${confidence.toFixed(1)}%)`);

    return /^\d{4}$/.test(digits) ? digits : null;
}

// =====================================================
// Combined solver: Gemini first, Tesseract fallback
// =====================================================

async function solveCaptcha(svgString) {
    // Try Gemini first (more accurate)
    const geminiResult = await solveCaptchaWithGemini(svgString);
    if (geminiResult) {
        console.log(`[AUTOFB] Gemini solved: "${geminiResult}"`);
        return geminiResult;
    }

    // Fallback to Tesseract
    console.log('[AUTOFB] Gemini failed, trying Tesseract...');
    const tesseractResult = await solveCaptchaWithTesseract(svgString);
    if (tesseractResult) {
        console.log(`[AUTOFB] Tesseract solved: "${tesseractResult}"`);
        return tesseractResult;
    }

    return null;
}

// Cache token in memory
let cachedToken = null;
let cachedTokenExpiry = 0;

// =====================================================
// Health check
// =====================================================
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'AutoFB.pro Balance',
        hasGeminiKey: !!GEMINI_API_KEY,
        hasCachedToken: !!cachedToken && Date.now() < cachedTokenExpiry,
    });
});

// =====================================================
// GET /api/autofb/test-captcha — Debug captcha solving
// =====================================================
router.get('/test-captcha', async (req, res) => {
    try {
        const captchaRes = await fetch(`${AUTOFB_BASE}/auth/captcha`, {
            headers: COMMON_HEADERS,
        });
        const captcha = await captchaRes.json();

        let geminiResult = null, tesseractResult = null, error = null;
        try {
            geminiResult = await solveCaptchaWithGemini(captcha.svg);
        } catch (e) { error = 'gemini: ' + e.message; }
        try {
            tesseractResult = await solveCaptchaWithTesseract(captcha.svg);
        } catch (e) { error = (error ? error + '; ' : '') + 'tesseract: ' + e.message; }

        res.json({
            captchaId: captcha.captchaId,
            geminiResult,
            tesseractResult,
            error,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/autofb/balance
// =====================================================
router.post('/balance', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Missing username or password' });
    }

    // Try cached token first
    if (cachedToken && Date.now() < cachedTokenExpiry) {
        try {
            const balanceData = await fetchBalanceWithToken(cachedToken);
            if (balanceData) {
                console.log(`[AUTOFB] Used cached token, balance: ${balanceData.balance}`);
                return res.json({
                    success: true,
                    data: { ...balanceData, fromCache: true, fetchedAt: new Date().toISOString() }
                });
            }
        } catch (e) {
            console.log('[AUTOFB] Cached token expired, re-login...');
            cachedToken = null;
        }
    }

    console.log('[AUTOFB] Starting login for:', username);
    const MAX_RETRIES = 5;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // 1. Fetch captcha
            const captchaRes = await fetch(`${AUTOFB_BASE}/auth/captcha`, {
                headers: COMMON_HEADERS,
            });
            const captcha = await captchaRes.json();
            console.log(`[AUTOFB] Attempt ${attempt}: captchaId=${captcha.captchaId}`);

            // 2. Solve captcha (Gemini → Tesseract fallback)
            const digits = await solveCaptcha(captcha.svg);
            if (!digits) {
                console.log(`[AUTOFB] Attempt ${attempt}: Could not read captcha`);
                continue;
            }

            // 3. Login
            const loginRes = await fetch(`${AUTOFB_BASE}/auth/login`, {
                method: 'POST',
                headers: {
                    ...COMMON_HEADERS,
                    'Content-Type': 'application/json',
                    'x-timezone': 'Asia/Saigon',
                },
                body: JSON.stringify({
                    username,
                    password,
                    captcha_token: JSON.stringify({
                        captchaId: captcha.captchaId,
                        captchaText: digits,
                    }),
                }),
            });

            const result = await loginRes.json();

            // Captcha wrong → retry
            if (result.error_code?.includes('captcha')) {
                console.log(`[AUTOFB] Attempt ${attempt}: Captcha wrong, retrying...`);
                continue;
            }

            // Login success
            if (result.isLoggedIn && result.token) {
                const balance = result.user?.balance || 0;
                const balanceVND = Math.round(balance * 25000);

                cachedToken = result.token;
                cachedTokenExpiry = Date.now() + 30 * 60 * 1000;

                console.log(`[AUTOFB] Login OK! Balance: ${balance} (~${balanceVND.toLocaleString()} VND), attempt ${attempt}`);

                return res.json({
                    success: true,
                    data: {
                        balance, balanceVND,
                        username: result.user?.username,
                        level: result.user?.level,
                        is2FAEnabled: result.is2FAEnabled,
                        attempt,
                        fetchedAt: new Date().toISOString(),
                    }
                });
            }

            // Other error → stop
            console.error('[AUTOFB] Login failed:', result.error_code || result.message);
            return res.json({
                success: false,
                error: result.error_code || result.message || 'Login failed',
            });

        } catch (e) {
            console.error(`[AUTOFB] Attempt ${attempt} error:`, e.message);
        }
    }

    res.json({
        success: false,
        error: `Failed to solve captcha after ${MAX_RETRIES} attempts`,
    });
});

// =====================================================
// Fetch balance using existing token
// =====================================================
async function fetchBalanceWithToken(token) {
    const res = await fetch(`${AUTOFB_BASE}/user/get-user-info`, {
        headers: {
            ...COMMON_HEADERS,
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.error_code) return null;

    const balance = data.balance || data.user?.balance || 0;
    return {
        balance,
        balanceVND: Math.round(balance * 25000),
        username: data.username || data.user?.username,
        level: data.level || data.user?.level,
    };
}

module.exports = router;
