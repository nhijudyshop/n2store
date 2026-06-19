#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Visit TPOS post page với token từ serect file, ghi lại network traffic
// để hiểu cách TPOS load comments cũ hiệu quả.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function readSecret() {
    const txt = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf8');
    const find = (key) => {
        const re = new RegExp(`^${key}\\s*[:=]?\\s*(.+)$`, 'm');
        const m = txt.match(re);
        return m ? m[1].trim() : null;
    };
    return {
        access: find('TPOS_ACCESS_TOKEN'),
        refresh: find('TPOS_REFRESH_TOKEN'),
        clientId: find('13/TPOS_CLIENT_ID')?.split(':').pop()?.trim() || 'tmtWebApp',
        companyId: find('TPOS_COMPANY_ID') || '1',
        username: 'nvkt',
    };
}

(async () => {
    const sec = readSecret();
    if (!sec.access) throw new Error('TPOS_ACCESS_TOKEN not found');
    console.log('Token len:', sec.access.length, 'clientId:', sec.clientId);

    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    // Capture ALL network — tpos.vn + chatomni
    const reqs = [];
    page.on('request', (r) => {
        const url = r.url();
        if (url.includes('tpos.vn') || url.includes('chatomni') || url.includes('facebook')) {
            reqs.push({
                method: r.method(),
                url: url.slice(0, 300),
                ts: Date.now(),
            });
        }
    });
    page.on('response', (r) => {
        const url = r.url();
        const matching = reqs.find((x) => x.url === url.slice(0, 300) && !x.status);
        if (matching) {
            matching.status = r.status();
            matching.respTs = Date.now();
        }
    });

    // Inject localStorage TOKENS trước khi load
    await ctx.addInitScript(({ access, refresh, companyId, username, clientId }) => {
        try {
            localStorage.setItem('accessToken', access);
            localStorage.setItem('refreshToken', refresh);
            localStorage.setItem('companyId', companyId);
            localStorage.setItem('userName', username);
            localStorage.setItem('clientId', clientId);
            localStorage.setItem('tenantId', 'tomato.tpos.vn');
        } catch {}
    }, sec);

    const t0 = Date.now();
    console.log('Step 1: load home để login...');
    await page.goto('https://tomato.tpos.vn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
    console.log('After home load:', page.url(), `(${Date.now() - t0}ms)`);

    console.log('Step 2: navigate to post hash...');
    const postHash = '#/app/saleOnline/facebook/post/270136663390370_26674599978878871/false';
    // Trigger hash change via JS (more reliable than goto for SPA)
    await page.evaluate((h) => {
        location.hash = h;
    }, postHash);
    await page.waitForTimeout(25000);
    console.log('Final URL:', page.url());
    console.log(`after 25s wait. ${reqs.length} API requests captured.`);

    // Analyze unique endpoints
    const byEndpoint = {};
    for (const r of reqs) {
        const u = r.url.replace(/\?.*$/, ''); // strip query
        const key = `${r.method} ${u.replace('https://tomato.tpos.vn/api/', '')}`;
        byEndpoint[key] = (byEndpoint[key] || 0) + 1;
    }
    console.log('\n=== Unique API endpoints called: ===');
    Object.entries(byEndpoint)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .forEach(([k, v]) => console.log(`  ${v}× ${k}`));

    // Show FULL URLs of comment-related calls (chatomni + facebook-graph/comment)
    console.log('\n=== Comment endpoints (FULL URL với query params): ===');
    reqs.filter(
        (r) =>
            r.url.includes('chatomni/v1/users/dictionarybytimestamp') ||
            r.url.includes('facebook-graph/comment') ||
            r.url.includes('facebookpost/get_saved_by_ids') ||
            r.url.includes('facebook/getactivitybypost')
    ).forEach((r) => {
        console.log(`[${r.status || '...'}] ${r.method} ${r.url}`);
    });

    // Snapshot current DOM after load → comment count
    const domInfo = await page.evaluate(() => ({
        commentRows: document.querySelectorAll('[class*="comment"], [class*="Comment"]').length,
        loadMoreBtn: !!document.querySelector('[class*="load-more"], [class*="LoadMore"]'),
        pagination: document.querySelectorAll('[class*="paginat"], [class*="Paginat"]').length,
        title: document.title,
    }));
    console.log('\n=== DOM after load: ===');
    console.log(JSON.stringify(domInfo, null, 2));

    await page.waitForTimeout(5000);
    await browser.close();
})().catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
});
