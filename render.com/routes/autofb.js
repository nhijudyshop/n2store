// =====================================================
// AUTOFB.PRO BALANCE ROUTE
// Login with SVG captcha solving via sharp + Gemini Vision
// =====================================================

const express = require('express');
const router = express.Router();
const sharp = require('sharp');

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
// SVG Captcha → PNG → Gemini Vision OCR
// =====================================================

function cleanCaptchaSvg(svg) {
    // Remove noise lines (stroke paths with fill="none")
    let cleaned = svg.replace(/<path[^>]*fill="none"[^>]*\/>/g, '');
    // Background white, digits black
    cleaned = cleaned.replace('fill="#f0f0f0"', 'fill="#ffffff"');
    cleaned = cleaned.replace(/fill="#(?!ffffff)[a-fA-F0-9]{6}"/g, 'fill="#000000"');
    return cleaned;
}

async function svgToPngBase64(svgString) {
    const cleanSvg = cleanCaptchaSvg(svgString);
    // Scale up for better OCR
    const scaledSvg = cleanSvg
        .replace('width="250"', 'width="1000"')
        .replace('height="50"', 'height="200"');

    const pngBuffer = await sharp(Buffer.from(scaledSvg))
        .flatten({ background: '#ffffff' })
        .threshold(128)
        .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#ffffff' })
        .png()
        .toBuffer();

    return pngBuffer.toString('base64');
}

async function solveCaptchaWithGemini(svgString) {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const pngBase64 = await svgToPngBase64(svgString);

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
        throw new Error(`Gemini API error: ${res.status} ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const digits = text.replace(/[^0-9]/g, '');
    return digits.length === 4 ? digits : null;
}

// =====================================================
// Health check
// =====================================================
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'AutoFB.pro Balance',
        hasGeminiKey: !!GEMINI_API_KEY,
    });
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

    if (!GEMINI_API_KEY) {
        return res.status(500).json({
            success: false,
            error: 'GEMINI_API_KEY not configured on server',
        });
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

            // 2. Solve with Gemini Vision (SVG → PNG → Gemini)
            const digits = await solveCaptchaWithGemini(captcha.svg);
            if (!digits) {
                console.log(`[AUTOFB] Attempt ${attempt}: Gemini could not read captcha`);
                continue;
            }
            console.log(`[AUTOFB] Attempt ${attempt}: Gemini solved → "${digits}"`);

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

                console.log(`[AUTOFB] ✅ Login OK! Balance: ${balance} (~${balanceVND.toLocaleString()} VND), attempt ${attempt}`);

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

module.exports = router;
