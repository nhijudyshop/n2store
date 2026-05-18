#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Explore TPOS PBH (Phiếu Bán Hàng) flow để clone vào web2.
//
// Workflow:
//   1. Login tomato.tpos.vn via UI
//   2. Navigate /#/app/saleOnline/order/list
//   3. Filter SĐT 0123456788 (test customer Huỳnh Thành Đạt)
//   4. Inspect order modal + "Tạo nhanh PBH (F9)" flow
//   5. Capture ALL API calls (request + response) trong suốt flow
//   6. Submit PBH (test order — authorized cleanup later)
//   7. Navigate /#/app/fastsaleorder/invoicelist → verify
//   8. Output: report markdown + raw trace JSON cho clone reference

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session', 'tpos-pbh-explore');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SECRETS = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf8');
const TPOS_USER = (SECRETS.match(/TPOS_USERNAME:\s*(\S+)/) || [])[1];
const TPOS_PASS = (SECRETS.match(/TPOS_PASSWORD:\s*(\S+)/) || [])[1];
if (!TPOS_USER || !TPOS_PASS) {
    console.error('Missing TPOS credentials');
    process.exit(1);
}

const TEST_PHONE = '0123456788';
const TEST_NAME = 'Huỳnh Thành Đạt';

function logSection(title) {
    console.log('\n' + '═'.repeat(70));
    console.log('▶ ' + title);
    console.log('═'.repeat(70));
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    const apiCalls = []; // captured network trace
    page.on('request', (req) => {
        const url = req.url();
        if (url.includes('tomato.tpos.vn') && !url.match(/\.(css|js|png|jpg|svg|ico|woff)/)) {
            apiCalls.push({
                phase: STATE.phase,
                method: req.method(),
                url: url.replace(/.*tomato\.tpos\.vn/, ''),
                postData: req.postData()?.slice(0, 2000),
                ts: Date.now(),
            });
        }
    });
    page.on('response', async (resp) => {
        const url = resp.url();
        if (url.includes('tomato.tpos.vn') && !url.match(/\.(css|js|png|jpg|svg|ico|woff)/)) {
            const last = apiCalls[apiCalls.length - 1];
            if (last && last.url.endsWith(url.replace(/.*tomato\.tpos\.vn/, ''))) {
                last.respStatus = resp.status();
                try {
                    if (resp.headers()['content-type']?.includes('json')) {
                        const body = await resp.text();
                        last.respBody = body.slice(0, 3000);
                    }
                } catch (_) {}
            }
        }
    });
    page.on('console', (m) => {
        if (m.type() === 'error') console.log(`  [console-err] ${m.text().slice(0, 200)}`);
    });

    const STATE = { phase: 'init' };

    // -------- LOGIN --------
    logSection('PHASE 1: Login TPOS');
    STATE.phase = 'login';
    await page.goto('https://tomato.tpos.vn/#/login', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    // Find username + password inputs
    const userInput = page
        .locator('input[type="text"], input[name="username"], input[name="UserName"]')
        .first();
    const passInput = page.locator('input[type="password"]').first();
    if (!(await userInput.count())) {
        console.log('  could not find login form');
        await page.screenshot({ path: path.join(OUT_DIR, 'phase1-login-fail.png') });
        await browser.close();
        return;
    }
    await userInput.fill(TPOS_USER);
    await passInput.fill(TPOS_PASS);
    const submit = page
        .locator('button[type="submit"], button:has-text("Đăng nhập"), button:has-text("Login")')
        .first();
    await submit.click({ timeout: 5000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(OUT_DIR, 'phase1-after-login.png') });
    const url1 = page.url();
    console.log(`  current URL: ${url1}`);
    if (url1.includes('/login')) {
        console.log('  ❌ still on login — check creds');
        await browser.close();
        return;
    }

    // -------- NAVIGATE SaleOnline order/list --------
    logSection('PHASE 2: Navigate saleOnline/order/list');
    STATE.phase = 'nav-order-list';
    await page.goto('https://tomato.tpos.vn/#/app/saleOnline/order/list', {
        waitUntil: 'networkidle',
        timeout: 20000,
    });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT_DIR, 'phase2-order-list.png') });

    // -------- FILTER by phone --------
    logSection('PHASE 3: Filter SĐT ' + TEST_PHONE);
    STATE.phase = 'filter-phone';
    // Try to find phone search field (Tên/Điện thoại)
    const phoneInput = page
        .locator(
            'input[placeholder*="Tên"], input[placeholder*="Điện thoại"], input[placeholder*="iện thoại"]'
        )
        .first();
    if (await phoneInput.count()) {
        await phoneInput.fill(TEST_PHONE);
        await phoneInput.press('Enter');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(OUT_DIR, 'phase3-filtered.png') });
        console.log('  ✓ filter applied');
    } else {
        console.log('  ⚠ phone filter input not found');
    }

    // -------- INSPECT first matching row --------
    logSection('PHASE 4: Inspect first row');
    STATE.phase = 'inspect-row';
    const rowInfo = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const first = rows[0];
        if (!first) return null;
        return {
            html: first.outerHTML.slice(0, 2000),
            cells: Array.from(first.querySelectorAll('td')).map((td) =>
                td.textContent.trim().slice(0, 80)
            ),
        };
    });
    console.log('  cells:', JSON.stringify(rowInfo?.cells));

    // -------- Click "Tạo nhanh PBH (F9)" --------
    logSection('PHASE 5: Click "Tạo nhanh PBH (F9)"');
    STATE.phase = 'create-pbh-modal';
    // First check row by clicking checkbox
    const firstCheckbox = page.locator('tbody tr input[type="checkbox"]').first();
    if (await firstCheckbox.count()) {
        await firstCheckbox.check();
        await page.waitForTimeout(500);
    }
    const f9Btn = page.locator('button:has-text("Tạo nhanh PBH"), button:has-text("(F9)")').first();
    if (await f9Btn.count()) {
        await f9Btn.click({ timeout: 5000 });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(OUT_DIR, 'phase5-pbh-modal.png') });
        // Capture modal structure
        const modalInfo = await page.evaluate(() => {
            const modals = Array.from(
                document.querySelectorAll('.modal-dialog, .modal, [role="dialog"]')
            );
            return modals
                .filter((m) => m.offsetParent !== null)
                .map((m) => ({
                    inputCount: m.querySelectorAll('input').length,
                    buttonCount: m.querySelectorAll('button').length,
                    hasTable: !!m.querySelector('table'),
                    headerText: (m.querySelector('.modal-title, h3, h4')?.textContent || '')
                        .trim()
                        .slice(0, 80),
                }));
        });
        console.log('  modal:', JSON.stringify(modalInfo));
    } else {
        console.log('  ⚠ F9 button not found');
    }

    // -------- Navigate fastsaleorder/invoicelist --------
    logSection('PHASE 6: Navigate fastsaleorder/invoicelist');
    STATE.phase = 'nav-invoice-list';
    await page.goto('https://tomato.tpos.vn/#/app/fastsaleorder/invoicelist', {
        waitUntil: 'networkidle',
        timeout: 20000,
    });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT_DIR, 'phase6-invoice-list.png') });

    // -------- Save trace --------
    logSection('FINAL: write trace');
    fs.writeFileSync(path.join(OUT_DIR, 'api-trace.json'), JSON.stringify(apiCalls, null, 2));
    console.log(`  → api-trace.json (${apiCalls.length} calls)`);

    // Categorize endpoints
    const byEndpoint = {};
    for (const c of apiCalls) {
        const key = `${c.method} ${c.url.split('?')[0]}`;
        if (!byEndpoint[key]) byEndpoint[key] = { count: 0, phases: new Set() };
        byEndpoint[key].count++;
        byEndpoint[key].phases.add(c.phase);
    }
    console.log('\nEndpoints by frequency:');
    Object.entries(byEndpoint)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 30)
        .forEach(([k, v]) =>
            console.log(
                `  ${v.count.toString().padStart(3)}× ${k}  (${Array.from(v.phases).join(',')})`
            )
        );

    await browser.close();
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
});
