#!/usr/bin/env node
// Standalone Playwright test for delivery-report lite-hide + triple-click reveal
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SECRET_FILE = '/Users/mac/Desktop/n2store/serect_dont_push.txt';
const BASE = 'http://localhost:8080';
const URL = `${BASE}/delivery-report/index.html?t=${Date.now()}`;

function restoreSession(host) {
    const txt = fs.readFileSync(SECRET_FILE, 'utf8');
    const marker = `## n2store_session_${host}`;
    const idx = txt.indexOf(marker);
    if (idx < 0) throw new Error(`No session block for ${host}`);
    const end = txt.indexOf('\n## ', idx + marker.length);
    const block = txt.slice(idx, end > 0 ? end : undefined);
    // Find the JSON payload line (starts with {"origin":)
    const jsonLine = block.split('\n').find((l) => l.trim().startsWith('{"origin":'));
    if (!jsonLine) throw new Error(`No JSON payload in block for ${host}`);
    const data = JSON.parse(jsonLine);
    return {
        localStorage: data.localStorage || {},
        sessionStorage: data.sessionStorage || {},
        cookies: data.cookies || [],
    };
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const session = restoreSession('localhost_8080');
    const ctx = await browser.newContext({
        storageState: { cookies: session.cookies, origins: [] },
    });
    const page = await ctx.newPage();

    const results = [];
    const log = (step, data) => {
        console.log(`[${step}]`, JSON.stringify(data));
        results.push({ step, data });
    };

    // Seed localStorage ONCE after first nav (instead of addInitScript which re-runs each nav)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((ls) => {
        for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    }, session.localStorage);

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Test 1: default hide (table + filter + stats + cancel + status)
    const t1 = await page.evaluate(() => {
        const ids = [
            'drFilterSection',
            'drStatsBar',
            'drTableWrapper',
            'drCancelSection',
            'drAssignmentStatus',
        ];
        return ids.map((id) => {
            const el = document.getElementById(id);
            return { id, display: el?.style.display, visible: el?.offsetParent !== null };
        });
    });
    log('lite-default-hide', t1);

    // Test 2: triple-click reveal
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
    const t2 = await page.evaluate(() => {
        const ids = ['drTableWrapper', 'drCancelSection', 'drAssignmentStatus'];
        return ids.map((id) => {
            const el = document.getElementById(id);
            return { id, display: el?.style.display, visible: el?.offsetParent !== null };
        });
    });
    log('after-triple-click-reveal', t2);

    // Test 3: refresh → hidden again
    await page.goto(URL + '&refresh=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const t3 = await page.evaluate(() => {
        const ids = ['drTableWrapper', 'drCancelSection', 'drAssignmentStatus'];
        return ids.map((id) => {
            const el = document.getElementById(id);
            return { id, display: el?.style.display, visible: el?.offsetParent !== null };
        });
    });
    log('after-refresh-hidden-again', t3);

    // Test 4: click Tra soát from hidden → enter scan mode (tabs + province view show)
    await page.evaluate(() => document.getElementById('drBtnTraSoat').click());
    await page.waitForTimeout(3500);
    const t4 = await page.evaluate(() => {
        const bar = document.getElementById('drTraSoatBar');
        const provinceView = document.getElementById('drProvinceView');
        const tabs = [...document.querySelectorAll('.dr-trasoat-tab')]
            .filter((b) => b.style.display !== 'none')
            .map((b) => b.dataset.tab);
        const activeTab = document.querySelector('.dr-trasoat-tab.active')?.dataset.tab;
        return {
            barVisible: bar?.style.display !== 'none',
            provinceVisible: provinceView?.style.display !== 'none',
            tabs,
            activeTab,
        };
    });
    log('tra-soat-entered-from-hidden', t4);

    // Test 5: exit Tra soát → should hide again (since liteRevealed stayed false)
    await page.evaluate(() => document.getElementById('drBtnTraSoat').click());
    await page.waitForTimeout(2500);
    const t5 = await page.evaluate(() => {
        const ids = ['drTableWrapper', 'drCancelSection', 'drAssignmentStatus'];
        return ids.map((id) => {
            const el = document.getElementById(id);
            return { id, display: el?.style.display, visible: el?.offsetParent !== null };
        });
    });
    log('after-exit-tra-soat-still-hidden', t5);

    // Test 6: triple-click → reveal, then Tra soát → exit → should stay revealed
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
    await page.evaluate(() => document.getElementById('drBtnTraSoat').click());
    await page.waitForTimeout(3500);
    await page.evaluate(() => document.getElementById('drBtnTraSoat').click());
    await page.waitForTimeout(2500);
    const t6 = await page.evaluate(() => {
        const ids = ['drTableWrapper', 'drCancelSection', 'drAssignmentStatus'];
        return ids.map((id) => {
            const el = document.getElementById(id);
            return { id, display: el?.style.display, visible: el?.offsetParent !== null };
        });
    });
    log('reveal-then-tra-soat-cycle', t6);

    // Test 7: switch to phuoc-authenticated → should never hide
    await page.evaluate(() => {
        const raw = localStorage.getItem('loginindex_auth');
        const data = JSON.parse(raw);
        data.userType = 'phuoc-authenticated';
        localStorage.setItem('loginindex_auth', JSON.stringify(data));
        localStorage.setItem('userType', 'phuoc-authenticated');
    });
    await page.goto(URL + '&phuoc=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const t7 = await page.evaluate(() => {
        const ids = ['drTableWrapper', 'drCancelSection', 'drAssignmentStatus'];
        const inner = JSON.parse(localStorage.getItem('loginindex_auth') || '{}');
        const detectedMode = window.authManager?.getUserInfo?.()?.userType;
        return {
            visibility: ids.map((id) => {
                const el = document.getElementById(id);
                return { id, display: el?.style.display, visible: el?.offsetParent !== null };
            }),
            innerUserType: inner.userType,
            topUserType: localStorage.getItem('userType'),
            detectedFromAuth: detectedMode,
        };
    });
    log('phuoc-full-no-hide', t7);

    // Restore admin
    await page.evaluate(() => {
        const raw = localStorage.getItem('loginindex_auth');
        const data = JSON.parse(raw);
        data.userType = 'admin-authenticated';
        localStorage.setItem('loginindex_auth', JSON.stringify(data));
    });

    // Save screenshot of final state
    await page.goto(URL + '&final=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.screenshot({
        path: 'downloads/n2store-session/dr-lite-hide-default.png',
        fullPage: false,
    });

    await browser.close();
    fs.writeFileSync('/tmp/dr-test-results.json', JSON.stringify(results, null, 2));
    console.log('=== Done ===');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
