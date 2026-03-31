/**
 * AutoFB Balance Handler
 * Login to autofb.pro with SVG captcha solving via Gemini Vision API
 * Returns wallet balance for service-costs dashboard
 *
 * @module cloudflare-worker/modules/handlers/autofb-handler
 */

import { errorResponse, corsResponse } from '../utils/cors-utils.js';

const AUTOFB_BASE = 'https://autofb.pro';

const COMMON_HEADERS = {
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    'Cookie': 'NEXT_LOCALE=vi',
    'Referer': `${AUTOFB_BASE}/vi/login`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};

// =========================================================
// SVG Captcha Solver
// =========================================================

/**
 * Remove noise lines from captcha SVG, keep only digit paths
 */
function cleanCaptchaSvg(svg) {
    // Remove noise lines (stroke paths with fill="none")
    let cleaned = svg.replace(/<path[^>]*fill="none"[^>]*\/>/g, '');
    // Background white
    cleaned = cleaned.replace('fill="#f0f0f0"', 'fill="#ffffff"');
    // All digit fills → black
    cleaned = cleaned.replace(/fill="#(?!ffffff)[a-fA-F0-9]{6}"/g, 'fill="#000000"');
    return cleaned;
}

/**
 * Solve captcha using Gemini Vision API
 * Sends cleaned SVG as base64 inline_data
 */
async function solveCaptchaWithGemini(svg, geminiKey) {
    const cleanSvg = cleanCaptchaSvg(svg);
    const svgBase64 = btoa(unescape(encodeURIComponent(cleanSvg)));

    // Try 1: Send as inline image (image/svg+xml)
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: 'This is a captcha image containing exactly 4 numerical digits (0-9). What are the 4 digits? Reply with ONLY the 4 digits, nothing else.' },
                        { inline_data: { mime_type: 'image/svg+xml', data: svgBase64 } }
                    ]
                }],
                generationConfig: { temperature: 0, maxOutputTokens: 10 }
            })
        }
    );

    if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        const digits = text.replace(/[^0-9]/g, '');
        if (digits.length === 4) return digits;
    }

    // Try 2: Send SVG as text prompt (fallback)
    const res2 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Below is an SVG captcha containing exactly 4 digits (0-9) rendered as filled path elements. The paths with fill="#000000" are the digit glyphs. Determine what 4 digits are shown. Reply with ONLY the 4 digits.\n\n${cleanSvg}`
                    }]
                }],
                generationConfig: { temperature: 0, maxOutputTokens: 10 }
            })
        }
    );

    if (res2.ok) {
        const data2 = await res2.json();
        const text2 = data2?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        const digits2 = text2.replace(/[^0-9]/g, '');
        if (digits2.length === 4) return digits2;
    }

    return null;
}

// =========================================================
// AutoFB Login
// =========================================================

async function autofbLogin(username, password, captchaId, captchaText) {
    const res = await fetch(`${AUTOFB_BASE}/auth/login`, {
        method: 'POST',
        headers: {
            ...COMMON_HEADERS,
            'Content-Type': 'application/json',
            'x-timezone': 'Asia/Saigon',
        },
        body: JSON.stringify({
            username,
            password,
            captcha_token: JSON.stringify({ captchaId, captchaText }),
        }),
    });

    return res.json();
}

// =========================================================
// Main Handler
// =========================================================

/**
 * Handle POST /api/autofb-balance
 * Body: { username, password, gemini_key }
 * Returns: { success, data: { balance, balanceVND, username } }
 */
export async function handleAutofbBalance(request, url) {
    let username, password, geminiKey;

    if (request.method === 'POST') {
        try {
            const body = await request.json();
            username = body.username;
            password = body.password;
            geminiKey = body.gemini_key;
        } catch {
            return errorResponse('Invalid JSON body', 400);
        }
    } else {
        return errorResponse('Use POST method', 405);
    }

    if (!username || !password || !geminiKey) {
        return errorResponse('Missing username, password, or gemini_key', 400, {
            usage: 'POST /api/autofb-balance with { username, password, gemini_key }'
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

            // 2. Solve captcha with Gemini
            const digits = await solveCaptchaWithGemini(captcha.svg, geminiKey);
            if (!digits) {
                console.log(`[AUTOFB] Attempt ${attempt}: Gemini could not solve captcha`);
                continue;
            }
            console.log(`[AUTOFB] Attempt ${attempt}: Gemini solved → "${digits}"`);

            // 3. Login
            const result = await autofbLogin(username, password, captcha.captchaId, digits);

            // Captcha wrong → retry
            if (result.error_code?.includes('captcha')) {
                console.log(`[AUTOFB] Attempt ${attempt}: Captcha wrong, retrying...`);
                continue;
            }

            // Login success
            if (result.isLoggedIn && result.token) {
                const balance = result.user?.balance || 0;
                const balanceVND = Math.round(balance * 25000);

                console.log(`[AUTOFB] Login OK! Balance: ${balance} (~${balanceVND.toLocaleString()} VND)`);

                return corsResponse({
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

            // Other error (wrong password, etc) → stop
            console.error('[AUTOFB] Login failed:', result.error_code || result.message);
            return corsResponse({
                success: false,
                error: result.error_code || result.message || 'Login failed',
            });

        } catch (e) {
            console.error(`[AUTOFB] Attempt ${attempt} error:`, e.message);
        }
    }

    return corsResponse({
        success: false,
        error: `Failed to solve captcha after ${MAX_RETRIES} attempts`,
    });
}
