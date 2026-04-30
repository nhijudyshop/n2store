#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// Test realtime sync TPOS → orders-report với 2 tab song song:
//  Tab 1: orders-report main.html (auto-login admin@@) — monitor WS events + [TPOS-RT] logs
//  Tab 2: tomato.tpos.vn fastsaleorder/invoicelist — user tự thao tác (login + đổi status)
//
// Chạy:
//   node scripts/test-tpos-realtime-2tab.js --user admin --pass admin@@
//
// Khi user thay đổi trạng thái invoice trên tab 2 (TPOS):
//   - Render server (n2store-fallback) nhận webhook từ TPOS
//   - Broadcast `tpos:invoice-update` qua WebSocket
//   - Tab 1 nhận, fetch FastSaleOrder OData, update InvoiceStatusStore, re-render PBH cell
//
// Output realtime ở terminal: WS frames + [TPOS-RT] console + InvoiceStatusStore changes.

const { chromium } = require('playwright');

const ARGS = (() => {
    const a = process.argv.slice(2);
    const out = {
        user: '',
        pass: '',
        base: 'https://nhijudyshop.github.io/n2store',
        tposUrl: 'https://tomato.tpos.vn/#/app/fastsaleorder/invoicelist',
    };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') out.user = a[++i];
        else if (a[i] === '--pass') out.pass = a[++i];
        else if (a[i] === '--base') out.base = a[++i];
        else if (a[i] === '--tpos') out.tposUrl = a[++i];
    }
    return out;
})();
if (!ARGS.user || !ARGS.pass) {
    console.error('Usage: node scripts/test-tpos-realtime-2tab.js --user U --pass P');
    process.exit(1);
}

const BASE = ARGS.base.replace(/\/+$/, '');
const ORDERS = `${BASE}/orders-report/main.html`;

const ts = () => new Date().toISOString().slice(11, 23);
const log = (tag, ...a) => console.log(`[${ts()}] [${tag}]`, ...a);

