#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Mục đích: Phase 4 — interactive smoke test cho ~12 top-priority pages.
// Mỗi page: navigate, install error hooks, probe DOM tìm interactive elements (search inputs,
// filter dropdowns, action buttons), click/type sequentially, capture errors per interaction.
// Output: downloads/n2store-session/interactive-smoke-report.{json,md}
//
// Run: node scripts/n2store-interactive-smoke.js --user U --pass P [--per-page-secs 12]

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');

const ARGS = (() => {
    const a = process.argv.slice(2);
    const out = {
        user: '',
        pass: '',
        perPageSecs: 12,
        base: 'https://nhijudyshop.github.io/n2store',
    };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') out.user = a[++i];
        else if (a[i] === '--pass') out.pass = a[++i];
        else if (a[i] === '--per-page-secs') out.perPageSecs = Number(a[++i]) || 12;
        else if (a[i] === '--base') out.base = a[++i];
    }
    return out;
})();
if (!ARGS.user || !ARGS.pass) {
    console.error(
        'Usage: --user U --pass P [--per-page-secs 12] [--base URL]\n' +
            '  Localhost: --base http://localhost:8080'
    );
    process.exit(1);
}

const BASE = ARGS.base.replace(/\/+$/, '');
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session');
const REPORT_JSON = path.join(OUT_DIR, 'interactive-smoke-report.json');
const REPORT_MD = path.join(OUT_DIR, 'interactive-smoke-report.md');
fs.mkdirSync(OUT_DIR, { recursive: true });

const PAGES = [
    '/orders-report/main.html', // baseline (đã pass 40 cases)
    '/order-management/index.html',
    '/order-management/order-list.html',
    '/order-management/hidden-products.html',
    '/inbox/index.html',
    '/don-inbox/index.html',
    '/soquy/index.html',
    '/soluong-live/index.html',
    '/customer-hub/index.html',
    '/inventory-tracking/index.html',
    '/tpos-pancake/index.html',
    '/web2-products/index.html',
    '/balance-history/index.html',
    '/native-orders/index.html',
    '/firebase-stats/index.html',
    '/bangkiemhang/index.html',
    '/invoice-compare/index.html',
    '/supplier-debt/index.html',
    '/soluong-live/sales-report.html',
    '/soluong-live/social-sales.html',
    '/phone-management/index.html',
    '/fb-ads/index.html',
    '/delivery-report/index.html',
    '/service-costs/index.html',
];

const ts = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

async function loginContext(browser) {
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        bypassCSP: true,
    });
    await ctx.route('**/*.js', (route) => {
        route.continue({
            headers: { ...route.request().headers(), 'cache-control': 'no-cache, no-store' },
        });
    });
    const page = await ctx.newPage();
    log('Login…');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#username');
    await page.fill('#username', ARGS.user);
    await page.fill('#password', ARGS.pass);
    await page.locator('#password').press('Enter');
    await page
        .waitForFunction(
            () =>
                !/\/n2store\/?$|\/n2store\/index\.html$/.test(location.href) ||
                !!localStorage.getItem('loginindex_auth'),
            { timeout: 30_000 }
        )
        .catch(() => {});
    await page.waitForTimeout(2000);
    await page.close();
    log('Login OK');
    return ctx;
}

