// =====================================================
// AUTOFB.PRO BALANCE ROUTE
// Login with SVG captcha solving via sharp + Gemini Vision (+ Tesseract fallback)
// =====================================================

const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AUTOFB_API_KEY = process.env.AUTOFB_API_KEY;
const AUTOFB_BASE = 'https://autofb.pro';

// Services cache (5 min TTL)
let servicesCache = null;
let servicesCacheExpiry = 0;

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
// Combined solver: Tesseract first (free), Gemini fallback
// =====================================================

async function solveCaptcha(svgString) {
    // Try Tesseract first (free, no API cost)
    const tesseractResult = await solveCaptchaWithTesseract(svgString);
    if (tesseractResult) {
        console.log(`[AUTOFB] Tesseract solved: "${tesseractResult}"`);
        return tesseractResult;
    }

    // Fallback to Gemini (more accurate but costs $)
    console.log('[AUTOFB] Tesseract failed, trying Gemini...');
    const geminiResult = await solveCaptchaWithGemini(svgString);
    if (geminiResult) {
        console.log(`[AUTOFB] Gemini solved: "${geminiResult}"`);
        return geminiResult;
    }

    return null;
}

// Cache token in memory
let cachedToken = null;
let cachedTokenExpiry = 0;

// =====================================================
// Ensure valid token (auto-login with env credentials)
// =====================================================

async function ensureToken() {
    if (cachedToken && Date.now() < cachedTokenExpiry) {
        return cachedToken;
    }

    const username = process.env.AUTOFB_USERNAME;
    const password = process.env.AUTOFB_PASSWORD;
    if (!username || !password) {
        console.error('[AUTOFB] No AUTOFB_USERNAME/AUTOFB_PASSWORD configured');
        return null;
    }

    console.log('[AUTOFB] Auto-login for payment...');
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const captchaRes = await fetch(`${AUTOFB_BASE}/auth/captcha`, { headers: COMMON_HEADERS });
            const captcha = await captchaRes.json();

            const digits = await solveCaptcha(captcha.svg);
            if (!digits) { console.log(`[AUTOFB] Attempt ${attempt}: captcha unreadable`); continue; }

            const loginRes = await fetch(`${AUTOFB_BASE}/auth/login`, {
                method: 'POST',
                headers: { ...COMMON_HEADERS, 'Content-Type': 'application/json', 'x-timezone': 'Asia/Saigon' },
                body: JSON.stringify({
                    username, password,
                    captcha_token: JSON.stringify({ captchaId: captcha.captchaId, captchaText: digits }),
                }),
            });

            const result = await loginRes.json();
            if (result.error_code?.includes('captcha')) { console.log(`[AUTOFB] Attempt ${attempt}: captcha wrong`); continue; }

            if (result.isLoggedIn && result.token) {
                cachedToken = result.token;
                cachedTokenExpiry = Date.now() + 30 * 60 * 1000;
                console.log(`[AUTOFB] Auto-login OK, attempt ${attempt}`);
                return cachedToken;
            }

            console.error('[AUTOFB] Login failed:', result.error_code || result.message);
            return null;
        } catch (e) {
            console.error(`[AUTOFB] Auto-login attempt ${attempt} error:`, e.message);
        }
    }
    return null;
}

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

// =====================================================
// AutoFB API Proxy (uses API key, no captcha needed)
// =====================================================

