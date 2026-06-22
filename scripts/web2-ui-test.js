// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 UI TEST — click/tương tác UI THẬT (Playwright) trên toàn bộ trang Web 2.0.
// Mô phỏng user thật: gõ search, đổi filter, click button non-destructive, mở tab.
// Bắt console.error + pageerror + unhandledrejection từ lúc LOAD đến hết tương tác.
// KHÔNG dùng raw API request — chỉ drive UI thật.
//
// Dùng: node scripts/web2-ui-test.js --user admin --pass admin@@ --base http://localhost:8080
// Output: downloads/n2store-session/web2-ui-test.{json,md}
// =====================================================

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { ensureLocalServer } = require('./lib/ensure-local-server');

function parseArgs() {
    const a = process.argv.slice(2);
    const out = { user: 'admin', pass: 'admin@@', base: 'http://localhost:8080', perSecs: 9 };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') out.user = a[++i];
        else if (a[i] === '--pass') out.pass = a[++i];
        else if (a[i] === '--base') out.base = a[++i];
        else if (a[i] === '--per-page-secs') out.perSecs = parseInt(a[++i]) || 9;
    }
    return out;
}
const ARGS = parseArgs();
const BASE = ARGS.base.replace(/\/$/, '');

// Toàn bộ trang trong menu Web 2.0 (web2-sidebar.js) + Sale Online (root folders).
const PAGES = [
    '/web2/overview/index.html',
    // Tính năng mới
    '/web2/dashboard/index.html',
    '/web2/kpi/index.html',
    '/web2/notifications/index.html',
    '/web2/audit-log/index.html',
    '/web2/ck-dashboard/index.html',
    '/web2/photo-studio/index.html',
    '/web2/users-permissions/index.html',
    '/web2/admin-sse-monitor/index.html',
    '/web2/services-dashboard/index.html',
    // Bán Hàng
    '/web2/fastsaleorder-invoice/index.html',
    '/web2/reconcile/index.html',
    '/web2/fastsaleorder-refund/index.html',
    '/web2/returns/index.html',
    '/web2/fastsaleorder-delivery/index.html',
    // Sale Online
    '/native-orders/index.html',
    '/so-order/index.html',
    '/live-chat/index.html',
    // Mua hàng
    '/web2/purchase-refund/index.html',
    '/web2/supplier-debt/index.html',
    '/web2/supplier-wallet/index.html',
    // Tài chính
    '/web2/balance-history/index.html',
    // Khách hàng
    '/web2/customers/index.html',
    '/web2/customer-wallet/index.html',
    // Sản phẩm
    '/web2/products/index.html',
    '/web2/variants/index.html',
    // Báo cáo
    '/web2/report-revenue/index.html',
    '/web2/report-delivery/index.html',
    // Cấu hình
    '/web2/livestream-poller/index.html',
    '/web2/users/index.html',
    '/web2/pancake-settings/index.html',
    '/web2/delivery-zone/index.html',
    '/web2/printer-settings/index.html',
];

const ts = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

// Tiếng noise môi trường (không phải bug code) — phân loại riêng.
const NOISE_RE =
    /Failed to load resource|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|net::ERR_|expired account|Cannot activate expired|favicon|ResizeObserver loop|the server responded with a status of 4|status of 5|x-web2-token|Cần đăng nhập|403|401|chatomni-proxy|onrender\.com|pancake/i;

async function loginContext(browser) {
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        bypassCSP: true,
    });
    await ctx.route('**/*.js', (route) =>
        route.continue({
            headers: { ...route.request().headers(), 'cache-control': 'no-cache, no-store' },
        })
    );
    const page = await ctx.newPage();
    log('Login…');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#username', { timeout: 20000 }).catch(() => {});
    await page.fill('#username', ARGS.user).catch(() => {});
    await page.fill('#password', ARGS.pass).catch(() => {});
    await page
        .locator('#password')
        .press('Enter')
        .catch(() => {});
    await page
        .waitForFunction(() => !!localStorage.getItem('loginindex_auth'), { timeout: 30000 })
        .catch(() => {});
    await page.waitForTimeout(1500);
    await page.close();
    log('Login OK');
    return ctx;
}

