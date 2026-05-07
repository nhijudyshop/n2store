#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Test "Xem bill" eye-click flow on a transaction with NJD invoice reference.
//
// Bug fixed: previously, when a customer-activity tx note contains "NJD/2026/65765",
// pickTxEvidence returned {kind:'ticket', value:'NJD/...'} ⇒ ticket-history-viewer
// then queried /v2/tickets/search for an issue-tracking ticket linked to that NJD,
// found nothing ⇒ "Lỗi: Không tìm thấy phiếu cho đơn NJD/...".
// Fix: NJD references now resolve to kind:'invoice' which opens the row modal,
// resolving the FastSaleOrder Id via TPOS OData (matches TPOS Số HĐ search behaviour),
// then renders the bill via the orders-report custom template.

const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8080';

(async () => {
    const errors = [];
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    ctx.route('**/*.js', (r) => {
        const headers = { ...r.request().headers(), 'cache-control': 'no-cache' };
        r.continue({ headers });
    });
    const page = await ctx.newPage();

    page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            const t = msg.text();
            if (!/ERR_CONNECTION_REFUSED|MenuLayout|Failed to load resource/i.test(t)) {
                errors.push(`[console.error] ${t.slice(0, 250)}`);
            }
        }
    });
    page.on('dialog', async (d) => await d.accept().catch(() => {}));

    // Login + nav
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="user"], input[type="text"], #username', 'admin').catch(() => {});
    await page.fill('input[type="password"]', 'admin@@').catch(() => {});
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.goto(`${BASE}/delivery-report/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page
        .waitForFunction(() => !!window.DeliveryReport && typeof XLSX !== 'undefined', {
            timeout: 20_000,
        })
        .catch(() => {});
    await page.waitForTimeout(1500);

    const assertions = [];

    // TEST A: clicking a customer-cell opens the row modal whose activity column
    // renders eye buttons. NJD references must use kind=invoice (was kind=ticket → bug).
    console.log('\n=== TEST A: NJD eye-button uses data-invoice ===');
    const testA = await page.evaluate(async () => {
        const origFetch = window.fetch;
        window.fetch = async function (url, opts) {
            const u = String(url);
            if (/\/api\/v2\/customers\/.+\/quick-view/.test(u)) {
                return new Response(
                    JSON.stringify({
                        data: {
                            customer: {
                                name: 'Khách Test',
                                phone: '0900000000',
                                tier: 'normal',
                                status: 'normal',
                            },
                            wallet: { balance: 0, virtual_balance: 0 },
                            stats: {
                                total_orders: 0,
                                total_spent: 0,
                                pending_count: 0,
                                pending_total: 0,
                            },
                            recent_transactions: [
                                {
                                    type: 'WITHDRAW',
                                    amount: -1563000,
                                    note: 'Thanh toán công nợ qua COD đơn hàng #NJD/2026/65765 — Trả từ ví: 1.563.000đ',
                                    source: 'COD',
                                    reference_id: 'cod-1',
                                    created_at: '2026-05-06T05:36:00Z',
                                },
                                {
                                    type: 'DEPOSIT',
                                    amount: 1563000,
                                    note: 'Nạp từ CK (Duyệt bởi My)',
                                    source: 'BANK_TRANSFER',
                                    reference_id: 'dep-1',
                                    sepay_image_url: '',
                                    created_at: '2026-05-05T04:27:00Z',
                                },
                                {
                                    type: 'WITHDRAW',
                                    amount: -10000,
                                    note: 'Phiếu xử lý TV-2026-00578 — boom',
                                    source: 'TICKET',
                                    reference_id: 'tv-1',
                                    created_at: '2026-05-04T04:27:00Z',
                                },
                            ],
                            pending_transactions: [],
                        },
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            // Block the bill fetch so it doesn't error/clutter (we test bill flow in TEST B)
            if (
                /\/api\/fastsaleorder\/print1/.test(u) ||
                /\/api\/odata\/FastSaleOrder\(123\)/.test(u)
            ) {
                return new Response('{}', {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return origFetch.call(this, url, opts);
        };

        // Inject a synthetic row into drTableWrapper so the delegated click hits.
        const wrap = document.getElementById('drTableWrapper') || document.body;
        const fake = document.createElement('table');
        fake.innerHTML = `<tr id="__test_row__">
            <td class="dr-hover-bill" data-id="123" data-number="NJD/2026/9999">NJD/2026/9999</td>
            <td class="dr-hover-customer" data-phone="0900000000"><span class="dr-customer-name">Khách Test</span></td>
        </tr>`;
        wrap.appendChild(fake);
        const custCell = fake.querySelector('.dr-hover-customer');
        custCell.click();
        return { fired: true };
    });
    console.log('  setup:', JSON.stringify(testA));

    // Wait for activity render
    await page.waitForTimeout(2500);

    const buttons = await page.evaluate(() => {
        const eyes = document.querySelectorAll('#dr-row-activity .dr-hp-eye-btn');
        return Array.from(eyes).map((b) => ({
            kind: b.getAttribute('data-eye-kind'),
            invoice: b.getAttribute('data-invoice'),
            ticket: b.getAttribute('data-ticket'),
            img: b.getAttribute('data-img'),
            title: b.getAttribute('title'),
        }));
    });
    console.log('  rendered eye buttons:', JSON.stringify(buttons, null, 2));

    const njdBtn = buttons.find((b) => b.invoice === 'NJD/2026/65765');
    const tvBtn = buttons.find((b) => b.ticket === 'TV-2026-00578');
    if (njdBtn) {
        if (njdBtn.kind === 'invoice')
            assertions.push('PASS: NJD reference uses kind=invoice (was ticket → bug)');
        else assertions.push(`FAIL: NJD reference kind=${njdBtn.kind}, expected invoice`);
        if (njdBtn.title && njdBtn.title.includes('Xem bill'))
            assertions.push('PASS: NJD button title says "Xem bill"');
        else assertions.push(`FAIL: NJD button title="${njdBtn.title}", expected "Xem bill ..."`);
    } else {
        assertions.push('FAIL: NJD eye button not rendered');
    }
    if (tvBtn) {
        if (tvBtn.kind === 'ticket') assertions.push('PASS: TV-* reference still uses kind=ticket');
        else assertions.push(`FAIL: TV-* reference kind=${tvBtn.kind}, expected ticket`);
    } else {
        assertions.push('FAIL: TV eye button not rendered');
    }

    // TEST B: clicking NJD eye → openInvoiceBillModal → resolves Id via OData.
    console.log('\n=== TEST B: click NJD eye → resolves Id via OData → opens row modal ===');
    const testB = await page.evaluate(async () => {
        // Stub window.fetch to:
        //   - Return a fake FastSaleOrder OData GetView for resolveInvoiceIdByNumber
        //   - Return a fake FastSaleOrder($id)?$expand=OrderLines for fetchOrderDetail
        const origFetch = window.fetch;
        let getViewCalls = 0;
        let detailCalls = 0;
        let getViewFilter = '';
        window.fetch = async function (url, opts) {
            const u = String(url);
            if (/FastSaleOrder\/ODataService\.GetView/i.test(u)) {
                getViewCalls++;
                const match = u.match(/\$filter=([^&]*)/);
                if (match) getViewFilter = decodeURIComponent(match[1]);
                return new Response(
                    JSON.stringify({
                        value: [
                            {
                                Id: 99999,
                                Number: 'NJD/2026/65765',
                                DateInvoice: '2026-05-06T19:36:00Z',
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            if (/\/api\/odata\/FastSaleOrder\(99999\)/.test(u)) {
                detailCalls++;
                return new Response(
                    JSON.stringify({
                        Number: 'NJD/2026/65765',
                        DateInvoice: '2026-05-06T19:36:00Z',
                        Partner: { Name: 'Ánh Hồng', Phone: '0939054771', Street: 'Đồng Tháp' },
                        User: { Name: 'Lài' },
                        CarrierName: 'SHIP TỈNH',
                        DeliveryPrice: 35000,
                        OrderLines: [
                            {
                                ProductName: '[Q276D] 2104 Q4 ÁO SN XOẮN EO 1717 (Đen)',
                                ProductNameGet: '[Q276D] 2104 Q4 ÁO SN XOẮN EO 1717 (Đen)',
                                Quantity: 1,
                                PriceUnit: 290000,
                                ProductUOMName: 'Cái',
                                Note: 'live',
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            return origFetch.call(this, url, opts);
        };

        // Click the NJD eye button
        const btn = document.querySelector('.dr-hp-eye-btn[data-eye-kind="invoice"]');
        if (!btn) return { err: 'no NJD eye button' };
        btn.click();
        // Wait for modal + render
        await new Promise((r) => setTimeout(r, 2000));

        const modal = document.getElementById('dr-row-modal');
        const titleText = modal?.querySelector('#dr-row-title')?.textContent || '';
        const billCol = modal?.querySelector('#dr-row-bill');
        const ifr = billCol?.querySelector('iframe');
        const billHtml = ifr?.srcdoc || '';

        // Restore fetch
        window.fetch = origFetch;

        return {
            getViewCalls,
            getViewFilter,
            detailCalls,
            modalVisible: modal?.style.display === 'flex',
            titleText,
            billHasNumber: billHtml.includes('NJD/2026/65765'),
            billHasCustomer: billHtml.includes('Ánh Hồng'),
            billHasProduct: billHtml.includes('Q276D'),
        };
    });
    console.log('  result:', JSON.stringify(testB, null, 2));
    if (testB.err) assertions.push(`FAIL: ${testB.err}`);
    else {
        if (testB.getViewCalls === 1)
            assertions.push('PASS: GetView OData was called once to resolve Id from Number');
        else assertions.push(`FAIL: GetView called ${testB.getViewCalls} times, expected 1`);

        if (testB.getViewFilter && testB.getViewFilter.includes('NJD/2026/65765'))
            assertions.push('PASS: GetView filter contains the Number');
        else assertions.push(`FAIL: GetView filter="${testB.getViewFilter}"`);

        if (testB.detailCalls === 1)
            assertions.push('PASS: FastSaleOrder($id) detail was called once');
        else assertions.push(`FAIL: detail called ${testB.detailCalls} times`);

        if (testB.modalVisible) assertions.push('PASS: row modal opened');
        else assertions.push('FAIL: row modal did not open');

        if (testB.titleText.includes('NJD/2026/65765'))
            assertions.push('PASS: modal title shows the NJD number');
        else assertions.push(`FAIL: modal title="${testB.titleText}"`);

        if (testB.billHasNumber && testB.billHasCustomer && testB.billHasProduct)
            assertions.push('PASS: bill rendered with custom template (number, customer, product)');
        else
            assertions.push(
                `FAIL: bill content missing (num=${testB.billHasNumber} cust=${testB.billHasCustomer} prod=${testB.billHasProduct})`
            );
    }

    // TEST C: when GetView returns empty value, modal shows friendly "Không tìm thấy" error
    console.log('\n=== TEST C: empty GetView result → friendly error ===');
    const testC = await page.evaluate(async () => {
        // Reset modal
        const modal = document.getElementById('dr-row-modal');
        if (modal) modal.style.display = 'none';

        const origFetch = window.fetch;
        window.fetch = async function (url, opts) {
            const u = String(url);
            if (/FastSaleOrder\/ODataService\.GetView/i.test(u)) {
                return new Response(JSON.stringify({ value: [] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return origFetch.call(this, url, opts);
        };

        // Add a fresh NJD button with a different number so we can drive it.
        // (re-use existing in popover wouldn't work — already wired)
        // Simulate by directly invoking openInvoiceBillModal via scope is impossible.
        // Instead, click the existing NJD button which will hit the new stubbed fetch.
        const btn = document.querySelector('.dr-hp-eye-btn[data-eye-kind="invoice"]');
        if (!btn) {
            window.fetch = origFetch;
            return { err: 'no NJD eye button' };
        }
        btn.click();
        await new Promise((r) => setTimeout(r, 2000));

        const billCol = document.getElementById('dr-row-bill');
        const errText = billCol?.textContent || '';
        const titleText =
            document.getElementById('dr-row-modal')?.querySelector('#dr-row-title')?.textContent ||
            '';

        window.fetch = origFetch;
        return { errText: errText.slice(0, 200), titleText };
    });
    console.log('  result:', JSON.stringify(testC));
    if (testC.err) assertions.push(`FAIL: ${testC.err}`);
    else if (testC.errText.includes('Không tìm thấy phiếu'))
        assertions.push('PASS: empty GetView → "Không tìm thấy phiếu" error in bill column');
    else assertions.push(`FAIL: TEST C errText="${testC.errText}"`);

    console.log('\n=== ASSERTIONS ===');
    assertions.forEach((a) => console.log('  ' + a));
    const failed = assertions.filter((a) => a.startsWith('FAIL:'));
    console.log(`\n${failed.length} failures.`);

    if (errors.length) {
        console.log('\n=== ERRORS (filtered) ===');
        errors.slice(0, 10).forEach((e, i) => console.log(`${i + 1}. ${e}`));
    }

    await browser.close();
    process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
    console.error('FATAL:', e);
    process.exit(2);
});
