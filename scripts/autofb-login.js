#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * AutoFB Login Script - Tự động đăng nhập autofb.pro
 * Giải SVG captcha (4 số) + login lấy token
 *
 * Usage: node scripts/autofb-login.js
 * Env vars: AUTOFB_USERNAME, AUTOFB_PASSWORD
 */

const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const CONFIG = {
    username: process.env.AUTOFB_USERNAME || 'n2shop',
    password: process.env.AUTOFB_PASSWORD || 'nhijudyMS23',
    baseUrl: 'https://autofb.pro',
    maxRetries: 5, // số lần thử nếu OCR sai
};

const HEADERS = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'cookie': 'NEXT_LOCALE=vi',
    'Referer': 'https://autofb.pro/vi/login',
};

// ==================== CAPTCHA SOLVER ====================

/**
 * Xóa noise lines khỏi SVG, chỉ giữ lại ký tự
 * - Noise lines: <path ... fill="none" stroke="..." />
 * - Characters: <path ... fill="#color" d="..." />
 */
function cleanSvg(svgString) {
    // Remove noise lines (paths with stroke and fill="none")
    let cleaned = svgString.replace(/<path[^>]*fill="none"[^>]*\/>/g, '');

    // Background trắng, chữ đen (phải replace background TRƯỚC)
    cleaned = cleaned.replace('fill="#f0f0f0"', 'fill="#ffffff"');
    // Sau đó đổi các fill color còn lại (chữ) thành đen
    cleaned = cleaned.replace(/fill="#(?!ffffff)[a-fA-F0-9]{6}"/g, 'fill="#000000"');

    return cleaned;
}

/**
 * Render SVG → PNG buffer với preprocessing cho OCR
 */
async function svgToPng(svgString) {
    // Scale up 5x for better OCR
    const scaledSvg = svgString
        .replace('width="250"', 'width="1250"')
        .replace('height="50"', 'height="250"');

    return sharp(Buffer.from(scaledSvg))
        .flatten({ background: '#ffffff' })
        .threshold(128) // Binary black/white
        .extend({ top: 40, bottom: 40, left: 40, right: 40, background: '#ffffff' }) // Padding
        .png()
        .toBuffer();
}

/**
 * OCR - nhận diện 4 chữ số từ PNG
 */
async function recognizeDigits(pngBuffer) {
    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    });

    const { data: { text, confidence } } = await worker.recognize(pngBuffer);
    await worker.terminate();

    const digits = text.trim().replace(/\s+/g, '');
    return { digits, confidence };
}

// ==================== API CALLS ====================

/**
 * Fetch captcha từ server
 */
async function fetchCaptcha() {
    const res = await fetch(`${CONFIG.baseUrl}/auth/captcha`, {
        headers: HEADERS,
    });

    if (!res.ok) throw new Error(`Fetch captcha failed: ${res.status}`);
    return res.json();
}

/**
 * Submit login
 */
async function submitLogin(captchaId, captchaText) {
    const body = {
        username: CONFIG.username,
        password: CONFIG.password,
        captcha_token: JSON.stringify({ captchaId, captchaText }),
    };

    const res = await fetch(`${CONFIG.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
            ...HEADERS,
            'content-type': 'application/json',
            'x-timezone': 'Asia/Saigon',
        },
        body: JSON.stringify(body),
    });

    // Lấy cookies từ response (token thường nằm trong set-cookie)
    const setCookies = res.headers.getSetCookie?.() || [];
    const responseBody = await res.json();

    return {
        status: res.status,
        cookies: setCookies,
        body: responseBody,
    };
}

// ==================== MAIN ====================

async function solveCaptcha() {
    // 1. Fetch captcha
    const captcha = await fetchCaptcha();
    console.log(`   CaptchaID: ${captcha.captchaId}`);

    // 2. Clean SVG (remove noise lines)
    const cleanedSvg = cleanSvg(captcha.svg);

    // 3. Render to PNG
    const pngBuffer = await svgToPng(cleanedSvg);

    // Save debug image (optional)
    const fs = require('fs');
    const debugPath = '/tmp/autofb-captcha.png';
    fs.writeFileSync(debugPath, pngBuffer);
    console.log(`   Debug image: ${debugPath}`);

    // 4. OCR
    const { digits, confidence } = await recognizeDigits(pngBuffer);
    console.log(`   OCR result: "${digits}" (confidence: ${confidence.toFixed(1)}%)`);

    return { captchaId: captcha.captchaId, captchaText: digits };
}

async function main() {
    console.log('=== AutoFB Login ===');
    console.log(`User: ${CONFIG.username}\n`);

    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        console.log(`Attempt ${attempt}/${CONFIG.maxRetries}:`);

        try {
            // Solve captcha
            console.log('1. Solving captcha...');
            const { captchaId, captchaText } = await solveCaptcha();

            // Validate: phải đúng 4 số
            if (!/^\d{4}$/.test(captchaText)) {
                console.log(`   ❌ OCR không ra 4 số ("${captchaText}"), thử lại...\n`);
                continue;
            }

            // Login
            console.log(`2. Logging in with captcha "${captchaText}"...`);
            const result = await submitLogin(captchaId, captchaText);

            console.log(`   Status: ${result.status}`);
            console.log(`   Response:`, JSON.stringify(result.body, null, 2));

            if (result.cookies.length > 0) {
                console.log(`   Cookies:`, result.cookies);
            }

            // Check success
            if (result.body?.token || result.body?.accessToken || result.status === 200) {
                console.log('\n✅ Login thành công!');

                // Save token for later use
                if (result.body?.token || result.body?.accessToken) {
                    const token = result.body.token || result.body.accessToken;
                    const fs = require('fs');
                    fs.writeFileSync('/tmp/autofb-token.txt', token);
                    console.log(`   Token saved to /tmp/autofb-token.txt`);
                }

                return result;
            }

            // Captcha sai → thử lại
            const errorCode = result.body?.error_code || '';
            const errorMsg = result.body?.message || '';
            if (errorCode.includes('captcha') || errorMsg.toLowerCase().includes('captcha')) {
                console.log(`   ❌ Captcha sai (${errorCode}), thử lại...\n`);
                continue;
            }

            // Lỗi khác (sai password, etc) → dừng
            console.log(`   ❌ Login failed: ${errorCode || errorMsg || 'Unknown error'}`);
            return result;

        } catch (err) {
            console.error(`   Error: ${err.message}`);
            if (attempt === CONFIG.maxRetries) throw err;
        }
    }

    console.log(`\n❌ Không giải được captcha sau ${CONFIG.maxRetries} lần thử.`);
    process.exit(1);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
