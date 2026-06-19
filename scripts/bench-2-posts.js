#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Test 2 SPECIFIC posts user thấy 500 trong console log.
// So sánh 3 approach: CF worker / TPOS via TPOS-session-page / FB Graph direct.

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
        tposAccess: find('TPOS_ACCESS_TOKEN'),
        tposRefresh: find('TPOS_REFRESH_TOKEN'),
    };
}

// 2 posts user thấy 500 trong log session trước:
const POSTS = [
    { pageId: '117267091364524', postId: '117267091364524_2463177567526727', name: 'House' },
    { pageId: '270136663390370', postId: '270136663390370_1308207941402207', name: 'Store' },
];

(async () => {
    const sec = readSecret();
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await ctx.addInitScript((s) => {
        localStorage.setItem('accessToken', s.tposAccess);
        localStorage.setItem('refreshToken', s.tposRefresh);
        localStorage.setItem('clientId', 'tmtWebApp');
        localStorage.setItem('companyId', '1');
        localStorage.setItem('userName', 'nvkt');
        localStorage.setItem('tenantId', 'tomato.tpos.vn');
    }, sec);

    // Login TPOS
    await page.goto('https://tomato.tpos.vn/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    console.log('TPOS:', page.url());

    const results = [];

    for (const P of POSTS) {
        console.log(`\n=== Post ${P.name}: ${P.postId} ===`);
        // A. CF worker
        const a0 = Date.now();
        const a = await page.evaluate(async ({ pageId, postId }) => {
            try {
                const r = await fetch(
                    `https://chatomni-proxy.nhijudyshop.workers.dev/facebook/comments?pageid=${pageId}&postId=${postId}&limit=50`,
                    { credentials: 'omit' }
                );
                const txt = await r.text();
                let body = null;
                try {
                    body = JSON.parse(txt);
                } catch {}
                return {
                    status: r.status,
                    count: body?.data?.length || 0,
                    err: body?.error?.message || (r.status >= 400 ? txt.slice(0, 200) : null),
                };
            } catch (e) {
                return { error: e.message };
            }
        }, P);
        a.ms = Date.now() - a0;
        console.log(
            `  A. CF worker: status=${a.status} ms=${a.ms} count=${a.count} err=${a.err || '-'}`
        );

        // B. TPOS direct (same-origin from tomato.tpos.vn, with cookies)
        const b0 = Date.now();
        const b = await page.evaluate(async ({ pageId, postId }) => {
            try {
                const r = await fetch(
                    `https://tomato.tpos.vn/api/facebook-graph/comment?pageid=${pageId}&postId=${postId}&limit=50&order=reverse_chronological&live_filter=no_filter`,
                    { credentials: 'include' }
                );
                const txt = await r.text();
                let body = null;
                try {
                    body = JSON.parse(txt);
                } catch {}
                return {
                    status: r.status,
                    count: body?.data?.length || 0,
                    err: body?.error?.message || (r.status >= 400 ? txt.slice(0, 200) : null),
                    hasAfter: !!body?.paging?.cursors?.after,
                    sample: body?.data?.[0],
                };
            } catch (e) {
                return { error: e.message };
            }
        }, P);
        b.ms = Date.now() - b0;
        console.log(
            `  B. TPOS direct: status=${b.status} ms=${b.ms} count=${b.count} afterCursor=${b.hasAfter ? 'Y' : 'N'} err=${b.err || '-'}`
        );

        // C. Pagination test on B (get next 50)
        if (b.hasAfter) {
            const c0 = Date.now();
            const cTest = await page.evaluate(async ({ pageId, postId }) => {
                const r1 = await fetch(
                    `https://tomato.tpos.vn/api/facebook-graph/comment?pageid=${pageId}&postId=${postId}&limit=50&order=reverse_chronological&live_filter=no_filter`,
                    { credentials: 'include' }
                );
                const j1 = await r1.json();
                const after = j1?.paging?.cursors?.after;
                if (!after) return { error: 'no after' };
                const r2 = await fetch(
                    `https://tomato.tpos.vn/api/facebook-graph/comment?pageid=${pageId}&postId=${postId}&limit=50&order=reverse_chronological&live_filter=no_filter&after=${encodeURIComponent(after)}`,
                    { credentials: 'include' }
                );
                const j2 = await r2.json();
                return { status: r2.status, count: j2?.data?.length || 0 };
            }, P);
            cTest.ms = Date.now() - c0;
            console.log(
                `  C. TPOS pagination 2nd batch: status=${cTest.status} ms=${cTest.ms} count=${cTest.count}`
            );
        }

        results.push({ post: P.postId, name: P.name, a, b });
    }

    console.log('\n\n========== SUMMARY ==========');
    console.log('| Post  | CF worker        | TPOS direct                |');
    console.log('|-------|------------------|----------------------------|');
    for (const r of results) {
        const a = `${r.a.status} ${r.a.ms}ms n=${r.a.count}`.padEnd(16);
        const b =
            `${r.b.status} ${r.b.ms}ms n=${r.b.count} after=${r.b.hasAfter ? 'Y' : 'N'}`.padEnd(26);
        console.log(`| ${r.name.padEnd(5)} | ${a} | ${b} |`);
    }

    console.log('\nKeep browser alive. Ctrl+C to exit.');
    await new Promise(() => {});
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
