#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// Test supplier-debt Auto Refresh (polling + cross-tab BroadcastChannel).
// MOCK toàn bộ tposFetch → KHÔNG đụng TPOS thật.
//
// Usage:
//   node scripts/test-supplier-debt-auto-refresh.js
//
// Yêu cầu localhost server lên port 8080 (script tự spawn nếu chưa có).
//
// Test scenarios:
//   1. Initial render hiển thị 3 mock NCC
//   2. Đổi mock data + force tick → bảng cập nhật ngay
//   3. Same data → silentRefresh return false (hash diff skip render)
//   4. Cross-tab: tab A notifyChange → tab B refresh (BroadcastChannel)
//   5. Busy skip: modal mở → tick không refresh
//   6. Scroll preserved sau silent refresh
//
// Output: PASS/FAIL từng case; exit 0 nếu all green.

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { ensureLocalServer } = require(path.join(__dirname, 'lib', 'ensure-local-server.js'));
const { restoreLoginSession } = require(path.join(__dirname, 'restore-login-session.js'));

const BASE = 'http://localhost:8080';
const PAGE_PATH = '/supplier-debt/index.html';

// ---- Mock data fixtures ----
const FIXTURES = {
    initial: {
        '@odata.count': 3,
        value: [
            {
                PartnerId: 9001,
                Code: 'TEST_A',
                PartnerName: 'TEST NCC A',
                Debit: 1000000,
                Credit: 0,
                End: 5000000,
            },
            {
                PartnerId: 9002,
                Code: 'TEST_B',
                PartnerName: 'TEST NCC B',
                Debit: 2000000,
                Credit: 500000,
                End: 3500000,
            },
            {
                PartnerId: 9003,
                Code: 'TEST_C',
                PartnerName: 'TEST NCC C',
                Debit: 0,
                Credit: 0,
                End: 100000,
            },
        ],
    },
    // Payment ghi nhận: TEST_B trả 500k → End giảm
    afterPayment: {
        '@odata.count': 3,
        value: [
            {
                PartnerId: 9001,
                Code: 'TEST_A',
                PartnerName: 'TEST NCC A',
                Debit: 1000000,
                Credit: 0,
                End: 5000000,
            },
            {
                PartnerId: 9002,
                Code: 'TEST_B',
                PartnerName: 'TEST NCC B',
                Debit: 2000000,
                Credit: 1000000,
                End: 3000000,
            },
            {
                PartnerId: 9003,
                Code: 'TEST_C',
                PartnerName: 'TEST NCC C',
                Debit: 0,
                Credit: 0,
                End: 100000,
            },
        ],
    },
    refundEmpty: { '@odata.count': 0, value: [] },
};

// addInitScript chạy TRƯỚC mọi script khác → mock sẵn authenticatedFetch
const initScript = `
(function () {
    if (window.__MOCK_INSTALLED__) return;
    window.__MOCK_INSTALLED__ = true;
    window.__MOCK_STATE__ = { dataset: 'initial', callCount: 0, callLog: [] };
    window.__FIXTURES__ = ${JSON.stringify(FIXTURES)};

    // Mock tokenManager nếu chưa có (tránh redirect login)
    const ensureTokenManager = () => {
        if (!window.tokenManager) {
            window.tokenManager = {
                initPromise: Promise.resolve(),
                authenticatedFetch: window.__MOCK_FETCH__,
            };
        } else {
            // Wrap thật → mock
            window.tokenManager.authenticatedFetch = window.__MOCK_FETCH__;
        }
    };

    window.__MOCK_FETCH__ = async function (url, options) {
        const st = window.__MOCK_STATE__;
        st.callCount++;
        st.callLog.push({ url: String(url).slice(0, 200), method: options?.method || 'GET' });

        // PartnerDebtReport endpoint → trả supplier list
        if (/PartnerDebtReport(?!Detail)/.test(url)) {
            const body = JSON.stringify(window.__FIXTURES__[st.dataset] || window.__FIXTURES__.initial);
            return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // FastPurchaseOrder refund list → empty
        if (/FastPurchaseOrder.*OdataService\\.GetView/.test(url) || /FastPurchaseOrder.*refund/.test(url)) {
            return new Response(JSON.stringify(window.__FIXTURES__.refundEmpty), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Default: empty 200
        return new Response(JSON.stringify({ value: [], '@odata.count': 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    // Inject ngay
    ensureTokenManager();

    // Trap khi page sau này gán tokenManager → wrap lại
    let _tm = window.tokenManager;
    Object.defineProperty(window, 'tokenManager', {
        configurable: true,
        get() { return _tm; },
        set(v) {
            _tm = v;
            if (_tm) _tm.authenticatedFetch = window.__MOCK_FETCH__;
        },
    });

    // Tắt notification toast cho gọn (vẫn log để verify)
    window.__NOTIFS__ = [];
    window.notificationManager = {
        success: (m) => window.__NOTIFS__.push({ type: 'success', msg: m }),
        error:   (m) => window.__NOTIFS__.push({ type: 'error',   msg: m }),
        info:    (m) => window.__NOTIFS__.push({ type: 'info',    msg: m }),
        warning: (m) => window.__NOTIFS__.push({ type: 'warning', msg: m }),
        remove:  () => {},
    };

    // Auth manager: granted all
    window.authManager = {
        hasDetailedPermission: () => true,
        isLoggedIn: () => true,
        currentUser: { username: 'test' },
    };
})();
`;

