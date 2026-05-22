#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Stealth Playwright session for GoDaddy DNS management.
// Uses Chrome stable (not Chrome for Testing) + disabled automation flags
// to bypass GoDaddy's bot detection.
//
// Run:
//   mkfifo /tmp/godaddy-session.fifo  # one-time
//   (tail -f /tmp/godaddy-session.fifo) | node scripts/godaddy-dns-session.js &
//
// Send commands:
//   echo "nav https://sso.godaddy.com/" > /tmp/godaddy-session.fifo
//   echo "shot downloads/n2store-session/godaddy-step1.png" > /tmp/godaddy-session.fifo
//   echo "click <selector>" > /tmp/godaddy-session.fifo
//   echo "type <selector> <value>" > /tmp/godaddy-session.fifo
//   echo "eval <js>" > /tmp/godaddy-session.fifo
//   echo "url" > /tmp/godaddy-session.fifo
//   echo "quit" > /tmp/godaddy-session.fifo

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session');
fs.mkdirSync(OUT_DIR, { recursive: true });
const LOG_FILE = path.join(OUT_DIR, 'godaddy-session.log');
const USER_DATA_DIR = path.join(__dirname, '..', '.local', 'godaddy-chrome-profile');
fs.mkdirSync(USER_DATA_DIR, { recursive: true });

const ts = () => new Date().toISOString();
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const log = (...a) => {
    const line = `[${ts()}] ${a.join(' ')}`;
    process.stdout.write(line + '\n');
    logStream.write(line + '\n');
};

(async () => {
    log('Launching Chrome stable (stealth, persistent context)…');

    const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
        channel: 'chrome',
        headless: false,
        viewport: null,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-default-browser-check',
            '--no-first-run',
            '--start-maximized',
        ],
        ignoreDefaultArgs: [
            '--enable-automation',
            '--disable-component-extensions-with-background-pages',
        ],
    });

    // Stealth: remove navigator.webdriver
    await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5].map(() => ({ name: 'Chrome PDF Plugin' })),
        });
        Object.defineProperty(navigator, 'languages', {
            get: () => ['vi-VN', 'vi', 'en-US', 'en'],
        });
        window.chrome = { runtime: {} };
    });

    const page = ctx.pages()[0] || (await ctx.newPage());
    log('Ready. Page:', page.url());

    const rl = readline.createInterface({ input: process.stdin });

    const run = async (line) => {
        line = line.trim();
        if (!line) return;
        log('CMD:', line);
        try {
            const [cmd, ...rest] = line.split(' ');
            const arg = rest.join(' ');

            if (cmd === 'quit') {
                await ctx.close();
                process.exit(0);
            } else if (cmd === 'nav') {
                await page.goto(arg, { waitUntil: 'domcontentloaded', timeout: 60000 });
                log('OK nav →', page.url());
            } else if (cmd === 'url') {
                log('URL:', page.url(), '| title:', await page.title());
            } else if (cmd === 'shot') {
                const outPath = arg || path.join(OUT_DIR, `godaddy-${Date.now()}.png`);
                await page.screenshot({ path: outPath, fullPage: true });
                log('OK shot →', outPath);
            } else if (cmd === 'click') {
                await page.locator(arg).first().click({ timeout: 10000 });
                log('OK click:', arg);
            } else if (cmd === 'type') {
                // type <selector>|||<value>
                const [sel, ...val] = arg.split('|||');
                await page.locator(sel.trim()).first().fill(val.join('|||').trim());
                log('OK type:', sel);
            } else if (cmd === 'press') {
                // press <selector>|||<key>   OR   press <key>
                if (arg.includes('|||')) {
                    const [sel, key] = arg.split('|||');
                    await page.locator(sel.trim()).first().press(key.trim());
                } else {
                    await page.keyboard.press(arg);
                }
                log('OK press:', arg);
            } else if (cmd === 'eval') {
                const result = await page.evaluate(arg);
                log('EVAL:', JSON.stringify(result)?.slice(0, 1000));
            } else if (cmd === 'tabs') {
                const pages = ctx.pages();
                pages.forEach((p, i) => log(`  [${i}]`, p.url()));
            } else if (cmd === 'switchtab') {
                const idx = parseInt(arg, 10);
                const pages = ctx.pages();
                if (pages[idx]) {
                    await pages[idx].bringToFront();
                    log('Switched to tab', idx, '→', pages[idx].url());
                }
            } else if (cmd === 'wait') {
                await page.waitForTimeout(parseInt(arg, 10) || 1000);
                log('OK wait', arg, 'ms');
            } else {
                log('Unknown cmd:', cmd);
            }
        } catch (e) {
            log('ERR:', e.message);
        }
    };

    rl.on('line', run);

    // Initial navigation
    await page.goto('https://sso.godaddy.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    log('Initial nav done →', page.url());
})();
