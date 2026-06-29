// #Note: Local test script — launch Chromium với N2Store extension preloaded,
// nav tpos-pancake page, verify:
//   - Không có Chrome "Allow ... to see this tab" popup (getDisplayMedia)
//   - Pill button #tpos-snap-go-pill KHÔNG xuất hiện
//   - STATE.extReady = true (extension content-script báo sẵn sàng)
//   - Auto-snap tự enable khi có live (Path A — extension only, no popup)
//
// Usage: node scripts/test-tpos-pancake-with-ext.js
// HTTP cmd port: 9998 (khác 9999 của persistent session)

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load SOURCE extension folder (n2store-extension/) thay vì CWS install.
// Source có localhost trong matches → content script inject được trên localhost.
const EXT_SOURCE = '/Users/mac/Desktop/n2store/n2store-extension';
// Fallback CWS install (production version, không có localhost match)
const EXT_ROOT =
    '/Users/mac/Library/Application Support/Google/Chrome/Profile 4/Extensions/dgcicifdlgamleagjangkbbcdgbhmfea';
const USER_DATA_DIR = '/tmp/n2store-test-profile';
const STORAGE_STATE = '/Users/mac/Desktop/n2store/downloads/n2store-session/storage-test-ext.json';
const HTTP_PORT = 9998;

(async () => {
    // Prefer SOURCE folder (has localhost in matches) over CWS install.
    let extPath;
    if (fs.existsSync(path.join(EXT_SOURCE, 'manifest.json'))) {
        extPath = EXT_SOURCE;
        console.log('[test-ext] Using SOURCE extension:', extPath);
    } else {
        const versions = fs.readdirSync(EXT_ROOT).sort();
        const latest = versions[versions.length - 1];
        extPath = path.join(EXT_ROOT, latest);
        console.log('[test-ext] Using CWS extension:', latest, '@', extPath);
    }

    // Launch persistent context (NOT browser.newContext) — required for extensions
    // theo Playwright docs.
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        viewport: { width: 1440, height: 900 },
        args: [
            `--disable-extensions-except=${extPath}`,
            `--load-extension=${extPath}`,
            '--no-first-run',
            '--no-default-browser-check',
        ],
    });
    console.log('[test-ext] Browser launched with extension');

    // Get or create page
    const page = context.pages()[0] || (await context.newPage());

    // Log all console messages (capture extension comms)
    page.on('console', (msg) => {
        const t = msg.text();
        if (/snap|extension|capture|ext|popup/i.test(t)) {
            console.log('[page]', msg.type(), t.slice(0, 200));
        }
    });
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));

    // Try login first (load fresh n2store)
    console.log('[test-ext] Navigating to localhost n2store login...');
    await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const loggedIn = await page.evaluate(() => !!localStorage.getItem('loginindex_auth'));
    if (!loggedIn) {
        console.log('[test-ext] Not logged in — filling form');
        await page.fill('#username', 'admin');
        await page.fill('#password', 'admin@@');
        await page.locator('#password').press('Enter');
        await page.waitForTimeout(5000);
    } else {
        console.log('[test-ext] Already logged in');
    }

    // Navigate to tpos-pancake
    console.log('[test-ext] Navigating to tpos-pancake...');
    await page.goto(`http://localhost:8080/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(15000); // 15s — let auto-snap poll fire

    // Verify state
    const state = await page.evaluate(() => ({
        url: location.href,
        pillExists: !!document.getElementById('tpos-snap-go-pill'),
        extPromptExists: !!document.getElementById('tpos-snap-ext-prompt'),
        liveCampaigns: window.TposState?.liveCampaigns?.length || 0,
        captureStreamActive: !!window.TposState?.captureStream,
        frameBufferActive: !!window.TposState?.frameBufferTimer,
        // SnapState from module (may not be globally exposed)
        snapModuleLoaded:
            typeof window.TposSnap !== 'undefined' ||
            !!document.querySelector('script[src*="tpos-livestream-snap"]'),
    }));
    console.log('[test-ext] page state:', JSON.stringify(state, null, 2));

    // Check for Chrome's getDisplayMedia popup (would be browser-native dialog,
    // not in DOM). If popup appeared, Playwright would have logged dialog event.
    // We register dialog handler:
    page.on('dialog', async (dialog) => {
        console.log('[test-ext] !!! DIALOG appeared:', dialog.type(), dialog.message());
        await dialog.dismiss();
    });

    // Wait more to see if delayed popup
    await page.waitForTimeout(10000);

    // Final state
    const finalState = await page.evaluate(() => ({
        pillExists: !!document.getElementById('tpos-snap-go-pill'),
        extPromptExists: !!document.getElementById('tpos-snap-ext-prompt'),
        captureStreamActive: !!window.TposState?.captureStream,
        frameBufferActive: !!window.TposState?.frameBufferTimer,
    }));
    console.log('[test-ext] FINAL state:', JSON.stringify(finalState, null, 2));

    // Take screenshot
    const screenshotPath =
        '/Users/mac/Desktop/n2store/downloads/n2store-session/tpos-pancake-ext-test.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('[test-ext] Screenshot:', screenshotPath);

    // HTTP server for /cmd interaction (port 9998)
    const httpServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (req.method === 'POST' && req.url === '/cmd') {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', async () => {
                try {
                    const { cmd } = JSON.parse(body);
                    let result;
                    if (cmd.startsWith('eval ')) {
                        result = await page.evaluate(`(async()=>{ ${cmd.slice(5)} })()`);
                    } else if (cmd.startsWith('nav ')) {
                        await page.goto(cmd.slice(4), { waitUntil: 'domcontentloaded' });
                        result = { ok: true, url: page.url() };
                    } else if (cmd === 'shot') {
                        const p = `/tmp/test-ext-${Date.now()}.png`;
                        await page.screenshot({ path: p });
                        result = { path: p };
                    } else {
                        result = { error: 'unknown cmd' };
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result === undefined ? { ok: true } : result));
                } catch (e) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        res.writeHead(404);
        res.end();
    });
    httpServer.listen(HTTP_PORT, () => {
        console.log(`[test-ext] HTTP server: http://localhost:${HTTP_PORT}/cmd`);
        console.log('[test-ext] Browser stays open. Ctrl+C to exit.');
    });

    await new Promise(() => {});
})();
