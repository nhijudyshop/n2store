#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Verify excel export buttons visibility matches active view groups
const { chromium } = require('playwright');
const fs = require('fs');

const SECRET_FILE = '/Users/mac/Desktop/n2store/serect_dont_push.txt';
const BASE = 'http://localhost:8080';
const URL = `${BASE}/delivery-report/index.html?t=${Date.now()}`;

function restoreSession(host) {
    const txt = fs.readFileSync(SECRET_FILE, 'utf8');
    const marker = `## n2store_session_${host}`;
    const idx = txt.indexOf(marker);
    const end = txt.indexOf('\n## ', idx + marker.length);
    const block = txt.slice(idx, end > 0 ? end : undefined);
    const jsonLine = block.split('\n').find((l) => l.trim().startsWith('{"origin":'));
    const data = JSON.parse(jsonLine);
    return { localStorage: data.localStorage || {}, cookies: data.cookies || [] };
}

async function readBtns(page) {
    return page.evaluate(() => {
        const groupBtnIds = [
            'drBtnExportGrpTomato',
            'drBtnExportGrpNap',
            'drBtnExportGrpCity',
            'drBtnExportGrpShop',
            'drBtnExportGrpReturn',
        ];
        const provinceBtnIds = ['drBtnExportTomato', 'drBtnExportNap'];
        const allIds = [...groupBtnIds, ...provinceBtnIds];
        const out = {};
        allIds.forEach((id) => {
            const el = document.getElementById(id);
            out[id] = el ? (el.style.display === 'none' ? 'hidden' : 'visible') : 'missing';
        });
        return out;
    });
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const session = restoreSession('localhost_8080');
    const ctx = await browser.newContext({
        storageState: { cookies: session.cookies, origins: [] },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((ls) => {
        for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    }, session.localStorage);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const log = (label, data) => console.log(`[${label}]`, JSON.stringify(data));

    // outside Tra soát
    log('outside-tra-soat', await readBtns(page));

    // Enter Tra soát (lite combo by default)
    await page.evaluate(() => document.getElementById('drBtnTraSoat').click());
    await page.waitForTimeout(3500);
    log('lite-combo-tab', await readBtns(page));

    // Switch to zero tab
    await page.evaluate(() => document.querySelector('.dr-trasoat-tab[data-tab=zero]').click());
    await page.waitForTimeout(2000);
    log('lite-zero-tab', await readBtns(page));

    // Triple-click expand
    await page.evaluate(() => {
        const title = document.getElementById('drMainTitle');
        const r = title.getBoundingClientRect();
        for (let i = 0; i < 3; i++)
            title.dispatchEvent(
                new MouseEvent('click', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 })
            );
    });
    await page.waitForTimeout(500);

    // Click Tỉnh tab
    await page.evaluate(() => document.querySelector('.dr-trasoat-tab[data-tab=province]').click());
    await page.waitForTimeout(2000);
    log('lite-expanded-province-tab', await readBtns(page));

    // Click city tab (single carrier)
    await page.evaluate(() => document.querySelector('.dr-trasoat-tab[data-tab=city]').click());
    await page.waitForTimeout(2000);
    log('lite-expanded-city-tab', await readBtns(page));

    // Click Tất cả (lite expanded — still 2 cols)
    await page.evaluate(() => document.querySelector('.dr-trasoat-tab[data-tab=all]').click());
    await page.waitForTimeout(2000);
    log('lite-expanded-all-tab', await readBtns(page));

    // Switch to phuoc (full mode)
    await page.evaluate(() => {
        const raw = localStorage.getItem('loginindex_auth');
        const data = JSON.parse(raw);
        data.userType = 'phuoc-authenticated';
        localStorage.setItem('loginindex_auth', JSON.stringify(data));
        localStorage.setItem('userType', 'phuoc-authenticated');
    });
    await page.goto(URL + '&phuoc=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.evaluate(() => document.getElementById('drBtnTraSoat').click());
    await page.waitForTimeout(3500);
    log('full-mode-all-tab', await readBtns(page));

    // Full mode zero tab
    await page.evaluate(() => document.querySelector('.dr-trasoat-tab[data-tab=zero]').click());
    await page.waitForTimeout(2000);
    log('full-mode-zero-tab', await readBtns(page));

    // Full mode province tab
    await page.evaluate(() => document.querySelector('.dr-trasoat-tab[data-tab=province]').click());
    await page.waitForTimeout(2000);
    log('full-mode-province-tab', await readBtns(page));

    // Restore admin
    await page.evaluate(() => {
        const raw = localStorage.getItem('loginindex_auth');
        const data = JSON.parse(raw);
        data.userType = 'admin-authenticated';
        localStorage.setItem('loginindex_auth', JSON.stringify(data));
        localStorage.setItem('userType', 'admin-authenticated');
    });

    await browser.close();
    console.log('=== Done ===');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
