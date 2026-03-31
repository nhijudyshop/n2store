// =====================================================
// AUTOFB.PRO BALANCE ROUTE
// Login with SVG captcha solving via sharp + Tesseract.js
// =====================================================

const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const AUTOFB_BASE = 'https://autofb.pro';

const COMMON_HEADERS = {
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    'Cookie': 'NEXT_LOCALE=vi',
    'Referer': `${AUTOFB_BASE}/vi/login`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};

// =====================================================
// SVG Captcha → PNG → Tesseract OCR
// =====================================================

function cleanCaptchaSvg(svg) {
    // Remove noise lines (stroke paths with fill="none")
    let cleaned = svg.replace(/<path[^>]*fill="none"[^>]*\/>/g, '');
    // Background white first
    cleaned = cleaned.replace('fill="#f0f0f0"', 'fill="#ffffff"');
    // Then digits black (skip the white background)
    cleaned = cleaned.replace(/fill="#(?!ffffff)[a-fA-F0-9]{6}"/g, 'fill="#000000"');
    return cleaned;
}

async function svgToPngBuffer(svgString) {
    const cleanSvg = cleanCaptchaSvg(svgString);
    // Scale up 5x for better OCR
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

// Cache token in memory (avoid re-login on every request)
let cachedToken = null;
let cachedTokenExpiry = 0;

// =====================================================
// Health check
// =====================================================
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'AutoFB.pro Balance (Tesseract OCR)',
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

        let ocrResult = null;
        let ocrError = null;
        try {
            ocrResult = await solveCaptchaWithTesseract(captcha.svg);
        } catch (e) {
            ocrError = e.message;
        }

        res.json({
            captchaId: captcha.captchaId,
            svgLength: captcha.svg?.length,
            ocrResult,
            ocrError,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/autofb/balance
// Body: { username, password }
// Returns: { success, data: { balance, balanceVND, username } }
// =====================================================
router.post('/balance', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            error: 'Missing username or password',
        });
    }

    // If we have a cached token, try to use it first
    if (cachedToken && Date.now() < cachedTokenExpiry) {
        try {
            const balanceData = await fetchBalanceWithToken(cachedToken);
            if (balanceData) {
                console.log(`[AUTOFB] Used cached token, balance: ${balanceData.balance}`);
                return res.json({
                    success: true,
                    data: {
                        ...balanceData,
                        fromCache: true,
                        fetchedAt: new Date().toISOString(),
                    }
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

            // 2. Solve with Tesseract OCR (SVG → PNG → OCR)
            const digits = await solveCaptchaWithTesseract(captcha.svg);
            if (!digits) {
                console.log(`[AUTOFB] Attempt ${attempt}: OCR could not read 4 digits`);
                continue;
            }
            console.log(`[AUTOFB] Attempt ${attempt}: OCR solved → "${digits}"`);

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

                // Cache token for 30 minutes
                cachedToken = result.token;
                cachedTokenExpiry = Date.now() + 30 * 60 * 1000;

                console.log(`[AUTOFB] Login OK! Balance: ${balance} (~${balanceVND.toLocaleString()} VND), attempt ${attempt}`);

                return res.json({
                    success: true,
                    data: {
                        balance,
                        balanceVND,
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
// Fetch balance using existing token (skip captcha)
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
