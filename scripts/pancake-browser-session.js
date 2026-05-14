#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// Persistent Playwright session against Pancake admin inbox
// (pancake.vn/NhiJudyStore). Loads JWT cookie + chat session storage
// from `serect_dont_push.txt`, stays open, accepts commands via stdin
// (works with the same FIFO pattern as n2store-browser-session.js):
//
//   eval <js>     — run JS in page (must use `return` for output)
//   shot <path>   — full-page screenshot
//   nav <url>     — go to URL (cookies persist)
//   wait <ms>     — pause
//   netlast [N]   — last N captured Pancake API calls
//   help / quit
//
// Setup:
//   mkfifo /tmp/pancake-session.fifo
//   (tail -f /tmp/pancake-session.fifo) | node scripts/pancake-browser-session.js &
//
// Send commands from another shell:
//   echo "shot downloads/n2store-session/pancake-inspect/now.png" > /tmp/pancake-session.fifo

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

const SECRETS_PATH = path.join(__dirname, '..', 'serect_dont_push.txt');
const SECRETS = fs.readFileSync(SECRETS_PATH, 'utf-8');
const pick = (re) => SECRETS.match(re)?.[1]?.trim();
const JWT = pick(/^PANCAKE_JWT:\s*(\S+)/m);
const USER_UID = pick(/^PANCAKE_USER_UID:\s*(\S+)/m);
const SESSION_ID = pick(/^PANCAKE_SESSION_ID:\s*(\S+)/m);
const FB_ID = pick(/^PANCAKE_FB_ID:\s*(\S+)/m);
const CHAT_SESSION = pick(/^PANCAKE_LS_PANCAKE_CHAT_SESSION_web_pancakeVN:\s*(.+)$/m);
const PKE_CLIENT = pick(/^PANCAKE_SS_pke_client_session:\s*(.+)$/m);

if (!JWT) {
    console.error('No PANCAKE_JWT in', SECRETS_PATH);
    process.exit(1);
}

const TARGET_URL = process.argv[2] || 'https://pancake.vn/NhiJudyStore';
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session', 'pancake-inspect');
fs.mkdirSync(OUT_DIR, { recursive: true });
const LOG_PATH = path.join(OUT_DIR, 'session.log');
const logFile = fs.createWriteStream(LOG_PATH, { flags: 'a' });
const ts = () => new Date().toISOString();
const log = (...a) => {
    const line = `[${ts()}] ${a.join(' ')}`;
    console.log(line);
    logFile.write(line + '\n');
};

(async () => {
    log('Launching Chromium (headless=false)…');
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    await ctx.addCookies([
        {
            name: 'jwt',
            value: JWT,
            domain: '.pancake.vn',
            path: '/',
            secure: true,
            sameSite: 'Lax',
        },
        {
            name: 'access_token',
            value: JWT,
            domain: '.pancake.vn',
            path: '/',
            secure: true,
            sameSite: 'Lax',
        },
        { name: 'locale', value: 'vi', domain: '.pancake.vn', path: '/', sameSite: 'Lax' },
        { name: 'country', value: 'VN', domain: '.pancake.vn', path: '/', sameSite: 'Lax' },
    ]);
    await ctx.addInitScript(
        ({ jwt, uid, sid, fbId, chat, pke }) => {
            try {
                localStorage.setItem('jwt', jwt);
                localStorage.setItem('access_token', jwt);
                localStorage.setItem('user_uid', uid);
                localStorage.setItem('session_id', sid);
                localStorage.setItem('fb_id', fbId);
                if (chat) localStorage.setItem('PANCAKE_CHAT_SESSION_web_pancakeVN', chat);
                if (pke) sessionStorage.setItem('pke_client_session', pke);
            } catch (_e) {
                /* ignore */
            }
        },
        {
            jwt: JWT,
            uid: USER_UID,
            sid: SESSION_ID,
            fbId: FB_ID,
            chat: CHAT_SESSION,
            pke: PKE_CLIENT,
        }
    );

    const page = await ctx.newPage();

    // Capture Pancake API calls for retrospective debug
    const netBuf = [];
    page.on('response', async (res) => {
        const u = res.url();
        if (!/pancake\.vn|pages\.fm/.test(u)) return;
        try {
            const j = await res.json().catch(() => null);
            netBuf.push({
                t: ts(),
                status: res.status(),
                url: u.slice(0, 220),
                body: j ? JSON.stringify(j).slice(0, 500) : null,
            });
            if (netBuf.length > 200) netBuf.shift();
        } catch (_e) {
            /* ignore */
        }
    });

    log('Navigating to', TARGET_URL);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(4000);
    log('Ready. Send commands via stdin or FIFO.');

    const safe = async (fn, label) => {
        try {
            const r = await fn();
            const s = r === undefined ? 'undefined' : JSON.stringify(r);
            log(`${label} →`, (s == null ? String(s) : s).slice(0, 1200));
        } catch (e) {
            log(`${label} ERROR:`, String(e).slice(0, 300));
        }
    };

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
    });
    rl.on('line', async (raw) => {
        const line = raw.trim();
        if (!line) return;
        const idx = line.indexOf(' ');
        const cmd = (idx === -1 ? line : line.slice(0, idx)).toLowerCase();
        const arg = idx === -1 ? '' : line.slice(idx + 1).trim();

        if (cmd === 'quit' || cmd === 'exit') {
            log('Quitting.');
            await browser.close();
            process.exit(0);
        }
        if (cmd === 'help') {
            console.log(
                'Commands: nav <url> | eval <js> | shot <path> | wait <ms> | netlast [N] | help | quit'
            );
            return;
        }
        if (cmd === 'nav') {
            await safe(async () => {
                await page.goto(arg, { waitUntil: 'networkidle', timeout: 45_000 });
                await page.waitForTimeout(1500);
                return { ok: true, url: page.url() };
            }, `nav ${arg}`);
            return;
        }
        if (cmd === 'eval') {
            await safe(() => page.evaluate(`(async()=>{ ${arg} })()`), 'eval');
            return;
        }
        if (cmd === 'shot') {
            await safe(async () => {
                const p = arg || path.join(OUT_DIR, `shot-${Date.now()}.png`);
                await page.screenshot({ path: p, fullPage: false });
                return { ok: true, path: p };
            }, `shot ${arg}`);
            return;
        }
        if (cmd === 'wait') {
            const n = Math.max(0, Math.min(30_000, parseInt(arg, 10) || 1000));
            await page.waitForTimeout(n);
            log(`wait ${n}ms → done`);
            return;
        }
        if (cmd === 'netlast') {
            const n = Math.max(1, parseInt(arg, 10) || 10);
            const tail = netBuf.slice(-n);
            log(`netlast(${n}):`, JSON.stringify(tail).slice(0, 2000));
            return;
        }
        log(`Unknown command: ${cmd}. Type help.`);
    });

    process.on('SIGINT', async () => {
        log('SIGINT — closing.');
        await browser.close();
        process.exit(0);
    });
})().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
});
