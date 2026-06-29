#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Reproduce slow load: vào nhijudy.store/tpos-pancake → chọn page "Tất cả"
// → chọn 2 campaign mới nhất → đo từng phase + dump network calls > 500ms.

const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');

const BASE = 'https://nhijudy.store';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await restoreLoginSession(ctx, { base: BASE });
    const page = await ctx.newPage();

    // Capture network với timing
    const reqs = [];
    page.on('request', (r) => {
        reqs.push({
            method: r.method(),
            url: r.url(),
            startedAt: Date.now(),
            startedFromNav: 0, // will set after nav starts
        });
    });
    page.on('response', (r) => {
        const m = reqs.find((x) => x.url === r.url() && !x.respAt);
        if (m) m.respAt = Date.now();
    });
    page.on('requestfailed', (r) => {
        const m = reqs.find((x) => x.url === r.url() && !x.respAt);
        if (m) m.failed = r.failure()?.errorText;
    });
    page.on('console', (msg) => {
        if (
            msg.text().includes('TPOS-API') ||
            msg.text().includes('PK-API') ||
            msg.text().includes('[snap')
        ) {
            console.log('[page]', msg.text().slice(0, 200));
        }
    });

    const phases = [];
    function phaseStart(name) {
        phases.push({ name, t0: Date.now() });
        console.log(`\n--- PHASE: ${name} ---`);
    }
    function phaseEnd() {
        const p = phases[phases.length - 1];
        p.elapsed = Date.now() - p.t0;
        console.log(`    [${p.name}] ${p.elapsed}ms`);
    }

    // PHASE 1: Load tpos-pancake từ đầu
    phaseStart('Load index.html → DOMContentLoaded');
    const navStart = Date.now();
    reqs.forEach((r) => (r.startedFromNav = r.startedAt - navStart));
    await page.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    phaseEnd();

    // PHASE 2: Wait for TPOS init done
    phaseStart('TPOS init (CRM teams, pages, campaigns)');
    await page.waitForFunction(() => window.TposState?.allPages?.length > 0, { timeout: 30000 });
    phaseEnd();

    // PHASE 3: Select "all" pages → trigger campaigns load
    phaseStart('Select page "Tất cả" → load campaigns');
    await page.evaluate(() => window.eventBus.emit('tpos:crmTeamChanged', 'all'));
    await page.waitForFunction(() => window.TposState?.liveCampaigns?.length > 0, {
        timeout: 30000,
    });
    phaseEnd();

    // PHASE 4: Get top-2 campaigns
    const top2 = await page.evaluate(() => {
        const camps = [...(window.TposState.liveCampaigns || [])]
            .sort((a, b) => new Date(b.DateCreated || 0) - new Date(a.DateCreated || 0))
            .slice(0, 2);
        return camps.map((c) => ({ id: c.Id, name: c.Name?.slice(0, 40) }));
    });
    console.log(`Top 2 campaigns: ${JSON.stringify(top2)}`);

    // PHASE 5: Select multi 2 campaigns → trigger loadComments
    phaseStart('Select 2 campaigns → loadComments');
    await page.evaluate(
        (ids) => {
            window.eventBus.emit('tpos:campaignsChanged', ids);
        },
        top2.map((c) => c.id)
    );
    // Wait for comments to populate
    await page.waitForFunction(() => (window.TposState?.comments?.length || 0) > 0, {
        timeout: 60000,
    });
    phaseEnd();

    // PHASE 6: Wait stable (extra 10s để xem có lag tail không)
    phaseStart('Settle 10s sau khi có comments');
    await page.waitForTimeout(10000);
    phaseEnd();

    const totalCommentsFinal = await page.evaluate(() => window.TposState?.comments?.length || 0);
    console.log(`\nFinal comments count: ${totalCommentsFinal}`);

    // Report top slow requests
    const slow = reqs
        .filter((r) => r.respAt && r.respAt - r.startedAt > 500)
        .map((r) => ({
            ms: r.respAt - r.startedAt,
            url: r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 130),
            method: r.method,
        }))
        .sort((a, b) => b.ms - a.ms);

    console.log(`\n========== TOP 30 SLOW REQUESTS (> 500ms) ==========`);
    console.log('| ms   | method | url');
    slow.slice(0, 30).forEach((r) => {
        console.log(`| ${String(r.ms).padStart(4)} | ${r.method.padEnd(6)} | ${r.url}`);
    });

    // Group by endpoint
    const byEndpoint = {};
    for (const r of reqs.filter((r) => r.respAt)) {
        const ep = r.url.replace(/\?.*/, '').replace(/^https?:\/\/[^/]+/, '');
        if (!byEndpoint[ep]) byEndpoint[ep] = { count: 0, totalMs: 0, max: 0 };
        const ms = r.respAt - r.startedAt;
        byEndpoint[ep].count++;
        byEndpoint[ep].totalMs += ms;
        if (ms > byEndpoint[ep].max) byEndpoint[ep].max = ms;
    }
    console.log(`\n========== ENDPOINTS GROUPED (top 20 by totalMs) ==========`);
    console.log('| count | totalMs | maxMs | endpoint');
    Object.entries(byEndpoint)
        .map(([ep, s]) => ({ ep, ...s }))
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, 20)
        .forEach((s) => {
            console.log(
                `| ${String(s.count).padStart(5)} | ${String(s.totalMs).padStart(7)} | ${String(s.max).padStart(5)} | ${s.ep.slice(0, 90)}`
            );
        });

    console.log(`\n========== PHASE TIMINGS ==========`);
    phases.forEach((p) => console.log(`  ${p.name}: ${p.elapsed}ms`));
    const total = phases.reduce((a, p) => a + p.elapsed, 0);
    console.log(`  TOTAL: ${total}ms`);

    console.log('\nKeep browser alive. Ctrl+C khi xong.');
    await new Promise(() => {});
})().catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
});