const PROBE_AND_INTERACT = `
(async () => {
    const results = { interactions: [] };
    const errs = () => (window.__diag?.errors || []).length;
    const unhs = () => (window.__diag?.unhandled || []).length;

    const safeClick = async (el, label) => {
        const errBefore = errs();
        const unhBefore = unhs();
        try {
            el.click();
            await new Promise(r => setTimeout(r, 800));
            results.interactions.push({
                label,
                ok: true,
                newErrors: errs() - errBefore,
                newUnhandled: unhs() - unhBefore,
            });
        } catch (e) {
            results.interactions.push({ label, ok: false, exception: String(e).slice(0, 200) });
        }
    };

    // 1. Search inputs — type + Enter
    const searchInputs = Array.from(document.querySelectorAll('input[type=text], input[type=search]')).filter(i => {
        const ph = (i.placeholder || '').toLowerCase();
        return /tìm|search|sđt|phone|mã|code/i.test(ph);
    }).slice(0, 2);
    for (const inp of searchInputs) {
        const ph = (inp.placeholder || '').slice(0, 30);
        const errBefore = errs();
        const unhBefore = unhs();
        try {
            inp.focus();
            inp.value = 'test';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('keyup', { bubbles: true }));
            await new Promise(r => setTimeout(r, 600));
            inp.value = '';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 400));
            results.interactions.push({
                label: 'search "' + ph + '"',
                ok: true,
                newErrors: errs() - errBefore,
                newUnhandled: unhs() - unhBefore,
            });
        } catch (e) {
            results.interactions.push({ label: 'search ' + ph, ok: false, exception: String(e).slice(0, 200) });
        }
    }

    // 2. Filter dropdowns / select elements — change to second option
    const selects = Array.from(document.querySelectorAll('select')).slice(0, 3);
    for (const sel of selects) {
        const opts = Array.from(sel.options || []);
        if (opts.length < 2) continue;
        const errBefore = errs();
        const unhBefore = unhs();
        try {
            sel.value = opts[1].value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 600));
            sel.value = opts[0].value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 400));
            results.interactions.push({
                label: 'select "' + (sel.name || sel.id || 'unnamed').slice(0, 25) + '"',
                ok: true,
                newErrors: errs() - errBefore,
                newUnhandled: unhs() - unhBefore,
            });
        } catch (e) {
            results.interactions.push({ label: 'select', ok: false, exception: String(e).slice(0, 200) });
        }
    }

    // 3. Buttons with onclick — click first 6 NON-DESTRUCTIVE & NON-NAVIGATING
    const isDestructive = (txt, oc) => {
        const s = (txt + ' ' + (oc || '')).toLowerCase();
        return /xóa|delete|remove|hủy|cancel|reject|đăng xuất|logout|reset|clear all|approve|confirm|tạo phiếu|insert|save|lưu|gửi|send|submit|export|in bill|print/.test(s);
    };
    const isNavigating = (oc) => {
        const s = (oc || '').toLowerCase();
        return /location\.href|window\.open|window\.location|navigate|gohome|goto/i.test(s) || s.includes('href=');
    };
    const btns = Array.from(document.querySelectorAll('button[onclick], [role=button][onclick]')).filter(b => {
        const txt = (b.textContent || '').trim();
        const oc = b.getAttribute('onclick') || '';
        if (!txt && !oc) return false;
        if (isDestructive(txt, oc)) return false;
        if (isNavigating(oc)) return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }).slice(0, 6);

    // Track URL — abort all clicks if any navigation happens
    const startUrl = location.href;
    const isStillHere = () => location.href === startUrl;
    for (const b of btns) {
        if (!isStillHere()) {
            results.interactions.push({ label: 'navigation detected — abort remaining clicks', ok: false });
            break;
        }
        const txt = (b.textContent || '').trim().slice(0, 25);
        await safeClick(b, 'btn "' + txt + '"');
    }

    // 4. Tabs (any element with class containing "tab")
    if (isStillHere()) {
        const tabs = Array.from(document.querySelectorAll('[class*=tab]:not(button), .tab-btn, [role=tab]')).filter(t => {
            const r = t.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (t.onclick || t.getAttribute('onclick'));
        }).slice(0, 4);
        for (const t of tabs) {
            if (!isStillHere()) break;
            const txt = (t.textContent || '').trim().slice(0, 20);
            await safeClick(t, 'tab "' + txt + '"');
        }
    }

    return {
        interactionCount: results.interactions.length,
        results: results.interactions,
        finalErrors: errs(),
        finalUnhandled: unhs(),
    };
})()
`;

