#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * OnCallCX — Download call recordings từ /portal/pbxCalls.xhtml
 *
 * Flow:
 *   1. Login → vào pbxCalls.xhtml
 *   2. Lặp qua từng trang của bảng calls (paginator)
 *   3. Pre-filter row: skip Connected=No hoặc Duration=00:00:00
 *   4. Click row → check Download Audio enabled → click Download → lưu file
 *
 * Env:
 *   HEADLESS=1          — chạy không hiển thị browser
 *   MAX=N               — dừng sau N file download
 *   DRY_RUN=1           — chỉ liệt kê row có recording, không download
 *   MAX_PAGES=N         — giới hạn số trang duyệt (default 10)
 *   ONLY_CONNECTED=0    — bỏ filter Connected=Yes (thử all rows)
 */

const fs = require('fs');
const path = require('path');

const SECRETS_FILE = path.resolve(__dirname, '..', 'serect_dont_push.txt');
const OUT_DIR      = path.resolve(__dirname, '..', 'downloads', 'oncallcx-recordings');
const REPORT       = path.resolve(__dirname, '..', 'docs', 'oncallcx-recordings-report.json');

const LOGIN_URL  = 'https://pbx-ucaas.oncallcx.vn/portal/login.xhtml';
const CALLS_URL  = 'https://pbx-ucaas.oncallcx.vn/portal/pbxCalls.xhtml';

const HEADLESS = process.env.HEADLESS === '1';
const DRY_RUN  = process.env.DRY_RUN === '1';
const MAX      = parseInt(process.env.MAX || '0', 10);
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '10', 10);
const ONLY_CONNECTED = process.env.ONLY_CONNECTED !== '0';

function readCredentials() {
    const content = fs.readFileSync(SECRETS_FILE, 'utf8');
    const line = content.split('\n').find(l => l.includes('pbx-ucaas.oncallcx.vn') && !l.includes('PBX_HOST'));
    const after = line.replace(/^\s*\d+\/?\s*/, '').replace(/"[^"]*"\s*/, '');
    const parts = after.trim().split(/\s+/);
    return { username: parts[0], password: parts.slice(1).join(' ') };
}

