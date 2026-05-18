// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// One-shot: đếm số phiếu "Hoàn thành đối soát" KHÔNG có badge THÀNH PHỐ/NAP/TOMATO.
// Usage: node scripts/check-pbh-badges.js [--base http://localhost:8080]

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { ensureLocalServer } = require('./lib/ensure-local-server.js');

const args = process.argv.slice(2);
let base = 'http://localhost:8080';
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base') base = args[i + 1];
}

(async () => {
    if (base.startsWith('http://localhost')) {
        await ensureLocalServer(base);
    }

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Login (mirrors scripts/n2store-browser-session.js)
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#username', { timeout: 15000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin@@');
    await page.locator('#password').press('Enter');
    await page
        .waitForFunction(
            () =>
                !/\/n2store\/?$|\/n2store\/index\.html$/.test(location.href) ||
                !!localStorage.getItem('loginindex_auth'),
            { timeout: 30000 }
        )
        .catch(() => {});

    console.log('[DEBUG] post-login URL:', page.url());
    // Đợi auth token settle
    await page
        .waitForFunction(() => !!localStorage.getItem('loginindex_auth'), {
            timeout: 15000,
        })
        .catch(() => {});

    await page.goto(`${base}/orders-report/main.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    console.log('[DEBUG] post-nav URL:', page.url());
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    console.log('[DEBUG] post-networkidle URL:', page.url());

    // Đợi tab1 iframe load + bảng + delivery groups fetch xong
    // tab1-orders iframe có data-src lazy → đã loaded mặc định tab Quản lý Đơn hàng
    await page.waitForSelector('#ordersFrame', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Debug: list all frames
    const frames = page.frames();
    console.log(`[DEBUG] frames: ${frames.length}`);
    for (const f of frames) {
        const cnt = await f
            .evaluate(() => document.querySelectorAll('tr[data-order-id]').length)
            .catch(() => -1);
        console.log(`  url=${f.url().slice(0, 100)} rows=${cnt}`);
    }

    const frame = frames.find((f) => /tab1-orders\.html/i.test(f.url())) || page.mainFrame();

    await frame
        .waitForFunction(() => document.querySelectorAll('tr[data-order-id]').length > 0, {
            timeout: 60000,
        })
        .catch(() => {});
    await frame.waitForTimeout(15000);

    const stats = await frame.evaluate(() => {
        const rows = document.querySelectorAll('tr[data-order-id]');
        const result = {
            totalRows: rows.length,
            completed: 0,
            withBadge: { 'THÀNH PHỐ': 0, NAP: 0, TOMATO: 0 },
            noBadge: [],
            carrierBreakdown: {},
        };
        rows.forEach((r) => {
            const cell = r.querySelector('.invoice-status-cell') || r.querySelector('td');
            const txt = r.textContent || '';
            if (!txt.includes('Hoàn thành đối soát')) return;
            result.completed++;
            const badge = r.querySelector('.invoice-delivery-group-badge');
            if (badge) {
                const label = badge.textContent.trim();
                result.withBadge[label] = (result.withBadge[label] || 0) + 1;
            } else {
                const stt =
                    r.querySelector('.col-stt, td[data-col="stt"]')?.textContent?.trim() ||
                    r.children[1]?.textContent?.trim() ||
                    r.children[0]?.textContent?.trim();
                const orderId = r.getAttribute('data-order-id');
                // Try to grab Number + Carrier from any debug attribute
                result.noBadge.push({ stt, orderId });
            }
        });
        return result;
    });

    const outFile = path.join(process.cwd(), 'downloads/n2store-session/check-pbh-badges.json');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(stats, null, 2));
    console.log(JSON.stringify(stats, null, 2));
    console.log(`\n→ Saved: ${outFile}`);

    await browser.close();
})().catch((e) => {
    console.error('FAIL:', e);
    process.exit(1);
});