// Real-click interaction probe (clone từ n2store-interactive-smoke.js — el.click() thật).
const PROBE = `
(async () => {
    const results = [];
    const errs = () => (window.__diag?.errors || []).length;
    const safeClick = async (el, label) => {
        const before = errs();
        try { el.click(); await new Promise(r=>setTimeout(r,700));
            results.push({ label, ok:true, newErrors: errs()-before });
        } catch(e){ results.push({ label, ok:false, exception:String(e).slice(0,160) }); }
    };
    // 1. search input
    const searches = Array.from(document.querySelectorAll('input[type=text],input[type=search]')).filter(i=>/tìm|search|sđt|phone|mã|code|tên/i.test((i.placeholder||'').toLowerCase())).slice(0,2);
    for (const inp of searches){ const before=errs(); try{ inp.focus(); inp.value='test'; inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('keyup',{bubbles:true})); await new Promise(r=>setTimeout(r,500)); inp.value=''; inp.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,300)); results.push({label:'search "'+(inp.placeholder||'').slice(0,24)+'"',ok:true,newErrors:errs()-before}); }catch(e){ results.push({label:'search',ok:false,exception:String(e).slice(0,160)}); } }
    // 2. selects
    const selects = Array.from(document.querySelectorAll('select')).slice(0,3);
    for (const sel of selects){ const opts=Array.from(sel.options||[]); if(opts.length<2)continue; const before=errs(); try{ sel.value=opts[1].value; sel.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,500)); sel.value=opts[0].value; sel.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,300)); results.push({label:'select "'+(sel.name||sel.id||'?').slice(0,22)+'"',ok:true,newErrors:errs()-before}); }catch(e){ results.push({label:'select',ok:false,exception:String(e).slice(0,160)}); } }
    // 3. buttons (non-destructive, non-navigating)
    const isDestructive = (t,oc)=>{ const s=(t+' '+(oc||'')).toLowerCase(); return /xóa|delete|remove|hủy|cancel|reject|đăng xuất|logout|đăng nhập|login|sign in|reset|clear all|approve|duyệt|confirm|xác nhận|tạo phiếu|tạo pbh|insert|save|lưu|gửi|send|submit|export|in bill|in tem|print|nạp|rút|cộng|trừ|thanh toán|trả|mở chat|quản lý người dùng/.test(s); };
    const isNav = (oc)=>{ const s=(oc||'').toLowerCase(); return /location\\.href|window\\.open|window\\.location|navigate|gohome|goto/.test(s)||s.includes('href='); };
    const btns = Array.from(document.querySelectorAll('button[onclick],[role=button][onclick],button')).filter(b=>{ const t=(b.textContent||'').trim(); const oc=b.getAttribute('onclick')||''; if(!t&&!oc)return false; if(isDestructive(t,oc))return false; if(isNav(oc))return false; if(b.disabled)return false; const r=b.getBoundingClientRect(); return r.width>0&&r.height>0; }).slice(0,6);
    const startUrl=location.href; const here=()=>location.href===startUrl;
    for (const b of btns){ if(!here()){ results.push({label:'nav detected — abort',ok:false}); break; } await safeClick(b,'btn "'+(b.textContent||'').trim().slice(0,24)+'"'); }
    // 4. tabs
    if(here()){ const tabs=Array.from(document.querySelectorAll('[class*=tab]:not(button),.tab-btn,[role=tab]')).filter(t=>{const r=t.getBoundingClientRect();return r.width>0&&r.height>0&&(t.onclick||t.getAttribute('onclick'));}).slice(0,4); for(const t of tabs){ if(!here())break; await safeClick(t,'tab "'+(t.textContent||'').trim().slice(0,20)+'"'); } }
    // 5. mở modal đầu tiên (nút có data-modal / class mở) rồi đóng nếu có nút close
    return { count: results.length, results, finalErrors: errs(),
        rowCount: document.querySelectorAll('tbody tr, .card, [class*=row], li').length };
})()
`;

