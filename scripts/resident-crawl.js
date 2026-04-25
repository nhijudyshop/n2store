#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Resident.vn full-site crawler
 *
 * 1. Mở Chromium visible tại trang login.
 * 2. Chờ user đăng nhập tay (script poll URL — khi rời khỏi /auth/signin coi như xong).
 * 3. Sau khi login: BFS crawl mọi link cùng origin + capture mọi XHR/fetch response.
 * 4. Lưu: HTML mỗi trang + body JSON/text mỗi API call + manifest.json + cookies.
 *
 * Usage:
 *   node scripts/resident-crawl.js
 *
 * Env:
 *   MAX_PAGES=50      Giới hạn số trang HTML BFS (default 50)
 *   MAX_DEPTH=3       Giới hạn độ sâu BFS  (default 3)
 *   IDLE_MS=2000      networkidle timeout per page (default 2000)
 *   START_URL=https://app.resident.vn/auth/signin?next=%2F
 *
 * Output:
 *   downloads/resident-crawl/<timestamp>/
 *     ├── manifest.json
 *     ├── cookies.json
 *     ├── pages/<slug>.html
 *     ├── api/<idx>-<method>-<slug>.json|.txt
 *     └── screenshots/<slug>.png
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const START_URL = process.env.START_URL || 'https://app.resident.vn/auth/signin?next=%2F';
const ROOT_HOST = 'app.resident.vn';
const APP_ROOT = `https://${ROOT_HOST}`;
const MAX_PAGES = Number(process.env.MAX_PAGES || 50);
const MAX_DEPTH = Number(process.env.MAX_DEPTH || 3);
const IDLE_MS = Number(process.env.IDLE_MS || 2000);

