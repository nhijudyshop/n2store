#!/usr/bin/env node
// Debug: click row bằng nhiều cách để tìm cách select trigger được Download button

const fs = require('fs');
const path = require('path');
const SECRETS_FILE = path.resolve(__dirname, '..', 'serect_dont_push.txt');

(async () => {
    const { chromium } = require('playwright');
    const content = fs.readFileSync(SECRETS_FILE, 'utf8');
    const line = content.split('\n').find(l => l.includes('pbx-ucaas.oncallcx.vn') && !l.includes('PBX_HOST'));
    const after = line.replace(/^\s*\d+\/?\s*/, '').replace(/"[^"]*"\s*/, '');
    const parts = after.trim().split(/\s+/);
    const creds = { username: parts[0], password: parts.slice(1).join(' ') };

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();

    // Log tất cả POST request trong suốt click
    const posts = [];
    page.on('request', req => {
        if (req.method() === 'POST' && req.url().includes('oncallcx')) {
            posts.push({ url: req.url(), data: req.postData()?.slice(0, 300) });
        }
    });

    await page.goto('https://pbx-ucaas.oncallcx.vn/portal/login.xhtml', { waitUntil: 'networkidle' });
    await page.locator('input[type="text"]').first().fill(creds.username);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.locator('button[type="submit"], input[type="submit"]').first().click()]);
    await page.waitForTimeout(2000);

    await page.goto('https://pbx-ucaas.oncallcx.vn/portal/pbxCalls.xhtml', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Pick row có Duration > 0 (row index 11 có duration 01:49)
    // Thử 3 cách: click row, click radio, click cell
    const downloadBtn = page.locator('#content\\:calls\\:j_id_89');
    const playBtn = page.locator('#content\\:calls\\:j_id_88');

    async function checkState(label) {
        const d1 = await downloadBtn.getAttribute('disabled');
        const d2 = await playBtn.getAttribute('disabled');
        const ariaSelected = await page.evaluate(() => {
            const tr = document.querySelector('#content\\:calls\\:calls tbody tr[aria-selected=\"true\"]');
            return tr ? tr.getAttribute('data-ri') : null;
        });
        console.log(`  [${label}] download.disabled=${d1} play.disabled=${d2} selectedRow=${ariaSelected}`);
    }

    await checkState('baseline');
    posts.length = 0;

    // Cách 1: click vào <tr> trực tiếp
    const row11 = page.locator('#content\\:calls\\:calls tbody tr[data-ri="10"]').first(); // 14:22:29 dur 01:49
    console.log('\n--- Cách 1: click vào <tr> ---');
    await row11.scrollIntoViewIfNeeded();
    await row11.click({ timeout: 3000 });
    await page.waitForTimeout(1500);
    await checkState('after tr.click');
    console.log('  POSTs:'); posts.forEach(p => console.log('   ', p.url, '|', (p.data || '').slice(0, 150)));
    posts.length = 0;

    // Cách 2: click vào radio button
    console.log('\n--- Cách 2: click vào radio wrapper ---');
    const radioDiv = row11.locator('.ui-radiobutton-box').first();
    await radioDiv.click({ timeout: 3000 });
    await page.waitForTimeout(1500);
    await checkState('after radio.click');
    console.log('  POSTs:'); posts.forEach(p => console.log('   ', p.url, '|', (p.data || '').slice(0, 150)));
    posts.length = 0;

    // Cách 3: click vào cell giữa (không phải radio cell)
    console.log('\n--- Cách 3: click vào cell duration ---');
    const row8 = page.locator('#content\\:calls\\:calls tbody tr[data-ri="8"]').first();
    await row8.locator('td').nth(3).click({ timeout: 3000 }); // cell "To" column
    await page.waitForTimeout(1500);
    await checkState('after td.click');
    console.log('  POSTs:'); posts.forEach(p => console.log('   ', p.url, '|', (p.data || '').slice(0, 150)));
    posts.length = 0;

    // Cách 4: check aria-selected row, xem Download Audio có text/tooltip báo lý do disabled không
    console.log('\n--- Phân tích lý do button disabled ---');
    const btnInfo = await page.evaluate(() => {
        const btn = document.getElementById('content:calls:j_id_89');
        return {
            outer: btn?.outerHTML?.slice(0, 400),
            ariaLabel: btn?.getAttribute('aria-label'),
            title: btn?.title,
            onclick: btn?.getAttribute('onclick'),
            tooltipTarget: btn?.getAttribute('data-tooltip-target'),
        };
    });
    console.log(JSON.stringify(btnInfo, null, 2));

    // Kiểm tra: có tooltip message "No permission" / "No recording" không
    // Hover vào button xem tooltip
    console.log('\n--- Hover Download button tìm tooltip ---');
    await downloadBtn.hover({ timeout: 2000, force: true }).catch(() => {});
    await page.waitForTimeout(1000);
    const tooltipTxt = await page.evaluate(() => {
        const tip = document.querySelector('.ui-tooltip:not([style*="display: none"]), .ui-tooltip-text');
        return tip?.textContent?.trim() || null;
    });
    console.log('  Tooltip visible:', tooltipTxt);

    // Kiểm tra có phải account thiếu permission không — xem có cột recording indicator không
    // Dump table row ngay trước + sau khi radio checked
    const radioChecked = await page.evaluate(() => {
        const r = document.querySelectorAll('input[name="content:calls:calls_radio"]:checked');
        return r.length;
    });
    console.log('\n  Radio checked count:', radioChecked);

    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