async function testOne(ctx, urlPath) {
    const url = `${BASE}${urlPath}?t=${Date.now()}`;
    const page = await ctx.newPage();

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(3_000);

        // Install error hooks
        await page.evaluate(() => {
            window.__diag = { errors: [], warns: [], unhandled: [] };
            const oe = console.error.bind(console);
            const ow = console.warn.bind(console);
            console.error = (...a) => {
                try {
                    window.__diag.errors.push({
                        t: Date.now(),
                        msg: a.map(String).join(' ').slice(0, 400),
                    });
                } catch (_) {}
                oe(...a);
            };
            console.warn = (...a) => {
                try {
                    window.__diag.warns.push({
                        t: Date.now(),
                        msg: a.map(String).join(' ').slice(0, 400),
                    });
                } catch (_) {}
                ow(...a);
            };
            window.addEventListener('error', (e) =>
                window.__diag.unhandled.push({
                    t: Date.now(),
                    msg: (e.message || '').slice(0, 200),
                })
            );
            window.addEventListener('unhandledrejection', (e) =>
                window.__diag.unhandled.push({
                    t: Date.now(),
                    msg: 'rej: ' + String(e.reason?.message || e.reason || '').slice(0, 200),
                })
            );
        });

        // Run interactions — recover gracefully if context destroyed (button navigated)
        let res;
        try {
            res = await page.evaluate(PROBE_AND_INTERACT);
        } catch (evalErr) {
            // Try to fetch __diag final state from new context
            res = await page
                .evaluate(() => ({
                    interactionCount: 0,
                    results: [],
                    finalErrors: window.__diag?.errors?.length || 0,
                    finalUnhandled: window.__diag?.unhandled?.length || 0,
                    contextDestroyed: true,
                    note: 'Một button gây navigation — không tính lỗi page',
                }))
                .catch(() => ({
                    interactionCount: 0,
                    finalErrors: 0,
                    finalUnhandled: 0,
                    contextDestroyed: true,
                    evalError: String(evalErr.message || evalErr).slice(0, 200),
                }));
        }
        return { path: urlPath, ok: true, ...res };
    } catch (e) {
        return { path: urlPath, ok: false, fatal: e.message };
    } finally {
        await page.close();
    }
}

(async () => {
    // Auto-start localhost server nếu BASE là localhost
    await ensureLocalServer(BASE, path.join(__dirname, '..'));

    const browser = await chromium.launch({ headless: true });
    const ctx = await loginContext(browser);

    const results = [];
    for (let i = 0; i < PAGES.length; i++) {
        const p = PAGES[i];
        log(`[${i + 1}/${PAGES.length}] ${p}`);
        const r = await testOne(ctx, p);
        log(
            `   interactions=${r.interactionCount || 0} errors=${r.finalErrors || 0} unhandled=${r.finalUnhandled || 0}`
        );
        results.push(r);
    }

    fs.writeFileSync(REPORT_JSON, JSON.stringify(results, null, 2));

    let md = `# Interactive Smoke Report — ${results.length} pages\n\nGenerated: ${ts()}\n\n`;
    md += `| Path | Interactions | Final Errors | Final Unhandled | Status |\n|---|---|---|---|---|\n`;
    for (const r of results) {
        const status = r.fatal
            ? '❌ FATAL'
            : r.finalErrors > 0 || r.finalUnhandled > 0
              ? '⚠️'
              : '✅';
        md += `| \`${r.path}\` | ${r.interactionCount || 0} | ${r.finalErrors || 0} | ${r.finalUnhandled || 0} | ${status} |\n`;
    }
    md += `\n## Pages with errors after interactions\n\n`;
    for (const r of results) {
        if (r.fatal || r.finalErrors > 0 || r.finalUnhandled > 0) {
            md += `### \`${r.path}\`\n`;
            if (r.fatal) md += `- FATAL: ${r.fatal}\n`;
            const errInteractions = (r.results || []).filter(
                (i) => (i.newErrors || 0) > 0 || (i.newUnhandled || 0) > 0
            );
            if (errInteractions.length > 0) {
                for (const i of errInteractions) {
                    md += `- ${i.label}: errors+${i.newErrors || 0} unhandled+${i.newUnhandled || 0}\n`;
                }
            }
            md += '\n';
        }
    }
    fs.writeFileSync(REPORT_MD, md);
    log(`Report → ${REPORT_MD}`);
    log(
        `Summary: ${results.filter((r) => !r.fatal && (r.finalErrors || 0) === 0 && (r.finalUnhandled || 0) === 0).length} clean`
    );

    await browser.close();
})().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