function sanitize(s) { return (s || '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120); }

async function scanPageRows(page) {
    return await page.evaluate(() => {
        const tbl = document.querySelector('#content\\:calls\\:calls tbody');
        if (!tbl) return [];
        const trs = [...tbl.querySelectorAll('tr[data-ri]')];
        return trs.map(tr => {
            const cells = [...tr.querySelectorAll('td')].map(td => (td.textContent || '').trim().replace(/\s+/g, ' '));
            return {
                dataRi: tr.getAttribute('data-ri'),
                dataRk: tr.getAttribute('data-rk'),
                start: cells[1] || '',
                from:  cells[2] || '',
                outPub: cells[3] || '',
                to: cells[4] || '',
                restricted: cells[5] || '',
                connected: cells[6] || '',
                duration: cells[7] || '',
                sipStatus: cells[8] || '',
            };
        });
    });
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });

    const { chromium } = require('playwright');
    const creds = readCredentials();
    console.log(`[info] Login as ${creds.username}`);

    const browser = await chromium.launch({ headless: HEADLESS });
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    // --- Login ---
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    await page.locator('input[type="text"]').first().fill(creds.username);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.locator('button[type="submit"], input[type="submit"]').first().click(),
    ]);
    await page.waitForTimeout(2000);
    if (!(await ctx.cookies()).some(c => c.name === 'ANAUTH')) throw new Error('Login failed');
    console.log('[ok] Login');

    await page.goto(CALLS_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    console.log(`[info] ${await page.title()}`);
    await page.locator('#content\\:calls\\:calls').waitFor({ timeout: 15000 });

    // ---- Paginator info ----
    const pageInfo = await page.evaluate(() => {
        const pg = document.querySelector('#content\\:calls\\:calls_paginator_top, #content\\:calls\\:calls_paginator_bottom');
        if (!pg) return { hasPaginator: false };
        const cur = pg.querySelector('.ui-paginator-current')?.textContent?.trim() || '';
        const pagesN = pg.querySelectorAll('.ui-paginator-page').length;
        return { hasPaginator: true, current: cur, pagesShownOnPaginator: pagesN };
    });
    console.log(`[info] Paginator: ${JSON.stringify(pageInfo)}`);

    const downloadBtn = page.locator('#content\\:calls\\:j_id_89');
    const nextPageBtn = page.locator('#content\\:calls\\:calls_paginator_top a.ui-paginator-next, #content\\:calls\\:calls_paginator_bottom a.ui-paginator-next').first();

    const summary = [];
    let downloaded = 0;
    let pagesVisited = 0;

    while (pagesVisited < MAX_PAGES) {
        pagesVisited++;
        const rowsData = await scanPageRows(page);
        const eligible = rowsData.filter(r => {
            if (!ONLY_CONNECTED) return true;
            return /yes/i.test(r.connected) && r.duration && r.duration !== '00:00:00';
        });
        console.log(`\n[page ${pagesVisited}] ${rowsData.length} rows | eligible (Connected+Duration>0): ${eligible.length}`);

        for (const r of eligible) {
            if (MAX && downloaded >= MAX) break;

            const rowLocator = page.locator(`#content\\:calls\\:calls tbody tr[data-ri="${r.dataRi}"]`).first();
            try {
                await rowLocator.scrollIntoViewIfNeeded({ timeout: 2000 });
                // PrimeFaces: phải click radio.ui-radiobutton-box hoặc cell (không phải tr)
                const radioBox = rowLocator.locator('.ui-radiobutton-box').first();
                await radioBox.click({ timeout: 3000 });
                // Đợi AJAX selection response
                await page.waitForResponse(
                    r => r.url().includes('pbxCalls.xhtml') && r.request().method() === 'POST',
                    { timeout: 5000 }
                ).catch(() => {});
                await page.waitForTimeout(400);
            } catch (e) {
                summary.push({ page: pagesVisited, ...r, status: 'click-failed', error: e.message });
                continue;
            }

            const disabled = await downloadBtn.getAttribute('disabled');
            if (disabled !== null) {
                summary.push({ page: pagesVisited, ...r, status: 'no-recording' });
                console.log(`  [skip] ${r.start} ${r.from}->${r.outPub} dur=${r.duration} (btn disabled)`);
                continue;
            }

            if (DRY_RUN) {
                summary.push({ page: pagesVisited, ...r, status: 'dry-has-recording' });
                console.log(`  [dry]  ${r.start} ${r.from}->${r.outPub} dur=${r.duration} RECORDING AVAIL`);
                continue;
            }

            try {
                const [dl] = await Promise.all([
                    page.waitForEvent('download', { timeout: 20000 }),
                    downloadBtn.click({ timeout: 5000 }),
                ]);
                const suggested = dl.suggestedFilename();
                const fname = `${sanitize(r.start.replace(/\D+/g, '_'))}_${sanitize(r.from)}-${sanitize(r.outPub || r.to)}_${sanitize(suggested || 'rec.wav')}`;
                const fpath = path.join(OUT_DIR, fname);
                await dl.saveAs(fpath);
                const bytes = fs.statSync(fpath).size;
                downloaded++;
                console.log(`  [ok]   ${bytes}B -> ${fname}`);
                summary.push({ page: pagesVisited, ...r, status: 'downloaded', file: fpath, bytes });
            } catch (e) {
                console.log(`  [err]  ${r.start}: ${e.message.slice(0, 100)}`);
                summary.push({ page: pagesVisited, ...r, status: 'download-failed', error: e.message });
            }
        }

        if (MAX && downloaded >= MAX) { console.log(`[info] Reached MAX=${MAX}, stopping.`); break; }

        // Next page
        const hasNext = await nextPageBtn.count() > 0 && !(await nextPageBtn.getAttribute('class'))?.includes('ui-state-disabled');
        if (!hasNext) { console.log('[info] No next page.'); break; }
        await Promise.all([
            page.waitForResponse(r => r.url().includes('pbxCalls.xhtml'), { timeout: 10000 }).catch(() => {}),
            nextPageBtn.click(),
        ]);
        await page.waitForTimeout(1200);
    }

    fs.writeFileSync(REPORT, JSON.stringify({
        finishedAt: new Date().toISOString(),
        pagesVisited, downloaded,
        eligibleTotal: summary.filter(s => s.status === 'dry-has-recording' || s.status === 'downloaded').length,
        summary,
        outDir: OUT_DIR,
    }, null, 2));

    console.log(`\n[done] Pages visited: ${pagesVisited}, Downloaded: ${downloaded}`);
    console.log(`       Output: ${OUT_DIR}`);
    console.log(`       Report: ${REPORT}`);

    await browser.close();
}

main().catch(e => { console.error('[fatal]', e); process.exit(1); });
