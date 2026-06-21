#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Lưu phiên đăng nhập WEB 2.0 (web2_auth token) vào `serect_dont_push.txt` để browser test
// web 2.0 "vào thẳng bằng cookies" — KHÔNG phải Web 1.0. Chỉ login form web2 (/web2/login),
// KHÔNG đụng login Web 1.0. Merge web2_auth vào block phiên của host (restore-login-session
// đã inject mọi localStorage trong block → web2 pages không bị bounce về /web2/login).
//
// Usage:
//   node scripts/save-web2-session.js [--base http://localhost:8080] [--user admin --pass admin@@]
//
// Console KHÔNG echo giá trị token.

const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));
const { ensureLocalServer } = require('./lib/ensure-local-server.js');

const args = process.argv.slice(2);
const get = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
};
const BASE = (get('base', 'http://localhost:8080') || '').replace(/\/$/, '');
const USER = get('user', 'admin');
const PASS = get('pass', 'admin@@');
const SECRET_FILE = get('secret-file', path.join(__dirname, '..', 'serect_dont_push.txt'));

const host = new URL(BASE).host.replace(/[^\w.-]/g, '_');
const SECTION = `## n2store_session_${host}`;

const ts = () => new Date().toISOString();
const log = (...m) => console.log(`[${ts()}]`, ...m);

// Đọc snapshot JSON hiện có trong block của host (nếu có) để MERGE, giữ key Web 1.0.
function readExistingSnapshot(text) {
    if (!text) return null;
    const re = new RegExp(
        `(?:^|\\n)${SECTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=(\\n## |$))`
    );
    const m = text.match(re);
    if (!m) return null;
    const jsonLine = m[0].split('\n').find((l) => l.trim().startsWith('{'));
    if (!jsonLine) return null;
    try {
        return JSON.parse(jsonLine.trim());
    } catch {
        return null;
    }
}

(async () => {
    log('Save WEB 2.0 session →', BASE);
    await ensureLocalServer(BASE);

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'cache-control': 'no-cache' } });
    const page = await ctx.newPage();

    // Login WEB 2.0 (form riêng — KHÔNG phải Web 1.0).
    await page.goto(`${BASE}/web2/login/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loginSubmit', { timeout: 30_000 });
    await page.fill('#loginUsername', USER);
    await page.fill('#loginPassword', PASS);
    await page.click('#loginSubmit');
    await page.waitForFunction(() => !!localStorage.getItem('web2_auth'), { timeout: 25_000 });
    log('Web 2.0 login OK.');

    // Ổn định context (login redirect) trước khi đọc localStorage.
    await page
        .goto(`${BASE}/web2/overview/index.html`, { waitUntil: 'domcontentloaded' })
        .catch(() => {});
    await page.waitForFunction(() => !!localStorage.getItem('web2_auth'), { timeout: 15_000 });

    const web2 = await page.evaluate(() => {
        const ls = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (/web2/i.test(k)) ls[k] = localStorage.getItem(k); // web2_auth + web2_* khác
        }
        return { origin: location.origin, capturedAt: new Date().toISOString(), localStorage: ls };
    });
    const cookies = await ctx.cookies();
    await browser.close();

    if (!web2.localStorage.web2_auth) {
        console.error('Không lấy được web2_auth — kiểm tra cred web2 (--user/--pass).');
        process.exit(1);
    }

    // MERGE vào block host (giữ key Web 1.0 + sessionStorage nếu đã có).
    let existing = '';
    try {
        existing = fs.readFileSync(SECRET_FILE, 'utf8');
    } catch {
        existing = '';
    }
    const prev = readExistingSnapshot(existing) || {
        localStorage: {},
        sessionStorage: {},
        cookies: [],
    };
    const snapshot = {
        origin: web2.origin,
        capturedAt: web2.capturedAt,
        localStorage: { ...(prev.localStorage || {}), ...web2.localStorage },
        sessionStorage: prev.sessionStorage || {},
        // cookies web2 thường rỗng (token ở localStorage) — giữ cookie cũ nếu web2 không có.
        cookies: cookies && cookies.length ? cookies : prev.cookies || [],
    };

    const block = `${SECTION}\n# captured: ${snapshot.capturedAt} (web2)\n# origin: ${snapshot.origin}\n# restore with: node scripts/restore-login-session.js --base ${BASE}\n${JSON.stringify(snapshot, null, 0)}\n`;

    let next;
    const re = new RegExp(
        `(^|\\n)${SECTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=(\\n## |$))`,
        'g'
    );
    if (re.test(existing)) {
        next = existing.replace(re, `$1${block.trim()}\n`);
    } else {
        const sep = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
        next = `${existing}${sep}\n${block.trim()}\n`;
    }
    fs.writeFileSync(SECRET_FILE, next, 'utf8');
    log(
        `Wrote web2_auth → ${SECTION} (${fs.statSync(SECRET_FILE).size} bytes). web2 LS keys=${Object.keys(web2.localStorage).length}.`
    );
})().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