async function callAutofbApi(params) {
    if (!AUTOFB_API_KEY) throw new Error('AUTOFB_API_KEY not configured');

    const body = new URLSearchParams({ key: AUTOFB_API_KEY, ...params });

    const res = await fetch(`${AUTOFB_BASE}/api/v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    return res.json();
}

// =====================================================
// GET /api/autofb/services — List all services (cached 5 min)
// =====================================================
router.get('/services', async (req, res) => {
    try {
        // Return cached if fresh
        if (servicesCache && Date.now() < servicesCacheExpiry) {
            return res.json({ success: true, data: servicesCache, fromCache: true });
        }

        const data = await callAutofbApi({ action: 'services' });

        if (Array.isArray(data)) {
            servicesCache = data;
            servicesCacheExpiry = Date.now() + 5 * 60 * 1000;
            console.log(`[AUTOFB-API] Cached ${data.length} services`);
            return res.json({ success: true, data });
        }

        res.json({ success: false, error: data.error || 'Failed to fetch services', raw: data });
    } catch (e) {
        console.error('[AUTOFB-API] services error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// POST /api/autofb/order — Create order
// Body: { service, link, quantity, comments? }
// =====================================================
router.post('/order', async (req, res) => {
    const { service, link, quantity, comments } = req.body;

    if (!service || !link || !quantity) {
        return res.status(400).json({ success: false, error: 'Missing service, link, or quantity' });
    }

    try {
        const params = { action: 'add', service, link, quantity: String(quantity) };
        if (comments) params.comments = comments;

        const data = await callAutofbApi(params);
        console.log(`[AUTOFB-API] Order created:`, JSON.stringify(data));

        if (data.order) {
            return res.json({ success: true, data: { order_id: data.order } });
        }

        res.json({ success: false, error: data.error || 'Failed to create order', raw: data });
    } catch (e) {
        console.error('[AUTOFB-API] order error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// POST /api/autofb/order-status — Check order status
// Body: { order_id } or { order_ids: [id1, id2, ...] }
// =====================================================
router.post('/order-status', async (req, res) => {
    const { order_id, order_ids } = req.body;

    if (!order_id && !order_ids) {
        return res.status(400).json({ success: false, error: 'Missing order_id or order_ids' });
    }

    try {
        let data;
        if (order_ids && Array.isArray(order_ids)) {
            data = await callAutofbApi({ action: 'status', orders: order_ids.join(',') });
        } else {
            data = await callAutofbApi({ action: 'status', order: String(order_id) });
        }

        res.json({ success: true, data });
    } catch (e) {
        console.error('[AUTOFB-API] order-status error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// POST /api/autofb/cancel — Cancel order
// Body: { order_id }
// =====================================================
router.post('/cancel', async (req, res) => {
    const { order_id } = req.body;

    if (!order_id) {
        return res.status(400).json({ success: false, error: 'Missing order_id' });
    }

    try {
        const data = await callAutofbApi({ action: 'cancel', order: String(order_id) });
        res.json({ success: true, data });
    } catch (e) {
        console.error('[AUTOFB-API] cancel error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// GET /api/autofb/api-balance — Check API balance (no captcha)
// =====================================================
router.get('/api-balance', async (req, res) => {
    try {
        const data = await callAutofbApi({ action: 'balance' });
        res.json({ success: true, data });
    } catch (e) {
        console.error('[AUTOFB-API] balance error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// POST /api/autofb/payment — Create deposit QR code
// Body: { payment_amount, account_holder_name? }
// =====================================================
router.post('/payment', async (req, res) => {
    const { payment_amount, account_holder_name } = req.body;

    if (!payment_amount || payment_amount < 10000) {
        return res.status(400).json({ success: false, error: 'Tối thiểu 10,000 VND' });
    }

    try {
        const token = await ensureToken();
        if (!token) {
            return res.json({ success: false, error: 'Không thể đăng nhập AutoFB. Kiểm tra AUTOFB_USERNAME/AUTOFB_PASSWORD.' });
        }

        const payRes = await fetch(`${AUTOFB_BASE}/website/payment`, {
            method: 'POST',
            headers: {
                ...COMMON_HEADERS,
                'Content-Type': 'application/json',
                'x-access-token': token,
            },
            body: JSON.stringify({
                payment_method_id: 1,
                payment_amount: Number(payment_amount),
                account_holder_name: account_holder_name || process.env.AUTOFB_HOLDER_NAME || '',
            }),
        });

        const raw = await payRes.json();
        console.log(`[AUTOFB] Payment response:`, JSON.stringify(raw).substring(0, 300));

        // Response format: { data: { bank_name, bank_account_number, ... }, code: 200 }
        const paymentData = raw.data || raw;
        if (paymentData.bank_name || paymentData.QRCodeImage) {
            return res.json({ success: true, data: paymentData });
        }

        res.json({ success: false, error: raw.message || paymentData.message || 'Tạo mã nạp tiền thất bại', raw });
    } catch (e) {
        console.error('[AUTOFB] payment error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
