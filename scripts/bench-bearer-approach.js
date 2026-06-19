#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Test TPOS với Authorization Bearer header (KHÔNG cần cookies/session).
// + FB Graph direct với 1 page token thử nghiệm.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function readSecret() {
    const txt = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf8');
    const find = (k) => {
        const m = txt.match(new RegExp(`^${k}\\s*[:=]?\\s*(.+)$`, 'm'));
        return m ? m[1].trim() : null;
    };
    return {
        tposAccess: find('TPOS_ACCESS_TOKEN'),
    };
}

const POSTS = [
    {
        tag: 'Store-WORKING',
        pageId: '270136663390370',
        postId: '270136663390370_26674599978878871',
    },
    { tag: 'House-FAIL', pageId: '117267091364524', postId: '117267091364524_2463177567526727' },
    { tag: 'Store-FAIL', pageId: '270136663390370', postId: '270136663390370_1308207941402207' },
];

(async () => {
    const sec = readSecret();
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('about:blank');

    // Test TPOS with Bearer Authorization (no cookies, no session)
    console.log('--- TPOS với Bearer header (no session) ---');
    for (const P of POSTS) {
        const r = await page.evaluate(
            async ({ pageId, postId, token }) => {
                const t0 = Date.now();
                try {
                    const r = await fetch(
                        `https://tomato.tpos.vn/api/facebook-graph/comment?pageid=${pageId}&postId=${postId}&limit=5&order=reverse_chronological`,
                        { headers: { Authorization: 'Bearer ' + token } }
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
                        err: body?.error?.message || (r.status >= 400 ? txt.slice(0, 150) : null),
                        hasAfter: !!body?.paging?.cursors?.after,
                    };
                } catch (e) {
                    return { error: e.message, ms: Date.now() - t0 };
                }
            },
            { pageId: P.pageId, postId: P.postId, token: sec.tposAccess }
        );
        console.log(
            `  ${P.tag.padEnd(15)}: status=${r.status || '-'} ms=${r.ms} count=${r.count || 0} after=${r.hasAfter ? 'Y' : 'N'} err=${r.err || '-'}`
        );
    }

    console.log('\n--- CF worker /facebook/comments ---');
    for (const P of POSTS) {
        const r = await page.evaluate(
            async ({ pageId, postId }) => {
                const t0 = Date.now();
                try {
                    const r = await fetch(
                        `https://chatomni-proxy.nhijudyshop.workers.dev/facebook/comments?pageid=${pageId}&postId=${postId}&limit=5`,
                        { credentials: 'omit' }
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
                        err: body?.error || (r.status >= 400 ? txt.slice(0, 100) : null),
                    };
                } catch (e) {
                    return { error: e.message, ms: Date.now() - t0 };
                }
            },
            { pageId: P.pageId, postId: P.postId }
        );
        console.log(
            `  ${P.tag.padEnd(15)}: status=${r.status || '-'} ms=${r.ms} count=${r.count || 0} err=${JSON.stringify(r.err) || '-'}`
        );
    }

    await browser.close();
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
