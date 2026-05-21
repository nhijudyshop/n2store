#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// Save fresh login session (localStorage + cookies + sessionStorage) into
// `serect_dont_push.txt` so subsequent Playwright tests can restore the session
// without re-running the login form.
//
// Usage:
//   node scripts/save-login-session.js [--base http://localhost:8080] [--user admin --pass admin@@] [--secret-file /Users/mac/Desktop/n2store/serect_dont_push.txt]
//
// Loads `--base/` (default http://localhost:8080), logs in via #username / #password,
// waits for `loginindex_auth` LS key, then writes a JSON block to the secret file
// under the section heading `## n2store_session_<host>` (replacing the existing one).
// Console output never echoes secret values.

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

(async () => {
    log('Save login session →', BASE);
    await ensureLocalServer(BASE);

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'cache-control': 'no-cache' } });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#username', { timeout: 30_000 });
    await page.fill('#username', USER);
    await page.fill('#password', PASS);
    await page.locator('#password').press('Enter');
    await page.waitForFunction(() => !!localStorage.getItem('loginindex_auth'), {
        timeout: 30_000,
    });

    const snapshot = await page.evaluate(() => {
        const ls = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (/auth|token|login|user|bearer|n2shop/i.test(k)) ls[k] = localStorage.getItem(k);
        }
        const ss = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (/auth|token|login|user/i.test(k)) ss[k] = sessionStorage.getItem(k);
        }
        return {
            origin: location.origin,
            capturedAt: new Date().toISOString(),
            localStorage: ls,
            sessionStorage: ss,
        };
    });

    const cookies = await ctx.cookies();
    snapshot.cookies = cookies;

    await browser.close();

    const block = `${SECTION}\n# captured: ${snapshot.capturedAt}\n# origin: ${snapshot.origin}\n# restore with: node scripts/restore-login-session.js --base ${BASE}\n${JSON.stringify(snapshot, null, 0)}\n`;

    let existing = '';
    try {
        existing = fs.readFileSync(SECRET_FILE, 'utf8');
    } catch (_) {
        existing = '';
    }

    let next;
    const re = new RegExp(
        `(^|\\n)${SECTION.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}[\\s\\S]*?(?=(\\n## |$))`,
        'g'
    );
    if (re.test(existing)) {
        next = existing.replace(re, `$1${block.trim()}\n`);
    } else {
        const sep = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
        next = `${existing}${sep}\n${block.trim()}\n`;
    }

    fs.writeFileSync(SECRET_FILE, next, 'utf8');
    const stats = fs.statSync(SECRET_FILE);
    log(
        `Wrote ${SECTION} → ${SECRET_FILE} (${stats.size} bytes total). LS keys=${Object.keys(snapshot.localStorage).length}, cookies=${snapshot.cookies.length}.`
    );
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
