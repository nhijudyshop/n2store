#!/usr/bin/env node
// Test xem param &live_filter=no_filter có fix 400 cho 2 fail posts không.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function readSecret() {
    const txt = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf8');
    const m = txt.match(/^TPOS_ACCESS_TOKEN\s*[:=]?\s*(.+)$/m);
    return m ? m[1].trim() : null;
}

const POSTS = [
    { tag: 'Store-WORK', pageId: '270136663390370', postId: '270136663390370_26674599978878871' },
    { tag: 'House-FAIL', pageId: '117267091364524', postId: '117267091364524_2463177567526727' },
    { tag: 'Store-FAIL', pageId: '270136663390370', postId: '270136663390370_1308207941402207' },
];

(async () => {
    const token = readSecret();
    if (!token) throw new Error('No TPOS token');

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Login để có session cookies (Bearer alone may fail CORS preflight from cross-origin)
    await ctx.addInitScript((t) => {
        localStorage.setItem('accessToken', t);
        localStorage.setItem('clientId', 'tmtWebApp');
        localStorage.setItem('companyId', '1');
        localStorage.setItem('userName', 'nvkt');
        localStorage.setItem('tenantId', 'tomato.tpos.vn');
    }, token);
    await page.goto('https://tomato.tpos.vn/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    console.log('Test với live_filter=no_filter (mới):');
    for (const P of POSTS) {
        const r = await page.evaluate(
            async ({ pageId, postId, useFilter }) => {
                const t0 = Date.now();
                const filterParam = useFilter ? '&live_filter=no_filter' : '';
                try {
                    const r = await fetch(
                        `https://tomato.tpos.vn/api/facebook-graph/comment?pageid=${pageId}&facebook_type=Page&postId=${postId}&limit=5&order=reverse_chronological${filterParam}`,
                        { credentials: 'include' }
                    );
                    const txt = await r.text();
                    let body = null;
                    try {
                        body = JSON.parse(txt);
                    } catch {}
                    return {
                        status: r.status,
                        ms: Date.now() - t0,
                        count: body?.data?.length || 0,
                        err: body?.error?.message || (r.status >= 400 ? txt.slice(0, 100) : null),
                        hasAfter: !!body?.paging?.cursors?.after,
                    };
                } catch (e) {
                    return { error: e.message, ms: Date.now() - t0 };
                }
            },
            { pageId: P.pageId, postId: P.postId, useFilter: true }
        );
        console.log(
            `  WITH filter    ${P.tag.padEnd(12)}: status=${r.status} ms=${r.ms} count=${r.count} after=${r.hasAfter ? 'Y' : 'N'} err=${r.err || '-'}`
        );
        // Compare without
        const r2 = await page.evaluate(
            async ({ pageId, postId }) => {
                const t0 = Date.now();
                try {
                    const r = await fetch(
                        `https://tomato.tpos.vn/api/facebook-graph/comment?pageid=${pageId}&facebook_type=Page&postId=${postId}&limit=5&order=reverse_chronological`,
                        { credentials: 'include' }
                    );
                    const txt = await r.text();
                    let body = null;
                    try {
                        body = JSON.parse(txt);
                    } catch {}
                    return {
                        status: r.status,
                        ms: Date.now() - t0,
                        count: body?.data?.length || 0,
                        err: body?.error?.message || (r.status >= 400 ? txt.slice(0, 100) : null),
                    };
                } catch (e) {
                    return { error: e.message };
                }
            },
            { pageId: P.pageId, postId: P.postId }
        );
        console.log(
            `  WITHOUT filter ${P.tag.padEnd(12)}: status=${r2.status} ms=${r2.ms} count=${r2.count} err=${r2.err || '-'}`
        );
    }

    await browser.close();
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
