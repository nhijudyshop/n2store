#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Mục đích: chạy qua nhiều Tag XL filter, monitor jitter (renderTable + mutations + searchCalls) cho mỗi filter.
// Chạy:  node scripts/n2store-jitter-multi-filter.js --user U --pass P [--secs 30]

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ARGS = (() => {
    const a = process.argv.slice(2);
    const out = { secs: 30, user: '', pass: '' };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') out.user = a[++i];
        else if (a[i] === '--pass') out.pass = a[++i];
        else if (a[i] === '--secs') out.secs = Number(a[++i]) || 30;
    }
    return out;
})();
if (!ARGS.user || !ARGS.pass) {
    console.error(
        'Usage: node scripts/n2store-jitter-multi-filter.js --user U --pass P [--secs 30]'
    );
    process.exit(1);
}

const BASE_URL = 'https://nhijudyshop.github.io/n2store';
const LOGIN_URL = `${BASE_URL}/`;
const ORDERS_URL = `${BASE_URL}/orders-report/main.html`;
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-jitter');
const REPORT_FILE = path.join(OUT_DIR, 'multi-filter-report.json');
fs.mkdirSync(OUT_DIR, { recursive: true });

// kind: 'set' = _ptagSetFilter, 'flag' = _ptagToggleFlagFilter (additive flag), 'combo' = set+flag
const FILTERS = [
    { kind: 'set', key: null, label: 'Tất cả' },
    { kind: 'set', key: '__no_tag__', label: 'Chưa gán Tag XL' },
    { kind: 'set', key: '__don_chot__', label: 'Đơn CHỐT' },
    { kind: 'set', key: 'cat_0', label: 'cat_0 — Đã ra đơn' },
    { kind: 'set', key: 'cat_1', label: 'cat_1 — Chờ đi đơn (OKE)' },
    { kind: 'set', key: 'sub_OKIE_CHO_DI_DON', label: '↳ Okie Chờ Đi Đơn' },
    { kind: 'set', key: 'sub_OKIE_NO_DELAY', label: '↳ Okie No Delay' },
    { kind: 'set', key: 'sub_CHO_HANG', label: '↳ Chờ Hàng' },
    { kind: 'set', key: 'sub_CHO_HANG_DA_IN', label: '↳ Chờ Hàng Đã In' },
    { kind: 'set', key: 'sub_CHO_HANG_CHUA_IN', label: '↳ Chờ Hàng Chưa In' },
    { kind: 'set', key: 'cat_2', label: 'cat_2 — Mục xử lý' },
    { kind: 'set', key: 'subtag_CHUA_PHAN_HOI', label: '↳ ĐƠN CHƯA PHẢN HỒI' },
    { kind: 'set', key: 'subtag_BAN_HANG', label: '↳ BÁN HÀNG' },
    { kind: 'set', key: 'cat_3', label: 'cat_3 — Không cần chốt' },
    { kind: 'set', key: 'subtag_DA_GOP_KHONG_CHOT', label: '↳ ĐÃ GỘP KHÔNG CHỐT' },
    { kind: 'set', key: 'subtag_KHONG_DE_HANG', label: '↳ KHÔNG ĐỂ HÀNG' },
    { kind: 'set', key: 'cat_4', label: 'cat_4 — Khách xã' },
    { kind: 'set', key: 'subtag_NCC_HET_HANG', label: '↳ NCC HẾT HÀNG' },
    { kind: 'set', key: 'subtag_KHACH_HUY_DON', label: '↳ KHÁCH HỦY NGUYÊN ĐƠN' },
    { kind: 'set', key: 'subtag_KHACH_KO_LIEN_LAC', label: '↳ KHÁCH KHÔNG LIÊN LẠC' },
    // Flag filters (additive — sidebar shows them as Đặc điểm Đơn hàng)
    { kind: 'flag', key: 'CHO_LIVE', label: 'flag CHỜ LIVE' },
    { kind: 'flag', key: 'GIU_DON', label: 'flag GIỮ ĐƠN' },
    { kind: 'flag', key: 'QUA_LAY', label: 'flag QUA LẤY' },
    { kind: 'flag', key: 'KHACH_BOOM', label: 'flag KHÁCH BOOM' },
    { kind: 'flag', key: 'CHUYEN_KHOAN', label: 'flag CHUYỂN KHOẢN' },
    { kind: 'flag', key: 'GIAM_GIA', label: 'flag GIẢM GIÁ' },
];

