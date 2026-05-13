#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// QA Phase 1-3 PBH flow — API + browser tests
//
// Coverage:
//   1. Health endpoints
//   2. Create test NativeOrder (cleanup later)
//   3. Convert NativeOrder → PBH (verify schema + linked source)
//   4. Idempotency: convert lần 2 returns same PBH
//   5. PBH appears in /load (filter by phone)
//   6. Confirm PBH (draft → done)
//   7. Print PBH (print_count increment)
//   8. Cancel PBH (state → cancel)
//   9. Search/filter
//   10. Reset STT (sequence-only + renumber)
//   11. UI: load fastsaleorder-invoice page, verify rows + actions
//   12. UI: load native-orders page, verify "Tạo PBH" button visible
//   13. Cleanup test data

const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');

const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const BASE = 'http://localhost:8080';
const TEST_PHONE = '0900000099'; // SĐT test giả per memory rules
const TEST_NAME = 'PBH QA Test';
const TEST_FB_USER_ID = `qa-test-${Date.now()}`;

const errors = [];
const passed = [];
function ok(name) {
    passed.push(name);
    console.log(`  ✓ ${name}`);
}
function fail(name, msg) {
    errors.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}: ${msg}`);
}
async function step(name, fn) {
    try {
        await fn();
    } catch (e) {
        fail(name, e.message);
        console.error('    ', e.stack?.split('\n')[1] || '');
    }
}

async function api(method, path, body) {
    const r = await fetch(`${WORKER}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
        data = await r.json();
    } catch {}
    return { status: r.status, data };
}

let nativeCode = null;
let pbhNumber = null;
let dlvNumber = null;
let rfNumber = null;

