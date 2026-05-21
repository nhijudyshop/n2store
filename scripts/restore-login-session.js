#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// Helper: load a stored login snapshot from `serect_dont_push.txt` and inject
// localStorage / sessionStorage / cookies into a Playwright BrowserContext so
// scripts can skip the login form entirely.
//
// Usage in another script:
//   const { restoreLoginSession } = require('./restore-login-session.js');
//   const browser = await chromium.launch();
//   const ctx = await browser.newContext();
//   const ok = await restoreLoginSession(ctx, { base: 'http://localhost:8080' });
//   if (!ok) { /* fall back to login form */ }

const fs = require('fs');
const path = require('path');

const SECRET_FILE_DEFAULT = path.join(__dirname, '..', 'serect_dont_push.txt');

function readSnapshot({ base, secretFile = SECRET_FILE_DEFAULT } = {}) {
    if (!fs.existsSync(secretFile)) return null;
    const text = fs.readFileSync(secretFile, 'utf8');
    const host = new URL(base).host.replace(/[^\w.-]/g, '_');
    const section = `## n2store_session_${host}`;
    const re = new RegExp(
        `${section.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}[\\s\\S]*?\\n(\\{[\\s\\S]*?\\})\\s*(?=\\n## |$)`,
        'm'
    );
    const m = text.match(re);
    if (!m) return null;
    try {
        return JSON.parse(m[1]);
    } catch (_) {
        return null;
    }
}

async function restoreLoginSession(
    ctx,
    { base, secretFile = SECRET_FILE_DEFAULT, maxAgeHours = 240 } = {}
) {
    const snap = readSnapshot({ base, secretFile });
    if (!snap) return null;
    const ageMs = Date.now() - new Date(snap.capturedAt).getTime();
    if (Number.isFinite(maxAgeHours) && ageMs > maxAgeHours * 3600 * 1000) return null;
    if (Array.isArray(snap.cookies) && snap.cookies.length > 0) {
        await ctx.addCookies(snap.cookies);
    }
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
        ({ ls, ss }) => {
            for (const [k, v] of Object.entries(ls || {})) localStorage.setItem(k, v);
            for (const [k, v] of Object.entries(ss || {})) sessionStorage.setItem(k, v);
        },
        { ls: snap.localStorage, ss: snap.sessionStorage }
    );
    await page.close();
    return snap;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const get = (n, d) => {
        const i = args.indexOf(`--${n}`);
        return i >= 0 ? args[i + 1] : d;
    };
    const base = (get('base', 'http://localhost:8080') || '').replace(/\/$/, '');
    const snap = readSnapshot({ base });
    if (!snap) {
        console.error('no snapshot for', base);
        process.exit(1);
    }
    const lsKeys = Object.keys(snap.localStorage || {});
    const ssKeys = Object.keys(snap.sessionStorage || {});
    console.log(
        JSON.stringify(
            {
                origin: snap.origin,
                capturedAt: snap.capturedAt,
                lsKeys,
                ssKeys,
                cookieCount: (snap.cookies || []).length,
            },
            null,
            2
        )
    );
}

module.exports = { readSnapshot, restoreLoginSession };
