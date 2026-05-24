#!/usr/bin/env node
// Test các nguồn cached khả thi cho comments của post đã xóa khỏi FB:
//   1. TPOS chatomni dictionarybytimestamp — user metadata (đã capture trước)
//   2. TPOS POST /rest/v1.0/facebookpost/get_saved_by_ids — "saved by IDs" (đáng nghi cache cached post + comments)
//   3. Pancake conversations/messages API (pages.fpage.com)
//   4. TPOS odata cho SaleOnline_Order theo postId (orders có thể chứa snippet comment)

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

// 2 stale posts
const POSTS = [
    { tag: 'House', pageId: '117267091364524', postId: '117267091364524_2463177567526727' },
    { tag: 'Store', pageId: '270136663390370', postId: '270136663390370_1308207941402207' },
];

(async () => {
    const sec = readSecret();
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await ctx.addInitScript((t) => {
        localStorage.setItem('accessToken', t);
        localStorage.setItem('clientId', 'tmtWebApp');
        localStorage.setItem('companyId', '1');
        localStorage.setItem('userName', 'nvkt');
        localStorage.setItem('tenantId', 'tomato.tpos.vn');
    }, sec.tposAccess);

    // Login TPOS để có session cookies
    await page.goto('https://tomato.tpos.vn/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    console.log('TPOS:', page.url());

    for (const P of POSTS) {
        console.log(`\n=========== ${P.tag} : ${P.postId} ===========`);

        // 1) facebookpost/get_saved_by_ids — POST body với postId
        const r1 = await page.evaluate(
            async ({ postId }) => {
                const t0 = Date.now();
                try {
                    const r = await fetch(
                        'https://tomato.tpos.vn/rest/v1.0/facebookpost/get_saved_by_ids',
                        {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: [postId] }),
                        }
                    );
                    const txt = await r.text();
                    let body = null;
                    try {
                        body = JSON.parse(txt);
                    } catch {}
                    return {
                        status: r.status,
                        ms: Date.now() - t0,
                        body: body ? JSON.stringify(body).slice(0, 400) : txt.slice(0, 400),
                    };
                } catch (e) {
                    return { error: e.message };
                }
            },
            { postId: P.postId }
        );
        console.log(`  1. get_saved_by_ids: status=${r1.status} ms=${r1.ms}`);
        console.log(`     body: ${r1.body}`);

        // 2) chatomni/v1/users/dictionarybytimestamp với channelId=pageId, type=4
        // (user info; comments có thể bao gồm message ở metadata)
        const r2 = await page.evaluate(
            async ({ pageId }) => {
                const t0 = Date.now();
                try {
                    const r = await fetch(
                        `https://tomato.tpos.vn/api-ms/chatomni/v1/users/dictionarybytimestamp?channelId=${pageId}&type=4&timestamp=`,
                        { credentials: 'include' }
                    );
                    const txt = await r.text();
                    let body = null;
                    try {
                        body = JSON.parse(txt);
                    } catch {}
                    const keys = body ? Object.keys(body).slice(0, 10) : [];
                    const sample = body ? JSON.stringify(body).slice(0, 300) : txt.slice(0, 300);
                    return { status: r.status, ms: Date.now() - t0, keys, sample };
                } catch (e) {
                    return { error: e.message };
                }
            },
            { pageId: P.pageId }
        );
        console.log(`  2. chatomni dictionarybytimestamp: status=${r2.status} ms=${r2.ms}`);
        console.log(`     keys: ${JSON.stringify(r2.keys)}`);
        console.log(`     sample: ${r2.sample}`);

        // 3) odata SaleOnline_Order qua PostId (orders chứa comment snippet)
        const r3 = await page.evaluate(
            async ({ postId }) => {
                const t0 = Date.now();
                try {
                    const r = await fetch(
                        `https://tomato.tpos.vn/odata/SaleOnline_Order?$filter=Facebook_PostId%20eq%20%27${postId}%27&$top=5&$select=Id,Code,Note,Facebook_CommentId,Facebook_ASUserId,Facebook_UserName`,
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
                        count: body?.value?.length || 0,
                        sample: body?.value?.[0],
                    };
                } catch (e) {
                    return { error: e.message };
                }
            },
            { postId: P.postId }
        );
        console.log(
            `  3. odata SaleOnline_Order: status=${r3.status} ms=${r3.ms} count=${r3.count}`
        );
        if (r3.sample) console.log(`     sample: ${JSON.stringify(r3.sample).slice(0, 300)}`);

        // 4) odata SaleOnline_FacebookComment (nếu TPOS có cache local)
        const r4 = await page.evaluate(
            async ({ postId }) => {
                const t0 = Date.now();
                try {
                    const r = await fetch(
                        `https://tomato.tpos.vn/odata/SaleOnline_FacebookComment?$filter=PostId%20eq%20%27${postId}%27&$top=5`,
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
                        count: body?.value?.length || 0,
                        sample: body?.value?.[0],
                        rawErr: r.status >= 400 ? txt.slice(0, 200) : null,
                    };
                } catch (e) {
                    return { error: e.message };
                }
            },
            { postId: P.postId }
        );
        console.log(
            `  4. odata SaleOnline_FacebookComment: status=${r4.status} ms=${r4.ms} count=${r4.count} err=${r4.rawErr || '-'}`
        );
        if (r4.sample) console.log(`     sample: ${JSON.stringify(r4.sample).slice(0, 300)}`);

        // 5) odata FacebookComment (variant)
        const r5 = await page.evaluate(
            async ({ postId }) => {
                const t0 = Date.now();
                try {
                    const r = await fetch(
                        `https://tomato.tpos.vn/odata/FacebookComment?$filter=PostId%20eq%20%27${postId}%27&$top=5`,
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
                        count: body?.value?.length || 0,
                        rawErr: r.status >= 400 ? txt.slice(0, 150) : null,
                    };
                } catch (e) {
                    return { error: e.message };
                }
            },
            { postId: P.postId }
        );
        console.log(
            `  5. odata FacebookComment: status=${r5.status} ms=${r5.ms} count=${r5.count} err=${r5.rawErr || '-'}`
        );

        // 6) odata FacebookPost theo Id (full post info có embed comments?)
        const r6 = await page.evaluate(
            async ({ postId }) => {
                const t0 = Date.now();
                try {
                    const r = await fetch(
                        `https://tomato.tpos.vn/odata/FacebookPost?$filter=Id%20eq%20%27${postId}%27&$top=1`,
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
                        count: body?.value?.length || 0,
                        sample: body?.value?.[0] ? Object.keys(body.value[0]).slice(0, 20) : null,
                        rawErr: r.status >= 400 ? txt.slice(0, 150) : null,
                    };
                } catch (e) {
                    return { error: e.message };
                }
            },
            { postId: P.postId }
        );
        console.log(`  6. odata FacebookPost: status=${r6.status} ms=${r6.ms} count=${r6.count}`);
        if (r6.sample) console.log(`     fields: ${JSON.stringify(r6.sample)}`);
        if (r6.rawErr) console.log(`     err: ${r6.rawErr}`);
    }

    console.log('\nDone. Browser kept alive.');
    await new Promise(() => {});
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