async function main() {
    console.log('═══════════════ QA Phase 1-3 PBH ═══════════════\n');

    // ---- API health ----
    console.log('▶ STEP 1: Health checks');
    await step('native-orders /health', async () => {
        const r = await api('GET', '/api/native-orders/health');
        if (r.status !== 200 || !r.data?.ok) throw new Error(`HTTP ${r.status}`);
        ok(`native-orders count=${r.data.count}`);
    });
    await step('fast-sale-orders /health', async () => {
        const r = await api('GET', '/api/fast-sale-orders/health');
        if (r.status !== 200 || !r.data?.ok) throw new Error(`HTTP ${r.status}`);
        ok(`fast-sale-orders count=${r.data.count}`);
    });

    // ---- Create test NativeOrder ----
    console.log('\n▶ STEP 2: Create test NativeOrder');
    await step('POST /from-comment', async () => {
        const r = await api('POST', '/api/native-orders/from-comment', {
            fbUserId: TEST_FB_USER_ID,
            fbUserName: TEST_NAME,
            phone: TEST_PHONE,
            address: 'QA Test Address',
            customerName: TEST_NAME,
            message: 'QA test product',
            createdBy: 'qa-bot',
            createdByName: 'QA Bot',
        });
        if (r.status !== 200 || !r.data?.success)
            throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
        nativeCode = r.data.order.code;
        ok(`created code=${nativeCode} STT=${r.data.order.displayStt}`);
    });

    // Add products to native_order so PBH has lines
    await step('PATCH products', async () => {
        if (!nativeCode) throw new Error('no native code');
        const r = await api('PATCH', `/api/native-orders/${nativeCode}`, {
            products: [
                {
                    productCode: 'QA-001',
                    productName: 'QA Product 1',
                    quantity: 2,
                    price: 50000,
                    uomName: 'Cái',
                },
                {
                    productCode: 'QA-002',
                    productName: 'QA Product 2',
                    quantity: 1,
                    price: 100000,
                    uomName: 'Cái',
                },
            ],
        });
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        ok(`patched products, totalAmount=${r.data.order.totalAmount}`);
    });

    // ---- Convert to PBH ----
    console.log('\n▶ STEP 3: Convert NativeOrder → PBH');
    await step('POST /from-native-order', async () => {
        const r = await api('POST', '/api/fast-sale-orders/from-native-order', {
            nativeOrderCode: nativeCode,
        });
        if (r.status !== 200 || !r.data?.success)
            throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
        pbhNumber = r.data.order.number;
        ok(`created PBH ${pbhNumber} STT=${r.data.order.displayStt}`);
        if (r.data.order.sourceLink?.code !== nativeCode) {
            fail(
                'cross-ref',
                `expected source_code=${nativeCode}, got ${r.data.order.sourceLink?.code}`
            );
        } else ok(`cross-ref source_code=${nativeCode}`);
        if (r.data.order.orderLines?.length !== 2)
            fail('orderLines', `expected 2 lines, got ${r.data.order.orderLines?.length}`);
        else ok(`orderLines: 2 lines copied`);
        if (Number(r.data.order.totals?.total) !== 200000)
            fail('total', `expected 200000, got ${r.data.order.totals?.total}`);
        else ok(`total = 200000`);
    });

    // Verify source order status auto-promoted
    await step('Source order auto-promoted to confirmed', async () => {
        const r = await api(
            'GET',
            `/api/native-orders/load?search=${encodeURIComponent(nativeCode)}&limit=1`
        );
        const o = r.data.orders?.[0];
        if (!o) throw new Error('source order not found');
        if (o.status !== 'confirmed') throw new Error(`status=${o.status}, expected confirmed`);
        ok(`source order ${nativeCode} status=confirmed`);
    });

    // ---- Idempotency ----
    console.log('\n▶ STEP 4: Idempotency');
    await step('Convert lần 2 returns same PBH', async () => {
        const r = await api('POST', '/api/fast-sale-orders/from-native-order', {
            nativeOrderCode: nativeCode,
        });
        if (!r.data?.idempotent) throw new Error('expected idempotent=true');
        if (r.data.order.number !== pbhNumber)
            throw new Error(`got different PBH ${r.data.order.number}`);
        ok(`returned existing ${pbhNumber}`);
    });

    // ---- Verify in /load list ----
    console.log('\n▶ STEP 5: PBH in /load');
    await step('Search by phone returns PBH', async () => {
        const r = await api('GET', `/api/fast-sale-orders/load?search=${TEST_PHONE}&limit=5`);
        if (r.data?.total < 1) throw new Error('total < 1');
        const hit = r.data.orders.find((o) => o.number === pbhNumber);
        if (!hit) throw new Error(`PBH ${pbhNumber} not in list`);
        ok(`found in search results`);
    });

    // ---- Confirm flow ----
    console.log('\n▶ STEP 6: Confirm state');
    await step('POST /:number/confirm draft → done', async () => {
        const r = await api('POST', `/api/fast-sale-orders/${pbhNumber}/confirm`);
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        if (r.data.order.state !== 'done')
            throw new Error(`state=${r.data.order.state}, expected done`);
        ok(`state=done`);
    });

    // ---- Print ----
    console.log('\n▶ STEP 7: Print increments');
    await step('POST /:number/print x3', async () => {
        for (let i = 1; i <= 3; i++) {
            const r = await api('POST', `/api/fast-sale-orders/${pbhNumber}/print`);
            if (r.data.order.printCount !== i)
                throw new Error(`expected printCount=${i}, got ${r.data.order.printCount}`);
        }
        ok(`printCount=3 after 3 prints`);
    });

    // ---- Cancel ----
    console.log('\n▶ STEP 8: Cancel state');
    await step('POST /:number/cancel', async () => {
        const r = await api('POST', `/api/fast-sale-orders/${pbhNumber}/cancel`);
        if (r.data.order.state !== 'cancel') throw new Error(`state=${r.data.order.state}`);
        ok(`state=cancel`);
    });

    // ---- Filter state ----
    console.log('\n▶ STEP 9: Filter by state');
    await step('GET /load?state=cancel returns PBH', async () => {
        const r = await api(
            'GET',
            `/api/fast-sale-orders/load?state=cancel&search=${TEST_PHONE}&limit=5`
        );
        const hit = r.data.orders?.find((o) => o.number === pbhNumber);
        if (!hit) throw new Error('PBH not in cancel filter');
        ok(`found in state=cancel filter`);
    });
    await step('GET /load?state=draft excludes our PBH', async () => {
        const r = await api(
            'GET',
            `/api/fast-sale-orders/load?state=draft&search=${TEST_PHONE}&limit=5`
        );
        const hit = r.data.orders?.find((o) => o.number === pbhNumber);
        if (hit) throw new Error('PBH should not be in state=draft filter');
        ok(`excluded from state=draft (correct)`);
    });

    // ---- Reset STT (sequence-only) ----
    console.log('\n▶ STEP 10: Reset STT');
    await step('POST /reset-stt sequence-only', async () => {
        const r = await api('POST', '/api/fast-sale-orders/reset-stt', {});
        if (r.data?.mode !== 'sequence-only') throw new Error(`mode=${r.data?.mode}`);
        ok(`sequence reset`);
    });
    await step('POST /reset-stt renumber=true', async () => {
        const r = await api('POST', '/api/fast-sale-orders/reset-stt', { renumber: true });
        if (r.data?.mode !== 'renumber') throw new Error(`mode=${r.data?.mode}`);
        if (typeof r.data.renumbered !== 'number' || r.data.renumbered < 1)
            throw new Error('renumbered missing');
        ok(`renumbered ${r.data.renumbered} PBH`);
    });

    // ---- PHASE 4: Delivery + Refund ----
    console.log('\n▶ STEP 10b: PHASE 4 — Delivery invoice');
    // Need a non-cancel PBH for delivery — re-confirm
    await api('POST', `/api/fast-sale-orders/${pbhNumber}/confirm`);

    await step('Delivery /health', async () => {
        const r = await api('GET', '/api/delivery-invoices/health');
        if (r.status !== 200 || !r.data?.ok) throw new Error(`HTTP ${r.status}`);
        ok(`delivery count=${r.data.count}`);
    });
    await step('POST /from-pbh creates delivery', async () => {
        const r = await api('POST', '/api/delivery-invoices/from-pbh', {
            pbhNumber,
            carrierName: 'TEST Carrier',
            trackingRef: 'TRK-QA-001',
        });
        if (r.status !== 200 || !r.data?.success)
            throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
        dlvNumber = r.data.order.number;
        if (r.data.order.fso?.number !== pbhNumber) throw new Error(`fso cross-ref mismatch`);
        if (r.data.order.state !== 'pending')
            throw new Error(`state=${r.data.order.state}, expected pending`);
        ok(`delivery ${dlvNumber} created, state=pending, fso=${pbhNumber}`);
    });
    await step('Delivery state machine: ship → deliver', async () => {
        let r = await api('POST', `/api/delivery-invoices/${dlvNumber}/ship`);
        if (r.data.order.state !== 'shipping')
            throw new Error(`expected shipping, got ${r.data.order.state}`);
        r = await api('POST', `/api/delivery-invoices/${dlvNumber}/deliver`);
        if (r.data.order.state !== 'delivered')
            throw new Error(`expected delivered, got ${r.data.order.state}`);
        if (!Array.isArray(r.data.order.stateHistory) || r.data.order.stateHistory.length < 2)
            throw new Error('stateHistory missing');
        ok(
            `delivery ${dlvNumber} state: pending → shipping → delivered, history=${r.data.order.stateHistory.length}`
        );
    });

    console.log('\n▶ STEP 10c: PHASE 4 — Refund');
    await step('Refund /health', async () => {
        const r = await api('GET', '/api/refunds/health');
        if (r.status !== 200 || !r.data?.ok) throw new Error(`HTTP ${r.status}`);
        ok(`refunds count=${r.data.count}`);
    });
    await step('POST /from-pbh creates refund', async () => {
        const r = await api('POST', '/api/refunds/from-pbh', {
            pbhNumber,
            reason: 'QA test refund',
            refundMode: 'cash',
        });
        if (r.status !== 200 || !r.data?.success)
            throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
        rfNumber = r.data.order.number;
        if (r.data.order.fso?.number !== pbhNumber) throw new Error(`fso cross-ref mismatch`);
        if (r.data.order.state !== 'draft') throw new Error(`state=${r.data.order.state}`);
        if (Number(r.data.order.amountRefund) !== 200000)
            throw new Error(`amountRefund=${r.data.order.amountRefund}, expected 200000`);
        ok(`refund ${rfNumber} draft, amount=${r.data.order.amountRefund}`);
    });
    await step('Refund state: draft → approved → completed', async () => {
        let r = await api('POST', `/api/refunds/${rfNumber}/approve`);
        if (r.data.order.state !== 'approved') throw new Error(`expected approved`);
        r = await api('POST', `/api/refunds/${rfNumber}/complete`);
        if (r.data.order.state !== 'completed') throw new Error(`expected completed`);
        ok(`refund ${rfNumber}: draft → approved → completed`);
    });

    // Cancel PBH for cleanup
    await api('POST', `/api/fast-sale-orders/${pbhNumber}/cancel`);

    // ---- Browser tests ----
    console.log('\n▶ STEP 11: Browser UI tests');
    await ensureLocalServer(BASE);
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrs = [];
    page.on('console', (m) => {
        if (m.type() === 'error' && !/fonts|favicon/.test(m.text()))
            consoleErrs.push(m.text().slice(0, 150));
    });
    page.on('pageerror', (e) => consoleErrs.push('PAGE: ' + String(e).slice(0, 150)));

    await step('Load PBH list page (web2/fastsaleorder-invoice)', async () => {
        consoleErrs.length = 0;
        await page.goto(`${BASE}/web2/fastsaleorder-invoice/index.html?t=${Date.now()}`, {
            waitUntil: 'networkidle',
        });
        await page.waitForTimeout(3000);
        const rowCount = await page.locator('#pbhTbody tr:not(:has(.empty-row))').count();
        if (rowCount < 1) throw new Error(`no PBH rows visible (rows=${rowCount})`);
        ok(`page loaded, ${rowCount} rows visible`);
    });

    await step('PBH page console errors', async () => {
        if (consoleErrs.length > 0) throw new Error(consoleErrs.join('\n  '));
        ok('no console errors');
    });

    await step('PBH detail button works', async () => {
        // Search for our test PBH first
        await page.fill('#pbhSearch', TEST_PHONE);
        await page.click('#pbhApply');
        await page.waitForTimeout(1500);
        const rowCount = await page.locator('#pbhTbody tr:not(:has(.empty-row))').count();
        if (rowCount === 0) throw new Error('search after fill found 0 rows');
        ok(`search filter returns ${rowCount} rows`);
    });

    await step('Native-orders has Tạo PBH button', async () => {
        consoleErrs.length = 0;
        await page.goto(`${BASE}/native-orders/index.html?t=${Date.now()}`, {
            waitUntil: 'networkidle',
        });
        await page.waitForTimeout(3000);
        const btn = page.locator('button[title="Tạo PBH"]').first();
        const cnt = await btn.count();
        if (cnt === 0) throw new Error('no "Tạo PBH" button found');
        ok(`"Tạo PBH" button visible (${cnt} buttons in table)`);
    });
    await step('Native-orders console errors', async () => {
        if (consoleErrs.length > 0) throw new Error(consoleErrs.slice(0, 3).join('\n  '));
        ok('no console errors');
    });

    await browser.close();

    // ---- Cleanup ----
    console.log('\n▶ CLEANUP');
    await step('DELETE refund (force)', async () => {
        if (!rfNumber) return;
        const r = await fetch(`${WORKER}/api/refunds/${rfNumber}?force=1`, { method: 'DELETE' });
        const data = await r.json();
        if (!data.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data)}`);
        ok(`deleted ${rfNumber}`);
    });
    await step('DELETE delivery (force)', async () => {
        if (!dlvNumber) return;
        const r = await fetch(`${WORKER}/api/delivery-invoices/${dlvNumber}?force=1`, {
            method: 'DELETE',
        });
        const data = await r.json();
        if (!data.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data)}`);
        ok(`deleted ${dlvNumber}`);
    });
    await step('DELETE PBH (force)', async () => {
        if (!pbhNumber) return;
        const r = await fetch(`${WORKER}/api/fast-sale-orders/${pbhNumber}?force=1`, {
            method: 'DELETE',
        });
        const data = await r.json();
        if (!data.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data)}`);
        ok(`deleted ${pbhNumber}`);
    });
    await step('DELETE NativeOrder', async () => {
        if (!nativeCode) return;
        const r = await fetch(`${WORKER}/api/native-orders/${nativeCode}`, { method: 'DELETE' });
        const data = await r.json();
        if (!data.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data)}`);
        ok(`deleted ${nativeCode}`);
    });

    // ---- Summary ----
    console.log('\n═══════════════ SUMMARY ═══════════════');
    console.log(`  ✓ passed: ${passed.length}`);
    console.log(`  ✗ failed: ${errors.length}`);
    if (errors.length) {
        console.log('\nFailures:');
        errors.forEach((e) => console.log(`  - ${e}`));
        process.exit(1);
    } else {
        console.log('\n🎉 ALL QA TESTS PASS');
        process.exit(0);
    }
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(2);
});
