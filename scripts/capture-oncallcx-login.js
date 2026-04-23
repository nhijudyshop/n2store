#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Capture Login Request - pbx-ucaas.oncallcx.vn
 *
 * Mở Chromium (visible), điều hướng tới trang login, tự động điền credentials
 * từ serect_dont_push.txt, submit, và capture TOÀN BỘ network request liên quan
 * tới login (method, URL, headers, body request + response).
 *
 * Usage:
 *   # 1. Cài playwright (1 lần):
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 *   # 2. Chạy script:
 *   node scripts/capture-oncallcx-login.js
 *
 *   # Tuỳ chọn: headless
 *   HEADLESS=1 node scripts/capture-oncallcx-login.js
 *
 * Output:
 *   docs/oncallcx-login-capture.json  — toàn bộ request/response đã capture
 *   docs/oncallcx-login-curl.sh       — cURL tương đương của login request
 */

const fs = require('fs');
const path = require('path');

const SECRETS_FILE = path.resolve(__dirname, '..', 'serect_dont_push.txt');
const OUTPUT_JSON = path.resolve(__dirname, '..', 'docs', 'oncallcx-login-capture.json');
const OUTPUT_CURL = path.resolve(__dirname, '..', 'docs', 'oncallcx-login-curl.sh');

const LOGIN_URL = 'https://pbx-ucaas.oncallcx.vn/portal/login.xhtml';
const LOGIN_HOST = 'pbx-ucaas.oncallcx.vn';

// ==================== Credentials ====================

function readCredentials() {
    if (!fs.existsSync(SECRETS_FILE)) {
        throw new Error(`Secrets file not found: ${SECRETS_FILE}`);
    }
    const content = fs.readFileSync(SECRETS_FILE, 'utf8');
    // Dòng có dạng:  26/"https://pbx-ucaas.oncallcx.vn" user@mail pass
    const line = content
        .split('\n')
        .find((l) => l.includes('pbx-ucaas.oncallcx.vn') && !l.includes('PBX_HOST'));
    if (!line) throw new Error('Không tìm thấy dòng credentials cho pbx-ucaas.oncallcx.vn');

    // Loại bỏ prefix "26/" và URL trong quotes
    const after = line.replace(/^\s*\d+\/?\s*/, '').replace(/"[^"]*"\s*/, '');
    const parts = after.trim().split(/\s+/);
    if (parts.length < 2) throw new Error(`Không parse được credentials từ: ${line}`);
    return { username: parts[0], password: parts.slice(1).join(' ') };
}

// ==================== Playwright ====================

function requirePlaywright() {
    try {
        return require('playwright');
    } catch (e) {
        console.error('\n❌ Playwright chưa được cài.');
        console.error('\nCài đặt:');
        console.error('  npm install -D playwright');
        console.error('  npx playwright install chromium\n');
        process.exit(1);
    }
}

// ==================== Main ====================

