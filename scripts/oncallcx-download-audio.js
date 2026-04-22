#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * OnCallCX — Download call recordings
 *
 * Luồng:
 *   1. Login vào pbx-ucaas.oncallcx.vn (credentials từ serect_dont_push.txt)
 *   2. Vào /portal/extensionCalls.xhtml
 *   3. Scan toàn bộ audio/download links + AJAX audio endpoints
 *   4. Download file .wav/.mp3 vào downloads/oncallcx-recordings/
 *
 * Usage:
 *   node scripts/oncallcx-download-audio.js              # visible + download
 *   HEADLESS=1 node scripts/oncallcx-download-audio.js   # headless
 *   DRY_RUN=1 node scripts/oncallcx-download-audio.js    # chỉ liệt kê, không download
 *   MAX=N                                                # giới hạn số file
 */

const fs = require('fs');
const path = require('path');

const SECRETS_FILE = path.resolve(__dirname, '..', 'serect_dont_push.txt');
const OUT_DIR      = path.resolve(__dirname, '..', 'downloads', 'oncallcx-recordings');
const REPORT_JSON  = path.resolve(__dirname, '..', 'docs', 'oncallcx-extensionCalls-capture.json');

const LOGIN_URL        = 'https://pbx-ucaas.oncallcx.vn/portal/login.xhtml';
const EXTENSION_CALLS  = 'https://pbx-ucaas.oncallcx.vn/portal/extensionCalls.xhtml';
const HOST             = 'pbx-ucaas.oncallcx.vn';

const HEADLESS = process.env.HEADLESS === '1';
const DRY_RUN  = process.env.DRY_RUN === '1';
const MAX      = parseInt(process.env.MAX || '0', 10);

// ==================== Credentials ====================

function readCredentials() {
    const content = fs.readFileSync(SECRETS_FILE, 'utf8');
    const line = content.split('\n').find(l => l.includes('pbx-ucaas.oncallcx.vn') && !l.includes('PBX_HOST'));
    if (!line) throw new Error('Không tìm thấy credentials');
    const after = line.replace(/^\s*\d+\/?\s*/, '').replace(/"[^"]*"\s*/, '');
    const parts = after.trim().split(/\s+/);
    return { username: parts[0], password: parts.slice(1).join(' ') };
}

// ==================== Helpers ====================

function sanitizeFilename(s) {
    return s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);
}

function isAudioUrl(url, contentType = '') {
    const u = url.toLowerCase();
    const ct = (contentType || '').toLowerCase();
    return /\.(wav|mp3|ogg|m4a|opus)(\?|$)/.test(u) ||
           /downloadrecord|playrecord|audio|recording/i.test(u) ||
           ct.startsWith('audio/');
}

// ==================== Main ====================

