#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Probe pancake.vn/multi_pages with JWT cookie injection.
// Captures: network XHR/WS frames + DOM snapshot + screenshot.
// Usage: node scripts/probe-pancake-multipages.js
//
// Reads PANCAKE_JWT from /Users/mac/Desktop/n2store/serect_dont_push.txt.
// Writes outputs to downloads/n2store-session/multipages-probe/

const fs = require('fs');
const path = require('path');

const SECRETS_FILE = '/Users/mac/Desktop/n2store/serect_dont_push.txt';
const OUT_DIR = path.join(
    '/Users/mac/Desktop/n2store',
    'downloads/n2store-session/multipages-probe'
);
fs.mkdirSync(OUT_DIR, { recursive: true });

function readSecret(key) {
    const text = fs.readFileSync(SECRETS_FILE, 'utf8');
    const re = new RegExp('^' + key + ':\\s*(\\S+)', 'm');
    const m = text.match(re);
    return m ? m[1] : null;
}

(async () => {
    const JWT = readSecret('PANCAKE_JWT');
    if (!JWT) throw new Error('PANCAKE_JWT not found in ' + SECRETS_FILE);
    console.log('JWT length:', JWT.length, 'starts:', JWT.slice(0, 20) + '…');

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
    });

    // Inject Pancake JWT — both as cookie (HttpOnly-equivalent set via ctx)
    // AND localStorage entries (some flows read from there).
    await ctx.addCookies([
        { name: 'jwt', value: JWT, domain: '.pancake.vn', path: '/' },
        { name: 'access_token', value: JWT, domain: '.pancake.vn', path: '/' },
        { name: 'locale', value: 'vi', domain: '.pancake.vn', path: '/' },
        { name: 'country', value: 'VN', domain: '.pancake.vn', path: '/' },
    ]);

    const page = await ctx.newPage();

    // Capture XHR responses
    const xhr = [];
    page.on('response', async (res) => {
        const url = res.url();
        if (!url.includes('pancake.vn') && !url.includes('pages.fm')) return;
        if (url.match(/\.(js|css|png|jpg|woff2?|svg|ico)(\?|$)/)) return;
        xhr.push({
            t: Date.now(),
            method: res.request().method(),
            status: res.status(),
            url: url.slice(0, 250),
            ct: res.headers()['content-type'] || '',
        });
    });

    // Capture WS frames
    const wsFrames = [];
    page.on('websocket', (ws) => {
        console.log('[WS]', ws.url());
        ws.on('framesent', (f) => {
            wsFrames.push({ t: Date.now(), dir: 'out', payload: String(f.payload).slice(0, 400) });
        });
        ws.on('framereceived', (f) => {
            wsFrames.push({ t: Date.now(), dir: 'in', payload: String(f.payload).slice(0, 400) });
        });
    });

    // Pre-set localStorage so the SPA finds session right away
    await page.addInitScript((tok) => {
        try {
            localStorage.setItem('jwt', tok);
            localStorage.setItem('access_token', tok);
        } catch (_) {}
    }, JWT);

    console.log('[NAV] /multi_pages');
    await page.goto('https://pancake.vn/multi_pages', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Snapshot DOM + URL
    const url1 = page.url();
    console.log('[URL after nav]', url1);
    await page.screenshot({ path: path.join(OUT_DIR, '1-after-nav.png'), fullPage: false });
    const html1 = await page.content();
    fs.writeFileSync(path.join(OUT_DIR, '1-after-nav.html'), html1.slice(0, 200_000));

    // Open the modal — entry exists in a top-bar menu, may need to wait
    // for nav to render. Click via XPath text match.
    const entryClicked = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, a, div, span')).filter(
            (el) => (el.innerText || '').trim() === 'Chế độ gộp trang'
        );
        if (!candidates.length) return { found: false };
        // Click the deepest leaf node — outer wrappers sometimes have no
        // click handler.
        const leaf = candidates.find((el) => el.childElementCount === 0) || candidates[0];
        leaf.click();
        return {
            found: true,
            count: candidates.length,
            tag: leaf.tagName,
            text: leaf.innerText.slice(0, 60),
        };
    });
    console.log('[CLICK entry]', entryClicked);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '2-after-click-entry.png'), fullPage: false });

    // Click the final "Vào chế độ gộp trang" CTA inside the modal
    const enterClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div'));
        const target = btns.find((el) => {
            const t = (el.innerText || '').trim();
            return t === 'Vào chế độ gộp trang';
        });
        if (!target)
            return {
                found: false,
                btnTexts: btns
                    .map((b) => (b.innerText || '').trim())
                    .filter(Boolean)
                    .slice(0, 30),
            };
        target.click();
        return { found: true, text: target.innerText, tag: target.tagName };
    });
    console.log('[CLICK enter]', enterClicked);
    await page.waitForTimeout(8000);

    await page.screenshot({ path: path.join(OUT_DIR, '3-after-merge.png'), fullPage: false });
    fs.writeFileSync(
        path.join(OUT_DIR, '3-after-merge.html'),
        (await page.content()).slice(0, 200_000)
    );

    // Dump captures
    fs.writeFileSync(path.join(OUT_DIR, 'xhr.json'), JSON.stringify(xhr, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'ws.json'), JSON.stringify(wsFrames, null, 2));
    console.log('[OUT]', OUT_DIR);
    console.log('[XHR count]', xhr.length, '[WS frames]', wsFrames.length);

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