async function main() {
    const creds = readCredentials();
    console.log(
        `[info] Credentials loaded: username=${creds.username}, password=***${creds.password.slice(-3)}`
    );

    const { chromium } = requirePlaywright();
    const headless = process.env.HEADLESS === '1';
    const browser = await chromium.launch({
        headless,
        args: ['--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // --- Capture network ---
    const requests = [];
    const loginCandidates = [];

    page.on('request', (req) => {
        const url = req.url();
        if (!url.includes(LOGIN_HOST)) return;
        const entry = {
            phase: 'request',
            ts: Date.now(),
            method: req.method(),
            url,
            headers: req.headers(),
            postData: req.postData() || null,
            resourceType: req.resourceType(),
        };
        requests.push(entry);
        // Ứng viên login: POST tới login.xhtml hoặc endpoint auth
        if (req.method() === 'POST' && /login|auth|j_security_check|signin/i.test(url)) {
            loginCandidates.push(entry);
        }
    });

    page.on('response', async (res) => {
        const url = res.url();
        if (!url.includes(LOGIN_HOST)) return;
        let bodyPreview = null;
        try {
            const ct = (res.headers()['content-type'] || '').toLowerCase();
            if (
                ct.includes('json') ||
                ct.includes('text') ||
                ct.includes('xml') ||
                ct.includes('html')
            ) {
                const buf = await res.body();
                bodyPreview = buf.slice(0, 4096).toString('utf8');
            }
        } catch {
            /* ignore */
        }
        requests.push({
            phase: 'response',
            ts: Date.now(),
            status: res.status(),
            url,
            headers: res.headers(),
            bodyPreview,
        });
    });

    console.log(`[info] Mở ${LOGIN_URL} ...`);
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // --- Tự động tìm field username/password và submit ---
    console.log('[info] Tìm form login ...');
    // PrimeFaces thường dùng id có dấu : (vd: form:username)
    const userSelectors = [
        'input[type="text"][name*="user" i]',
        'input[name*="user" i]',
        'input[id*="user" i]',
        'input[name*="email" i]',
        'input[id*="email" i]',
        'input[type="text"]:visible',
        'input[type="email"]',
    ];
    const passSelectors = ['input[type="password"]'];

    async function findFirst(selectors) {
        for (const sel of selectors) {
            const loc = page.locator(sel).first();
            if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) return loc;
        }
        return null;
    }

    const userField = await findFirst(userSelectors);
    const passField = await findFirst(passSelectors);
    if (!userField || !passField) {
        console.error('[error] Không tìm thấy field username/password. Lưu HTML debug...');
        fs.writeFileSync(
            path.resolve(__dirname, '..', 'docs', 'oncallcx-login-debug.html'),
            await page.content()
        );
        await browser.close();
        process.exit(2);
    }

    await userField.fill(creds.username);
    await passField.fill(creds.password);
    console.log('[info] Đã điền credentials. Submit ...');

    // Submit: ưu tiên click button, fallback Enter
    const submit = page
        .locator(
            'button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Đăng nhập")'
        )
        .first();
    const beforeNav = Date.now();
    if ((await submit.count()) > 0) {
        await Promise.all([
            page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}),
            submit.click().catch(() => passField.press('Enter')),
        ]);
    } else {
        await Promise.all([
            page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}),
            passField.press('Enter'),
        ]);
    }
    console.log(`[info] Sau submit ${Date.now() - beforeNav}ms. URL hiện tại: ${page.url()}`);

    // Chờ thêm 2s để chắc chắn tất cả redirect xong
    await page.waitForTimeout(2000);

    // --- Xác định login request chính ---
    // Ưu tiên: POST có chứa credentials trong postData
    const mainLogin =
        loginCandidates.find(
            (r) =>
                r.postData &&
                (r.postData.includes(encodeURIComponent(creds.username)) ||
                    r.postData.includes(creds.username))
        ) ||
        loginCandidates[0] ||
        requests.find(
            (r) =>
                r.phase === 'request' &&
                r.method === 'POST' &&
                r.postData &&
                r.postData.includes(creds.username)
        );

    // --- Ghi output ---
    fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
    const summary = {
        capturedAt: new Date().toISOString(),
        loginUrl: LOGIN_URL,
        finalUrl: page.url(),
        cookies: await context.cookies(),
        loginRequest: mainLogin || null,
        allRequests: requests,
    };
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(summary, null, 2));
    console.log(`[ok]  Lưu full capture: ${OUTPUT_JSON}`);

    // --- Xuất cURL ---
    if (mainLogin) {
        const headerFlags = Object.entries(mainLogin.headers)
            .filter(([k]) => !/^:|^host$|^content-length$/i.test(k))
            .map(([k, v]) => `  -H '${k}: ${String(v).replace(/'/g, "'\\''")}'`)
            .join(' \\\n');
        const curl = [
            '#!/bin/bash',
            `# Login request capture — ${new Date().toISOString()}`,
            `curl -i -X ${mainLogin.method} '${mainLogin.url}' \\`,
            headerFlags + ' \\',
            mainLogin.postData ? `  --data-raw '${mainLogin.postData.replace(/'/g, "'\\''")}'` : '',
        ]
            .filter(Boolean)
            .join('\n');
        fs.writeFileSync(OUTPUT_CURL, curl);
        fs.chmodSync(OUTPUT_CURL, 0o755);
        console.log(`[ok]  Xuất cURL:       ${OUTPUT_CURL}`);
        console.log(`\n=== LOGIN REQUEST ===`);
        console.log(`${mainLogin.method} ${mainLogin.url}`);
        console.log(`Body (${mainLogin.postData?.length || 0} bytes):`);
        console.log(
            (mainLogin.postData || '').slice(0, 500) +
                ((mainLogin.postData?.length || 0) > 500 ? '...' : '')
        );
    } else {
        console.warn(
            '[warn] Không tìm thấy login POST request rõ ràng. Kiểm tra allRequests trong JSON.'
        );
    }

    if (!headless) {
        console.log('\n[info] Giữ browser mở 10s để bạn quan sát. Ctrl+C để dừng sớm.');
        await page.waitForTimeout(10000);
    }
    await browser.close();
}

main().catch((err) => {
    console.error('[fatal]', err);
    process.exit(1);
});