(async () => {
    log('BOOT', 'Launching Chromium (visible)…');
    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-application-cache'],
    });
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        bypassCSP: true,
    });

    // ── Tab 1: orders-report ────────────────────────────────────
    const page1 = await ctx.newPage();

    // Capture WS frames cho tab 1
    page1.on('websocket', (ws) => {
        const u = ws.url();
        if (!/n2store-fallback|chatomni-proxy|firestore/.test(u)) return;
        log('WS-OPEN', u);
        ws.on('framereceived', (f) => {
            const payload = typeof f.payload === 'string' ? f.payload : f.payload?.toString();
            if (!payload) return;
            // Skip heartbeats
            if (payload.length < 5) return;
            try {
                const obj = JSON.parse(payload);
                if (
                    obj.type === 'tpos:invoice-update' ||
                    obj.type === 'tpos:order-update' ||
                    obj.type === 'tpos:new-order' ||
                    obj.type === 'tpos:tag-assigned'
                ) {
                    log('WS-RECV', obj.type, JSON.stringify(obj).slice(0, 400));
                }
            } catch {
                /* not JSON */
            }
        });
        ws.on('close', () => log('WS-CLOSE', u));
    });

    // Capture console.log filter
    page1.on('console', (msg) => {
        const text = msg.text();
        if (/\[TPOS-RT\]|InvoiceStatusStore|invoice-update|realtime/i.test(text)) {
            log('TAB1-CONSOLE', text.slice(0, 300));
        }
    });

    log('TAB1', 'Login →', BASE);
    await page1.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page1.waitForSelector('#username', { timeout: 30000 });
    await page1.fill('#username', ARGS.user);
    await page1.fill('#password', ARGS.pass);
    await page1.locator('#password').press('Enter');
    await page1
        .waitForFunction(
            () =>
                !/\/n2store\/?$|\/n2store\/index\.html$/.test(location.href) ||
                !!localStorage.getItem('loginindex_auth'),
            { timeout: 30_000 }
        )
        .catch(() => {});

    log('TAB1', 'Navigate orders-report');
    await page1.goto(`${ORDERS}?t=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    // KHÔNG chờ networkidle — WebSocket giữ network active vĩnh viễn → never idle.
    // Chỉ chờ DOM + 3s buffer cho app boot script chạy.
    await page1.waitForTimeout(3000);

    // ── Tab 2: TPOS (mở SONG SONG, không block) ─────────────────
    const page2 = await ctx.newPage();
    log('TAB2', 'Navigate TPOS:', ARGS.tposUrl);
    page2.goto(ARGS.tposUrl, { waitUntil: 'domcontentloaded' }).catch((e) => {
        log('TAB2', 'nav warn:', e.message);
    });

    // Inject WS hook trong tab 1 để log frames RAW (defensive — playwright WS ở trên đã catch
    // nhưng inject thêm để chắc chắn không miss frame nào).
    await page1.evaluate(() => {
        if (window.__wsHookInstalled) return;
        window.__wsHookInstalled = true;
        const NativeWS = window.WebSocket;
        window.WebSocket = function (url, protocols) {
            const ws = new NativeWS(url, protocols);
            console.log('[WS-HOOK] new WebSocket', url);
            ws.addEventListener('message', (ev) => {
                try {
                    const o = JSON.parse(ev.data);
                    if (o.type && o.type.startsWith('tpos:')) {
                        console.log('[TPOS-RT][WS-HOOK]', o.type, JSON.stringify(o).slice(0, 400));
                    }
                } catch {}
            });
            return ws;
        };
        window.WebSocket.prototype = NativeWS.prototype;
    });

    log('TAB1', '✅ Ready — orders-report loaded, WS monitor active');

    log('TAB2', '⚠ Tự login TPOS (nvkt/Aa@123456789) nếu chưa, sau đó thao tác đổi status invoice');
    log('=====', '');
    log('TEST', 'Cả 2 tab đã mở. Khi đổi status trên TPOS (tab 2):');
    log('TEST', '  1. WebSocket tab 1 sẽ nhận `tpos:invoice-update` event');
    log('TEST', '  2. [TPOS-RT] console log fetch FastSaleOrder OData by invoice Number');
    log('TEST', '  3. InvoiceStatusStore.set() → re-render PBH cell trong table');
    log('TEST', '  Quan sát log [WS-RECV] và [TAB1-CONSOLE] ở terminal');
    log('=====', '');

    // Periodic check: liệt kê current orders đang load và 1 invoice mẫu để user dễ test
    setTimeout(async () => {
        try {
            const sample = await page1.evaluate(() => {
                const frame = document.querySelector('iframe[src*="tab1-orders"]')?.contentWindow;
                if (!frame) return { ok: false, reason: 'no iframe' };
                const all = frame.allData || [];
                const withInv = all
                    .filter((o) => {
                        const inv = frame.InvoiceStatusStore?.get?.(o.Id);
                        return inv && inv.Number;
                    })
                    .slice(0, 5)
                    .map((o) => {
                        const inv = frame.InvoiceStatusStore.get(o.Id);
                        return {
                            code: o.Code,
                            invoiceNumber: inv.Number,
                            invoiceState: inv.ShowState || inv.State,
                            partner: o.Name?.slice(0, 30),
                        };
                    });
                return {
                    ok: true,
                    totalOrders: all.length,
                    sampleWithInvoice: withInv,
                    storeSize: frame.InvoiceStatusStore?._data?.size || 0,
                };
            });
            log('TAB1-STATE', JSON.stringify(sample, null, 2));
        } catch (e) {
            log('TAB1-STATE', 'err:', e.message);
        }
    }, 8000);

    // Hold open — user tương tác bằng tay; Ctrl+C để thoát
    process.on('SIGINT', async () => {
        log('BOOT', 'Closing browser…');
        await browser.close();
        process.exit(0);
    });

    log('BOOT', 'Browser open. Ctrl+C để thoát.');
})();