const ts = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    log('Login');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#username', { timeout: 30_000 });
    await page.fill('#username', ARGS.user);
    await page.fill('#password', ARGS.pass);
    await page.locator('#password').press('Enter');
    await page
        .waitForFunction(
            () => {
                if (!/\/n2store\/?$|\/n2store\/index\.html$/.test(location.href)) return true;
                try {
                    return !!(
                        localStorage.getItem('loginindex_auth') || localStorage.getItem('authState')
                    );
                } catch (_) {
                    return false;
                }
            },
            { timeout: 30_000 }
        )
        .catch(() => {});
    await page.waitForTimeout(2_000);

    log('Goto orders');
    // Cache-bust to ensure freshly-deployed JS
    await page.goto(`${ORDERS_URL}?t=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(4_000);

    const frame = page.frames().find((f) => /tab1-orders\.html/.test(f.url())) || page.mainFrame();
    log('Frame:', frame.url());

    // Verify the surgical fix is loaded
    const hasFix = await frame.evaluate(
        () => typeof window.applyOrderMembershipFlip === 'function'
    );
    log('applyOrderMembershipFlip available:', hasFix);

    const report = { startedAt: ts(), hasFix, perFilter: [] };

    for (const flt of FILTERS) {
        log(`\n=== Filter: ${flt.label} (${flt.key}) ===`);

        // Set filter via the public API
        const setOk = await frame.evaluate(
            ({ kind, key }) => {
                try {
                    // Reset additive flags + set filter to known baseline first
                    if (typeof window._ptagSetFilter === 'function') window._ptagSetFilter(null);
                    // Clear any active flags
                    if (
                        window.ProcessingTagState?._activeFlagFilters &&
                        typeof window.ProcessingTagState._activeFlagFilters.clear === 'function'
                    ) {
                        window.ProcessingTagState._activeFlagFilters.clear();
                    }
                    if (kind === 'flag') {
                        if (typeof window._ptagToggleFlagFilter !== 'function') return false;
                        window._ptagToggleFlagFilter(key);
                    } else {
                        if (typeof window._ptagSetFilter !== 'function') return false;
                        window._ptagSetFilter(key);
                    }
                    return true;
                } catch (e) {
                    return false;
                }
            },
            { kind: flt.kind, key: flt.key }
        );
        if (!setOk) {
            log('  Skipped — set API unavailable');
            report.perFilter.push({ ...flt, skipped: true });
            continue;
        }

        // Let the table settle for 2s before instrumenting
        await page.waitForTimeout(2_000);

        // Instrument
        await frame.evaluate(() => {
            window.__jit = {
                events: [],
                rcalls: 0,
                scalls: 0,
                schedCalls: 0,
                startedAt: Date.now(),
            };
            const tbody =
                document.querySelector('#tableBody') ||
                document.querySelector('#ordersTable tbody') ||
                document.body;
            const obs = new MutationObserver((muts) => {
                let n = 0;
                for (const m of muts)
                    n += (m.addedNodes?.length || 0) + (m.removedNodes?.length || 0);
                if (n) window.__jit.events.push({ t: Date.now(), n });
            });
            obs.observe(tbody, { childList: true, subtree: true });
            window.__jit.obs = obs;

            // Wrap renderTable + performTableSearch + schedulePerformTableSearch
            const wrap = (name, prop) => {
                const orig = window[name];
                if (typeof orig !== 'function') return;
                window[name] = function (...a) {
                    window.__jit[prop]++;
                    return orig.apply(this, a);
                };
            };
            wrap('renderTable', 'rcalls');
            wrap('performTableSearch', 'scalls');
            wrap('schedulePerformTableSearch', 'schedCalls');
        });

        const dur = ARGS.secs * 1000;
        await page.waitForTimeout(dur);

        const r = await frame.evaluate(() => {
            const j = window.__jit || {};
            j.obs?.disconnect();
            const total = (j.events || []).reduce((s, e) => s + e.n, 0);
            return {
                durationMs: Date.now() - (j.startedAt || Date.now()),
                eventBursts: (j.events || []).length,
                totalMutations: total,
                renderTableCalls: j.rcalls || 0,
                performTableSearchCalls: j.scalls || 0,
                scheduleCalls: j.schedCalls || 0,
            };
        });

        log('  Result:', r);
        report.perFilter.push({ ...flt, ...r });
    }

    // Reset to "Tất cả"
    await frame.evaluate(() => window._ptagSetFilter && window._ptagSetFilter(null));

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    log('\nReport →', REPORT_FILE);

    // Print summary table
    console.log(
        '\n┌─────────────────────────────────────────────┬──────┬──────┬────────┬───────┬──────┐'
    );
    console.log(
        '│ Filter                                      │ rT() │ pTS()│ sched()│ burst │ muts │'
    );
    console.log(
        '├─────────────────────────────────────────────┼──────┼──────┼────────┼───────┼──────┤'
    );
    for (const r of report.perFilter) {
        if (r.skipped) continue;
        const lbl = (r.label || '').slice(0, 43).padEnd(43);
        const cells = [
            String(r.renderTableCalls).padStart(4),
            String(r.performTableSearchCalls).padStart(4),
            String(r.scheduleCalls).padStart(6),
            String(r.eventBursts).padStart(5),
            String(r.totalMutations).padStart(4),
        ];
        console.log(`│ ${lbl} │ ${cells.join(' │ ')} │`);
    }
    console.log(
        '└─────────────────────────────────────────────┴──────┴──────┴────────┴───────┴──────┘'
    );

    await browser.close();
})().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