async function main() {
    const { chromium } = require('playwright');
    const creds = readCredentials();
    console.log(`[info] Login as ${creds.username}`);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });

    const browser = await chromium.launch({ headless: HEADLESS, args: ['--disable-blink-features=AutomationControlled'] });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Capture mọi request/response để phân tích sau
    const network = [];
    const audioCandidates = new Map(); // url -> {url, method, contentType, size}

    page.on('request', (req) => {
        if (!req.url().includes(HOST)) return;
        network.push({ phase: 'req', ts: Date.now(), method: req.method(), url: req.url(), resourceType: req.resourceType() });
    });
    page.on('response', async (res) => {
        if (!res.url().includes(HOST)) return;
        const h = res.headers();
        const ct = h['content-type'] || '';
        network.push({ phase: 'res', ts: Date.now(), status: res.status(), url: res.url(), contentType: ct, contentLength: h['content-length'] });
        if (isAudioUrl(res.url(), ct)) {
            audioCandidates.set(res.url(), { url: res.url(), method: res.request().method(), contentType: ct, size: h['content-length'] });
        }
    });

    // ---------- 1. LOGIN ----------
    console.log('[info] Navigate login page ...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator('input[type="text"], input[name*="user" i]').first().fill(creds.username);
    await page.locator('input[type="password"]').first().fill(creds.password);
    const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Đăng nhập"), input[type="submit"]').first();
    await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}),
        submitBtn.count().then(c => c > 0 ? submitBtn.click() : page.locator('input[type="password"]').press('Enter')),
    ]);
    await page.waitForTimeout(2000);
    const cookies = await context.cookies();
    const hasAuth = cookies.some(c => c.name === 'ANAUTH');
    console.log(`[info] Login ${hasAuth ? 'OK' : 'UNKNOWN'} (ANAUTH=${hasAuth}). URL: ${page.url()}`);
    if (!hasAuth) {
        console.error('[error] Login không thành công — dừng.');
        await browser.close();
        process.exit(2);
    }

    // ---------- 2. EXTENSION CALLS PAGE ----------
    console.log(`[info] Navigate ${EXTENSION_CALLS} ...`);
    await page.goto(EXTENSION_CALLS, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    console.log(`[info] URL: ${page.url()}`);

    // Lưu HTML để debug cấu trúc
    const htmlPath = path.resolve(__dirname, '..', 'docs', 'oncallcx-extensionCalls.html');
    fs.writeFileSync(htmlPath, await page.content());
    console.log(`[info] HTML dump: ${htmlPath}`);

    // Scan tĩnh: audio tags + link download
    const staticLinks = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('audio, source').forEach(el => {
            const src = el.src || el.getAttribute('src');
            if (src) out.push({ kind: 'audio', src });
        });
        document.querySelectorAll('a[href]').forEach(a => {
            const href = a.href;
            if (/\.(wav|mp3|ogg|m4a)(\?|$)/i.test(href) || /downloadRecord|playRecord|record|audio/i.test(href)) {
                out.push({ kind: 'anchor', src: href, text: (a.textContent || '').trim().slice(0, 80) });
            }
        });
        // Buttons có data-* chứa url hoặc onclick chứa url
        document.querySelectorAll('button, [onclick], [data-url], [data-src], [data-record]').forEach(el => {
            const attrs = ['onclick', 'data-url', 'data-src', 'data-record', 'data-file'];
            attrs.forEach(a => {
                const v = el.getAttribute(a);
                if (v && /\.(wav|mp3)|record|audio/i.test(v)) out.push({ kind: 'button-attr', attr: a, value: v, text: (el.textContent || '').trim().slice(0, 80) });
            });
        });
        return out;
    });
    console.log(`[info] Static scan: ${staticLinks.length} candidates`);

    // Thử click các button "play" để trigger load audio qua AJAX
    const playButtons = page.locator('button:has-text("Play"), button[title*="play" i], [class*="play"], i[class*="play"]');
    const nPlay = await playButtons.count();
    console.log(`[info] Found ${nPlay} play-like elements — clicking để trigger audio load ...`);
    const tryClicks = Math.min(nPlay, MAX || 20);
    for (let i = 0; i < tryClicks; i++) {
        try {
            await playButtons.nth(i).scrollIntoViewIfNeeded({ timeout: 1000 });
            await playButtons.nth(i).click({ timeout: 2000, force: true });
            await page.waitForTimeout(600);
        } catch {/* ignore */}
    }
    await page.waitForTimeout(2500);

    // ---------- 3. TẢI AUDIO ----------
    // Convert Set cookies → Cookie header để fetch bằng APIRequestContext (giữ session)
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const api = await require('playwright').request.newContext({
        extraHTTPHeaders: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Cookie: cookieHeader,
            Referer: EXTENSION_CALLS,
        },
    });

    const allUrls = new Set();
    staticLinks.forEach(s => { if (s.src && /^https?:/i.test(s.src)) allUrls.add(s.src); });
    audioCandidates.forEach((_v, k) => allUrls.add(k));

    console.log(`[info] Total audio URL candidates: ${allUrls.size}`);
    const downloaded = [];
    let idx = 0;
    for (const url of allUrls) {
        if (MAX && idx >= MAX) break;
        idx++;
        if (DRY_RUN) { console.log(`  [dry] ${url}`); continue; }
        try {
            const r = await api.get(url, { timeout: 30000 });
            const status = r.status();
            const ct = r.headers()['content-type'] || '';
            if (status !== 200 || !/audio|octet-stream|wav|mp3|mpeg/i.test(ct)) {
                console.log(`  [skip] ${status} ${ct} ${url}`);
                continue;
            }
            const body = await r.body();
            // Đặt tên file
            const urlObj = new URL(url);
            const base = sanitizeFilename(path.basename(urlObj.pathname) || `rec_${idx}`);
            const ext = ct.includes('wav') ? '.wav' : ct.includes('mpeg') || ct.includes('mp3') ? '.mp3' : (path.extname(base) || '.audio');
            const fname = (path.extname(base) ? base : base + ext);
            const fpath = path.join(OUT_DIR, fname);
            fs.writeFileSync(fpath, body);
            console.log(`  [ok]   ${body.length}B -> ${fpath}`);
            downloaded.push({ url, path: fpath, bytes: body.length, contentType: ct });
        } catch (e) {
            console.log(`  [err]  ${url} — ${e.message}`);
        }
    }

    // ---------- 4. REPORT ----------
    const report = {
        capturedAt: new Date().toISOString(),
        loginAs: creds.username,
        finalUrl: page.url(),
        audioCandidatesCount: allUrls.size,
        downloadedCount: downloaded.length,
        downloaded,
        staticLinks,
        networkAudioCandidates: [...audioCandidates.values()],
        allNetworkSample: network.slice(-200),
    };
    fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
    console.log(`\n[done] Downloaded ${downloaded.length}/${allUrls.size}. Report: ${REPORT_JSON}`);

    await browser.close();
}

main().catch((e) => { console.error('[fatal]', e); process.exit(1); });
