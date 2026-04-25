#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Mở Chromium tại trang login resident.vn → user login tay → lưu storageState
 * (cookies + localStorage + sessionStorage) vào downloads/resident-crawl/auth-state.json.
 *
 * Sau đó crawler v3 sẽ load file này để chạy authenticated mà không cần login lại.
 *
 * Usage:
 *   node scripts/resident-save-auth.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const LOGIN_URL = 'https://app.resident.vn/auth/signin?next=%2F';
const OUT_DIR = path.resolve(__dirname, '..', 'downloads', 'resident-crawl');
fs.mkdirSync(OUT_DIR, { recursive: true });
const STATE_FILE = path.join(OUT_DIR, 'auth-state.json');

async function main() {
    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
        viewport: { width: 1366, height: 850 },
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    console.log(`[open] ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('[wait] Vui lòng đăng nhập trên cửa sổ Chromium đang mở.');
    console.log('[wait] Khi URL rời /auth/signin, script sẽ chờ thêm 5s rồi lưu state ...');
    const start = Date.now();
    const TIMEOUT = 15 * 60 * 1000;
    while (Date.now() - start < TIMEOUT) {
        const u = page.url();
        if (!u.includes('/auth/signin') && !u.includes('/auth/login')) {
            console.log(`[ok] Đã login. URL: ${u}`);
            break;
        }
        await page.waitForTimeout(1500);
    }

    // Chờ thêm để app set hết localStorage tokens
    await page.waitForTimeout(5000);

    // Save full state (cookies + localStorage)
    await context.storageState({ path: STATE_FILE });

    // Audit
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    console.log(`[ok] Saved state: ${STATE_FILE}`);
    console.log(`     cookies        : ${state.cookies?.length || 0}`);
    console.log(`     origins        : ${state.origins?.length || 0}`);
    state.origins?.forEach((o) => {
        console.log(`       - ${o.origin}  localStorage keys=${o.localStorage?.length || 0}`);
    });

    await browser.close();
}

main().catch((e) => {
    console.error('[fatal]', e);
    process.exit(1);
});
