#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Bug repro: confirmReview() success path called closeReviewModal() but never reset
// the confirm button. The modal/button is a singleton so the next open showed
// "Đang xử lý..." (disabled) → user-visible "stuck" state.
//
// Test: drive the modal element directly (it's appended to body by ensureReviewModal),
// simulate a successful confirm + close cycle, then verify the next open finds the
// button restored to "✓ Xác nhận đã kiểm tra" and enabled.

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
    page.on('dialog', async (d) => await d.accept().catch(() => {}));

    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="user"], input[type="text"], #username', 'admin').catch(() => {});
    await page.fill('input[type="password"]', 'admin@@').catch(() => {});
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.goto(`${BASE}/delivery-report/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => !!window.DeliveryReport, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const assertions = [];

    // The kiểm tra modal is built lazily on first open. Use the popover-action wiring
    // path: drive a customer-cell click → activity column renders, then click the
    // review button. Since openReviewModal is closure-scoped we synthesize the same
    // user flow.
    //
    // Setup: stub fetch to return a synthetic customer with one already-pending tx
    // so the popover renders a Duyệt button (and we can drive the modal that way),
    // but easier: render a customer with a manager-reviewable tx (sepay/balance_history)
    // to expose the dr-hp-review-btn. Then click it.
    const setup = await page.evaluate(async () => {
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
                                    type: 'DEPOSIT',
                                    amount: 1960000,
                                    note: 'Nạp từ CK · IB NAM LUN-94479',
                                    source: 'BANK_TRANSFER',
                                    reference_id: '1234',
                                    reference_type: 'balance_history',
                                    bh_content: 'IB NAM LUN-94479',
                                    bh_transaction_date: '2026-05-05T12:02:44Z',
                                    created_at: '2026-05-05T12:02:44Z',
                                    sepay_image_url: 'https://example.com/acb.png',
                                    manager_reviewed: false,
                                },
                                {
                                    type: 'DEPOSIT',
                                    amount: 1640000,
                                    note: 'Nạp từ CK',
                                    source: 'BANK_TRANSFER',
                                    reference_id: '1235',
                                    reference_type: 'balance_history',
                                    created_at: '2026-05-05T03:58:00Z',
                                    sepay_image_url: 'https://example.com/acb2.png',
                                    manager_reviewed: false,
                                },
                            ],
                            pending_transactions: [],
                        },
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            // Stub the manager-review endpoint so confirmReview's fetch resolves OK
            if (/\/api\/v2\/balance-history\/.+\/manager-review/.test(u)) {
                return new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            // Block any unintended outbound calls during the bill iframe loading
            if (/\/api\/odata\/FastSaleOrder\(123\)/.test(u) || /print1/.test(u)) {
                return new Response('{}', {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return origFetch.call(this, url, opts);
        };

        const wrap = document.getElementById('drTableWrapper') || document.body;
        const fake = document.createElement('table');
        fake.innerHTML = `<tr id="__test_row__">
            <td class="dr-hover-bill" data-id="123" data-number="NJD/2026/T1">NJD/2026/T1</td>
            <td class="dr-hover-customer" data-phone="0900000000"><span class="dr-customer-name">Khách Test</span></td>
        </tr>`;
        wrap.appendChild(fake);
        fake.querySelector('.dr-hover-customer').click();
        return { ok: true };
    });
    console.log('  setup:', JSON.stringify(setup));
    await page.waitForTimeout(2500);

    // Probe: count review buttons rendered.
    const reviewBtns = await page.evaluate(
        () => document.querySelectorAll('#dr-row-activity .dr-hp-review-btn').length
    );
    console.log('  review buttons rendered:', reviewBtns);
    if (reviewBtns < 1) {
        assertions.push('FAIL: no review buttons rendered — setup failed');
    } else {
        // STEP 1: open review modal for first tx, click confirm, wait for resolve+close
        const step1 = await page.evaluate(async () => {
            const btns = document.querySelectorAll('#dr-row-activity .dr-hp-review-btn');
            btns[0].click();
            // wait for modal display
            await new Promise((r) => setTimeout(r, 300));
            const modal = document.getElementById('dr-rev-modal');
            const before = {
                visible: modal?.style.display === 'flex',
                btnHtml: modal?.querySelector('#dr-rev-confirm')?.innerHTML?.trim() || '',
                btnDisabled: modal?.querySelector('#dr-rev-confirm')?.disabled,
            };
            // Click confirm (will fetch manager-review which we stubbed → success)
            modal.querySelector('#dr-rev-confirm').click();
            // Wait for the post-success closeReviewModal()
            await new Promise((r) => setTimeout(r, 1500));
            return {
                before,
                afterConfirm: {
                    visible: modal?.style.display === 'flex',
                    btnHtml: modal?.querySelector('#dr-rev-confirm')?.innerHTML?.trim() || '',
                    btnDisabled: modal?.querySelector('#dr-rev-confirm')?.disabled,
                },
            };
        });
        console.log('  step1:', JSON.stringify(step1, null, 2));

        if (step1.before.visible) assertions.push('PASS: STEP1 modal opened');
        else assertions.push('FAIL: STEP1 modal did not open');

        if (
            step1.before.btnHtml.includes('Xác nhận đã kiểm tra') &&
            step1.before.btnDisabled === false
        )
            assertions.push('PASS: STEP1 button starts as "Xác nhận đã kiểm tra" enabled');
        else
            assertions.push(
                `FAIL: STEP1 initial button state wrong (html="${step1.before.btnHtml}", disabled=${step1.before.btnDisabled})`
            );

        if (step1.afterConfirm.visible === false)
            assertions.push('PASS: STEP1 modal closed after successful confirm');
        else
            assertions.push(
                'FAIL: STEP1 modal still visible after confirm (success path did not closeReviewModal)'
            );

        // CORE BUG ASSERTION: after close, button HTML must be reset to default
        // (not "Đang xử lý..."). Check both the post-close DOM state AND the next-open state.
        if (
            step1.afterConfirm.btnHtml.includes('Xác nhận đã kiểm tra') &&
            step1.afterConfirm.btnDisabled === false
        )
            assertions.push(
                'PASS: STEP1 button reset to default after closeReviewModal (regression: was stuck at "Đang xử lý...")'
            );
        else
            assertions.push(
                `FAIL: STEP1 button stuck after closeReviewModal (html="${step1.afterConfirm.btnHtml}", disabled=${step1.afterConfirm.btnDisabled})`
            );

        // STEP 2: open the modal for the SECOND tx and verify the button is fresh.
        const step2 = await page.evaluate(async () => {
            const btns = document.querySelectorAll('#dr-row-activity .dr-hp-review-btn');
            // Re-fetch button list because the first one may have been replaced by ✓ ĐÃ KT badge
            const visibleBtns = Array.from(btns).filter((b) => b.offsetParent !== null);
            const target = visibleBtns[0] || btns[0];
            target.click();
            await new Promise((r) => setTimeout(r, 300));
            const modal = document.getElementById('dr-rev-modal');
            return {
                visible: modal?.style.display === 'flex',
                btnHtml: modal?.querySelector('#dr-rev-confirm')?.innerHTML?.trim() || '',
                btnDisabled: modal?.querySelector('#dr-rev-confirm')?.disabled,
            };
        });
        console.log('  step2:', JSON.stringify(step2));

        if (step2.visible) assertions.push('PASS: STEP2 modal reopened for second tx');
        else assertions.push('FAIL: STEP2 modal did not reopen');

        if (step2.btnHtml.includes('Xác nhận đã kiểm tra') && step2.btnDisabled === false)
            assertions.push('PASS: STEP2 confirm button is fresh on reopen (no stuck state)');
        else
            assertions.push(
                `FAIL: STEP2 confirm button stuck on reopen (html="${step2.btnHtml}", disabled=${step2.btnDisabled})`
            );
    }

    console.log('\n=== ASSERTIONS ===');
    assertions.forEach((a) => console.log('  ' + a));
    const failed = assertions.filter((a) => a.startsWith('FAIL:'));
    console.log(`\n${failed.length} failures.`);

    if (errors.length) {
        console.log('\n=== PAGE ERRORS ===');
        errors.slice(0, 10).forEach((e, i) => console.log(`${i + 1}. ${e}`));
    }

    await browser.close();
    process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
    console.error('FATAL:', e);
    process.exit(2);
});