const TS = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.resolve(__dirname, '..', 'downloads', 'resident-crawl', TS);
const PAGES_DIR = path.join(OUT_DIR, 'pages');
const API_DIR = path.join(OUT_DIR, 'api');
const SHOTS_DIR = path.join(OUT_DIR, 'screenshots');
[OUT_DIR, PAGES_DIR, API_DIR, SHOTS_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

function slug(u) {
    try {
        const url = new URL(u, APP_ROOT);
        const p = (url.pathname + url.search).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
        return (p || 'root').slice(0, 120);
    } catch {
        return 'unknown';
    }
}

function sameOrigin(u) {
    try {
        return new URL(u, APP_ROOT).host === ROOT_HOST;
    } catch {
        return false;
    }
}

function isHtmlNav(u) {
    if (!sameOrigin(u)) return false;
    try {
        const url = new URL(u, APP_ROOT);
        // bỏ asset
        if (
            /\.(png|jpe?g|gif|svg|webp|ico|css|js|map|woff2?|ttf|eot|mp4|mp3|pdf|zip)$/i.test(
                url.pathname
            )
        )
            return false;
        // bỏ logout / signout
        if (/(logout|sign-?out|đăng-xuất)/i.test(url.pathname)) return false;
        return true;
    } catch {
        return false;
    }
}

async function waitForLogin(page) {
    console.log('[wait] Vui lòng đăng nhập trên cửa sổ Chromium đang mở.');
    console.log('[wait] Script tự phát hiện khi URL rời khỏi /auth/signin ...');
    const start = Date.now();
    const TIMEOUT = 15 * 60 * 1000; // 15 phút
    while (Date.now() - start < TIMEOUT) {
        const u = page.url();
        if (!u.includes('/auth/signin') && !u.includes('/auth/login')) {
            console.log(`[ok] Phát hiện đã login. URL: ${u}`);
            return;
        }
        await page.waitForTimeout(1500);
    }
    throw new Error('Hết 15 phút chưa login.');
}

async function captureResponses(page, manifest) {
    let counter = 0;
    page.on('response', async (res) => {
        const url = res.url();
        if (!sameOrigin(url)) return;
        const req = res.request();
        const resourceType = req.resourceType();
        // Quan tâm: xhr/fetch/document
        if (!['xhr', 'fetch', 'document'].includes(resourceType)) return;
        try {
            const ct = (res.headers()['content-type'] || '').toLowerCase();
            const status = res.status();
            const method = req.method();
            const isJson = ct.includes('json');
            const isText = ct.includes('text') || ct.includes('xml') || ct.includes('html');
            if (!isJson && !isText) return;
            const buf = await res.body().catch(() => null);
            if (!buf) return;
            const idx = String(++counter).padStart(4, '0');
            const ext = isJson ? 'json' : ct.includes('html') ? 'html' : 'txt';
            const fname = `${idx}-${method}-${slug(url)}.${ext}`;
            const fpath = path.join(API_DIR, fname);
            fs.writeFileSync(fpath, buf);
            manifest.api.push({
                idx,
                method,
                url,
                status,
                contentType: ct,
                resourceType,
                size: buf.length,
                file: path.relative(OUT_DIR, fpath),
            });
        } catch (e) {
            // ignore stream errors
        }
    });
}

async function crawl(page, manifest) {
    const seen = new Set();
    const queue = [{ url: APP_ROOT + '/', depth: 0 }];

    while (queue.length && manifest.pages.length < MAX_PAGES) {
        const { url, depth } = queue.shift();
        const key = url.split('#')[0];
        if (seen.has(key)) continue;
        seen.add(key);

        console.log(`[crawl ${manifest.pages.length + 1}/${MAX_PAGES}] depth=${depth} → ${url}`);
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForLoadState('networkidle', { timeout: IDLE_MS }).catch(() => {});
            // tự cuộn để trigger lazy loaders
            await page
                .evaluate(async () => {
                    await new Promise((res) => {
                        let total = 0;
                        const step = () => {
                            const dy = 800;
                            window.scrollBy(0, dy);
                            total += dy;
                            if (total >= document.body.scrollHeight + 1000) return res();
                            setTimeout(step, 250);
                        };
                        step();
                    });
                })
                .catch(() => {});
            await page.waitForTimeout(800);

            const html = await page.content();
            const sl = slug(url);
            fs.writeFileSync(path.join(PAGES_DIR, `${sl}.html`), html);
            await page
                .screenshot({ path: path.join(SHOTS_DIR, `${sl}.png`), fullPage: false })
                .catch(() => {});

            // collect links
            const links = await page.$$eval('a[href]', (els) =>
                els.map((a) => a.getAttribute('href')).filter(Boolean)
            );
            const title = await page.title().catch(() => '');
            const finalUrl = page.url();

            manifest.pages.push({
                url,
                finalUrl,
                title,
                depth,
                slug: sl,
                file: path.relative(OUT_DIR, path.join(PAGES_DIR, `${sl}.html`)),
                outboundLinks: links.length,
            });

            if (depth < MAX_DEPTH) {
                for (const href of links) {
                    let abs;
                    try {
                        abs = new URL(href, finalUrl).toString();
                    } catch {
                        continue;
                    }
                    if (!isHtmlNav(abs)) continue;
                    if (!seen.has(abs.split('#')[0])) {
                        queue.push({ url: abs, depth: depth + 1 });
                    }
                }
            }
        } catch (e) {
            manifest.errors.push({ url, error: String((e && e.message) || e) });
            console.warn(`[err] ${url} → ${e.message}`);
        }
    }
}

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

    const manifest = {
        startedAt: new Date().toISOString(),
        startUrl: START_URL,
        host: ROOT_HOST,
        maxPages: MAX_PAGES,
        maxDepth: MAX_DEPTH,
        pages: [],
        api: [],
        errors: [],
    };

    await captureResponses(page, manifest);

    console.log(`[open] ${START_URL}`);
    await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await waitForLogin(page);

    // sau login: lưu cookies
    const cookies = await context.cookies();
    fs.writeFileSync(path.join(OUT_DIR, 'cookies.json'), JSON.stringify(cookies, null, 2));

    // crawl
    await crawl(page, manifest);

    manifest.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

    console.log('\n=== DONE ===');
    console.log(`pages : ${manifest.pages.length}`);
    console.log(`api   : ${manifest.api.length}`);
    console.log(`errors: ${manifest.errors.length}`);
    console.log(`out   : ${OUT_DIR}`);

    await browser.close();
}

main().catch((e) => {
    console.error('[fatal]', e);
    process.exit(1);
});