let results = [];
function record(name, ok, detail) {
    results.push({ name, ok, detail });
    const tag = ok ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function waitFor(page, fn, { timeout = 5000, label = '' } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const result = await page.evaluate(fn);
            if (result) return result;
        } catch (_) {
            /* keep polling */
        }
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`waitFor timeout ${label}`);
}

async function setupPage(context, name) {
    await context.addInitScript(initScript);
    const page = await context.newPage();
    page.on('console', (msg) => {
        const txt = msg.text();
        if (/\[(AutoRefresh|SupplierDebt)\]/.test(txt)) {
            console.log(`  [${name} console] ${txt}`);
        }
    });
    page.on('pageerror', (e) => console.log(`  [${name} pageerror]`, e.message));
    await page.goto(BASE + PAGE_PATH);
    return page;
}

async function main() {
    await ensureLocalServer(BASE, path.join(__dirname, '..'));

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    try {
        await restoreLoginSession(context, BASE);
    } catch (_) {
        /* mock bypasses anyway */
    }

    let page;
    try {
        // ---- Tab A ----
        page = await setupPage(context, 'A');

        // Wait for init complete (table rendered with mock rows)
        await waitFor(
            page,
            () => {
                const rows = document.querySelectorAll('tbody .data-row');
                return rows.length >= 3;
            },
            { timeout: 10000, label: 'initial render' }
        );

        // SCENARIO 1: Initial render
        {
            const codes = await page.evaluate(() =>
                Array.from(document.querySelectorAll('tbody .data-row .supplier-code')).map((el) =>
                    el.textContent.trim()
                )
            );
            record(
                'initial render shows 3 mock NCC',
                codes.length === 3 && codes.includes('TEST_A'),
                `codes=${codes.join(',')}`
            );
        }

        // SCENARIO 2: Hash diff skip - same data → silentRefresh returns false
        {
            const result = await page.evaluate(async () => {
                window.__MOCK_STATE__.dataset = 'initial';
                const r = await window.silentRefresh({ reason: 'test-same' });
                return r;
            });
            record(
                'hash diff skip when data unchanged',
                result === false,
                `silentRefresh returned ${result}`
            );
        }

        // SCENARIO 3: Data changed → render updates
        {
            const before = await page.evaluate(
                () => document.getElementById('totalEnd')?.textContent || ''
            );
            const result = await page.evaluate(async () => {
                window.__MOCK_STATE__.dataset = 'afterPayment';
                const r = await window.silentRefresh({ reason: 'test-change' });
                return r;
            });
            const after = await page.evaluate(
                () => document.getElementById('totalEnd')?.textContent || ''
            );
            const endB = await page.evaluate(() => {
                const rows = document.querySelectorAll('tbody .data-row');
                for (const r of rows) {
                    if (r.querySelector('.supplier-code')?.textContent.trim() === 'TEST_B') {
                        return r.querySelector('[data-col="end"]')?.textContent;
                    }
                }
                return null;
            });
            // After payment: TEST_B End = 3,000,000
            record(
                'data change triggers re-render + total update',
                result === true && before !== after && /3[\.,]000[\.,]000/.test(endB || ''),
                `before=${before} after=${after} TEST_B.End=${endB}`
            );
        }

        // SCENARIO 4: Busy skip - modal open
        {
            const skipped = await page.evaluate(async () => {
                // Simulate modal open
                const modal = document.getElementById('paymentModal');
                if (!modal) return 'no-modal-elem';
                modal.classList.add('show');
                window.__MOCK_STATE__.dataset = 'initial'; // change data
                const r = await window.SupplierDebtAutoRefresh.tick({ reason: 'poll' });
                modal.classList.remove('show');
                return r;
            });
            record('busy-skip when modal open', skipped === false, `tick returned ${skipped}`);
        }

        // SCENARIO 5: Scroll preserved
        {
            const result = await page.evaluate(async () => {
                window.scrollTo(0, 200);
                const before = window.scrollY;
                window.__MOCK_STATE__.dataset = 'initial'; // make it different from current (afterPayment was last)
                // Force a real re-render
                await window.silentRefresh({ reason: 'test-scroll' });
                const after = window.scrollY;
                return { before, after, delta: Math.abs(after - before) };
            });
            record(
                'scroll position preserved within 10px',
                result.delta < 10,
                `before=${result.before} after=${result.after}`
            );
        }

        // ---- Tab B for cross-tab test ----
        const pageB = await setupPage(context, 'B');
        await waitFor(pageB, () => document.querySelectorAll('tbody .data-row').length >= 3, {
            timeout: 10000,
            label: 'tab B initial',
        });

        // SCENARIO 6: Cross-tab BroadcastChannel
        // - tab B đang ở dataset 'initial'
        // - change dataset to 'afterPayment' for tab B's mock fetch
        // - in tab A, call notifyChange → tab B should receive → silent refresh → see new data
        {
            await pageB.evaluate(() => {
                window.__MOCK_STATE__.dataset = 'afterPayment';
                window.__BC_RECEIVED__ = false;
                // Listen for the broadcast event by re-reading auto-refresh's already-set listener;
                // simpler: monitor when silentRefresh fires via a wrapper
                const orig = window.silentRefresh;
                window.silentRefresh = async function (opts) {
                    const r = await orig(opts);
                    if (opts?.reason === 'broadcast') window.__BC_RECEIVED__ = true;
                    return r;
                };
            });

            await page.evaluate(() => {
                window.SupplierDebtAutoRefresh.notifyChange('payment-created');
            });

            // Give time for cross-tab message + silent refresh
            await new Promise((r) => setTimeout(r, 1500));

            const received = await pageB.evaluate(() => !!window.__BC_RECEIVED__);
            const endB = await pageB.evaluate(() => {
                const rows = document.querySelectorAll('tbody .data-row');
                for (const r of rows) {
                    if (r.querySelector('.supplier-code')?.textContent.trim() === 'TEST_B') {
                        return r.querySelector('[data-col="end"]')?.textContent;
                    }
                }
                return null;
            });
            record(
                'cross-tab BroadcastChannel triggers refresh in other tab',
                received && /3[\.,]000[\.,]000/.test(endB || ''),
                `received=${received} TEST_B.End=${endB}`
            );
        }

        // SCENARIO 7: Same-tab notifyChange does NOT loop refresh itself
        {
            const selfCount = await page.evaluate(async () => {
                window.__MOCK_STATE__.dataset = 'initial';
                // Reset call counter
                window.__MOCK_STATE__.callCount = 0;
                window.SupplierDebtAutoRefresh.notifyChange('test-self');
                await new Promise((r) => setTimeout(r, 500));
                return window.__MOCK_STATE__.callCount;
            });
            record(
                'same-tab notifyChange does not self-refresh (loop guard)',
                selfCount === 0,
                `self callCount=${selfCount}`
            );
        }
    } finally {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} pass ===`);
    if (failed.length) {
        console.log('FAILED:');
        failed.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail || ''}`));
        process.exit(1);
    }
}

main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(2);
});
