#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Verify stats reflect table contents in delivery-report
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

    // Reveal everything first
    await page.evaluate(() => {
        const title = document.getElementById('drMainTitle');
        const r = title.getBoundingClientRect();
        for (let i = 0; i < 3; i++) {
            title.dispatchEvent(
                new MouseEvent('click', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 })
            );
        }
    });
    await page.waitForTimeout(800);

    const log = (label, data) => console.log(`[${label}]`, JSON.stringify(data));

    // Test A: outside Tra soát + revealed → table all data, stats follow
    const a = await page.evaluate(() => {
        // Count table rows by ShipStatus
        const rows = [...document.querySelectorAll('#drTableBody tr')].filter(
            (r) => !r.classList.contains('dr-empty') && !r.querySelector('.dr-loading')
        );
        // Direct state access
        const state = window.DeliveryReportState;
        const total = state ? state.allData.length : 'no-state';
        const stats = {
            cod: document.getElementById('drStatCODCount')?.textContent,
            codVal: document.getElementById('drStatCODValue')?.textContent,
            paid: document.getElementById('drStatPaidCount')?.textContent,
            ret: document.getElementById('drStatReturnCount')?.textContent,
            ship: document.getElementById('drStatShippingCount')?.textContent,
            shipVal: document.getElementById('drStatShippingValue')?.textContent,
            fail: document.getElementById('drStatFailCount')?.textContent,
        };
        return { tableRows: rows.length, dataTotal: total, stats };
    });
    log('outside-tra-soat-revealed', a);

    // Test B: enter Tra soát → combo tab (default) → 2 cols TOMATO+SHOP
    await page.evaluate(() => document.getElementById('drBtnTraSoat').click());
    await page.waitForTimeout(3500);
    const b = await page.evaluate(() => {
        const tomato = [...document.querySelectorAll('#drColTomato .dr-province-item')];
        const shop = [...document.querySelectorAll('#drColShop .dr-province-item')];
        // Filter out header/empty placeholders
        const realT = tomato.filter((el) => el.querySelector('.dr-province-num'));
        const realS = shop.filter((el) => el.querySelector('.dr-province-num'));
        const stats = {
            cod: document.getElementById('drStatCODCount')?.textContent,
            codVal: document.getElementById('drStatCODValue')?.textContent,
            ship: document.getElementById('drStatShippingCount')?.textContent,
            shipVal: document.getElementById('drStatShippingValue')?.textContent,
        };
        const scan = {
            count: document.getElementById('drScanCount')?.textContent,
            total: document.getElementById('drScanTotal')?.textContent,
        };
        return {
            comboTomatoCount: realT.length,
            comboShopCount: realS.length,
            comboTotal: realT.length + realS.length,
            stats,
            scan,
        };
    });
    log('combo-tab-counts', b);

    // Test C: switch to zero tab
    await page.evaluate(() => document.querySelector('.dr-trasoat-tab[data-tab=zero]').click());
    await page.waitForTimeout(2000);
    const c = await page.evaluate(() => {
        const tomato = [
            ...document.querySelectorAll('#drColTomato .dr-province-item .dr-province-num'),
        ];
        const shop = [
            ...document.querySelectorAll('#drColShop .dr-province-item .dr-province-num'),
        ];
        const stats = {
            cod: document.getElementById('drStatCODCount')?.textContent,
            ship: document.getElementById('drStatShippingCount')?.textContent,
        };
        const scan = {
            count: document.getElementById('drScanCount')?.textContent,
            total: document.getElementById('drScanTotal')?.textContent,
        };
        return { tomatoZeroCount: tomato.length, shopZeroCount: shop.length, stats, scan };
    });
    log('zero-tab-counts', c);

    // Test D: triple-click expand + click Thành phố tab
    await page.evaluate(() => {
        const title = document.getElementById('drMainTitle');
        const r = title.getBoundingClientRect();
        for (let i = 0; i < 3; i++) {
            title.dispatchEvent(
                new MouseEvent('click', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 })
            );
        }
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('.dr-trasoat-tab[data-tab=city]').click());
    await page.waitForTimeout(2000);
    const d = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#drTableBody tr')].filter(
            (r) => !r.classList.contains('dr-empty') && !r.querySelector('.dr-loading')
        );
        const stats = {
            cod: document.getElementById('drStatCODCount')?.textContent,
            ship: document.getElementById('drStatShippingCount')?.textContent,
            shipVal: document.getElementById('drStatShippingValue')?.textContent,
        };
        const scan = {
            count: document.getElementById('drScanCount')?.textContent,
            total: document.getElementById('drScanTotal')?.textContent,
        };
        return { tableRows: rows.length, stats, scan };
    });
    log('city-tab-counts', d);

    await browser.close();
    console.log('=== Done ===');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