async function testOne(ctx, urlPath) {
    const url = `${BASE}${urlPath}?t=${Date.now()}`;
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(ARGS.perSecs * 300);
        await page.evaluate(() => {
            window.__diag = { errors: [] };
            const oe = console.error.bind(console);
            console.error = (...a) => {
                try {
                    window.__diag.errors.push(a.map(String).join(' ').slice(0, 300));
                } catch (_) {}
                oe(...a);
            };
        });
        let res;
        try {
            res = await page.evaluate(PROBE);
        } catch (evalErr) {
            res = {
                count: 0,
                results: [],
                finalErrors: 0,
                contextDestroyed: true,
                evalError: String(evalErr.message || evalErr).slice(0, 160),
            };
        }
        // Phân loại lỗi
        const realConsole = consoleErrors.filter((e) => !NOISE_RE.test(e));
        const noiseConsole = consoleErrors.filter((e) => NOISE_RE.test(e));
        const realPageErr = pageErrors.filter((e) => !NOISE_RE.test(e));
        return {
            path: urlPath,
            ok: true,
            evalError: res.evalError || null,
            rowCount: res.rowCount,
            interactions: res.count,
            interactionResults: res.results,
            interactionErrors: (res.results || []).filter((r) => r.newErrors > 0 || r.ok === false),
            realConsoleErrors: realConsole,
            realPageErrors: realPageErr,
            noiseCount: noiseConsole.length + (pageErrors.length - realPageErr.length),
            contextDestroyed: res.contextDestroyed || false,
        };
    } catch (e) {
        return { path: urlPath, ok: false, fatal: String(e.message || e).slice(0, 300) };
    } finally {
        await page.close();
    }
}

(async () => {
    await ensureLocalServer(BASE, path.join(__dirname, '..'));
    const browser = await chromium.launch({ headless: true });
    const ctx = await loginContext(browser);
    const results = [];
    for (let i = 0; i < PAGES.length; i++) {
        const p = PAGES[i];
        process.stdout.write(`[${i + 1}/${PAGES.length}] ${p} … `);
        const r = await testOne(ctx, p);
        const realErr = (r.realConsoleErrors?.length || 0) + (r.realPageErrors?.length || 0);
        const ixErr = r.interactionErrors?.length || 0;
        console.log(
            r.ok
                ? `rows=${r.rowCount} ix=${r.interactions} realErr=${realErr} ixErr=${ixErr} noise=${r.noiseCount}${r.contextDestroyed ? ' [ctx-destroyed]' : ''}`
                : `FATAL ${r.fatal}`
        );
        results.push(r);
    }
    await browser.close();

    const outDir = path.join(__dirname, '..', 'downloads', 'n2store-session');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'web2-ui-test.json'), JSON.stringify(results, null, 2));

    // Markdown summary
    const clean = results.filter(
        (r) =>
            r.ok &&
            !r.realConsoleErrors?.length &&
            !r.realPageErrors?.length &&
            !r.interactionErrors?.length
    );
    const flagged = results.filter(
        (r) =>
            !r.ok ||
            r.realConsoleErrors?.length ||
            r.realPageErrors?.length ||
            r.interactionErrors?.length
    );
    let md = `# Web 2.0 UI Test (click thật) — ${ts()}\n\nBASE: ${BASE} · ${PAGES.length} trang · sạch: ${clean.length}/${PAGES.length}\n\n`;
    if (flagged.length) {
        md += `## ⚠ Trang có vấn đề (${flagged.length})\n\n`;
        for (const r of flagged) {
            md += `### ${r.path}\n`;
            if (!r.ok) {
                md += `- FATAL: ${r.fatal}\n\n`;
                continue;
            }
            if (r.realPageErrors?.length)
                md += `- pageerror: ${r.realPageErrors.map((e) => '`' + e + '`').join('; ')}\n`;
            if (r.realConsoleErrors?.length)
                md += `- console.error: ${r.realConsoleErrors.map((e) => '`' + e + '`').join('; ')}\n`;
            if (r.interactionErrors?.length)
                md += `- tương tác lỗi: ${r.interactionErrors.map((e) => `${e.label}(${e.exception || '+' + e.newErrors + ' err'})`).join('; ')}\n`;
            md += `- rows=${r.rowCount} interactions=${r.interactions} noise=${r.noiseCount}\n\n`;
        }
    }
    md += `## ✅ Trang sạch (${clean.length})\n\n`;
    for (const r of clean)
        md += `- ${r.path} — rows=${r.rowCount}, ix=${r.interactions}, noise=${r.noiseCount}\n`;
    fs.writeFileSync(path.join(outDir, 'web2-ui-test.md'), md);

    console.log(`\n=== DONE: ${clean.length}/${PAGES.length} sạch, ${flagged.length} flagged ===`);
    console.log(`Report: downloads/n2store-session/web2-ui-test.{json,md}`);
})().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
