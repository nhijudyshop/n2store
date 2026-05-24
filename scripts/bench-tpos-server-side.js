#!/usr/bin/env node
// Test TPOS endpoints SERVER-SIDE (như Render gọi) — không qua browser/CORS.
// Token Bearer trong header, không cần session cookies.

const fs = require('fs');
const path = require('path');

function readSecret() {
    const txt = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf8');
    const m = txt.match(/^TPOS_ACCESS_TOKEN\s*[:=]?\s*(.+)$/m);
    return m ? m[1].trim() : null;
}

const TOKEN = readSecret();
const HEADERS = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://tomato.tpos.vn',
    Referer: 'https://tomato.tpos.vn/',
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
};

const POSTS = [
    { tag: 'House', pageId: '117267091364524', postId: '117267091364524_2463177567526727' },
    { tag: 'Store', pageId: '270136663390370', postId: '270136663390370_1308207941402207' },
];

async function test(name, url, options = {}) {
    const t0 = Date.now();
    try {
        const r = await fetch(url, { headers: HEADERS, ...options });
        const txt = await r.text();
        let body = null;
        try {
            body = JSON.parse(txt);
        } catch {}
        const out = {
            status: r.status,
            ms: Date.now() - t0,
            count:
                body?.value?.length ??
                body?.data?.length ??
                (Array.isArray(body) ? body.length : 0),
        };
        if (r.status >= 400) out.err = txt.slice(0, 200);
        else out.sample = body?.value?.[0] || body?.data?.[0] || body;
        return out;
    } catch (e) {
        return { error: e.message, ms: Date.now() - t0 };
    }
}

(async () => {
    if (!TOKEN) throw new Error('No TPOS token');
    console.log('Token len:', TOKEN.length, '\n');

    for (const P of POSTS) {
        console.log(`========== ${P.tag} : ${P.postId} ==========`);

        const r1 = await test(
            '1. get_saved_by_ids',
            'https://tomato.tpos.vn/rest/v1.0/facebookpost/get_saved_by_ids',
            {
                method: 'POST',
                body: JSON.stringify({ ids: [P.postId] }),
            }
        );
        console.log(
            `  1. get_saved_by_ids POST: status=${r1.status} ms=${r1.ms} count=${r1.count} err=${r1.err || '-'}`
        );
        if (r1.sample) console.log(`     sample: ${JSON.stringify(r1.sample).slice(0, 300)}`);

        const r2 = await test(
            '2. SaleOnline_Order by PostId',
            `https://tomato.tpos.vn/odata/SaleOnline_Order?$filter=Facebook_PostId%20eq%20%27${P.postId}%27&$top=5&$select=Id,Code,Note,Facebook_CommentId,Facebook_ASUserId,Facebook_UserName,Facebook_PostId,DateCreated`
        );
        console.log(
            `  2. SaleOnline_Order: status=${r2.status} ms=${r2.ms} count=${r2.count} err=${r2.err || '-'}`
        );
        if (r2.sample) console.log(`     sample: ${JSON.stringify(r2.sample).slice(0, 400)}`);

        // 3. Search orders by Facebook_LiveId-like
        const r3 = await test(
            '3. facebook-graph/post/info',
            `https://tomato.tpos.vn/api/facebook-graph/post/info?pageid=${P.pageId}&postId=${P.postId}`
        );
        console.log(`  3. post/info: status=${r3.status} ms=${r3.ms} err=${r3.err || '-'}`);
        if (r3.sample) console.log(`     sample: ${JSON.stringify(r3.sample).slice(0, 300)}`);

        // 4. odata SaleOnline_LiveCampaign trying different filter on Id matching campaign
        const r4 = await test(
            '4. SaleOnline_LiveCampaign by post',
            `https://tomato.tpos.vn/odata/SaleOnline_LiveCampaign?$filter=Facebook_LiveId%20eq%20%27${P.postId}%27&$top=1`
        );
        console.log(
            `  4. LiveCampaign by PostId: status=${r4.status} ms=${r4.ms} count=${r4.count}`
        );

        // 5. facebookpost/get_full_orders (chatomni order with full comment text)
        const r5 = await test(
            '5. chatomni orders-by-post',
            `https://tomato.tpos.vn/api-ms/chatomni/v1/orders/by-post?postId=${P.postId}&top=5`
        );
        console.log(
            `  5. chatomni orders-by-post: status=${r5.status} ms=${r5.ms} count=${r5.count} err=${r5.err || '-'}`
        );

        // 6. facebookpost/get_full_message_by_postid (may exist)
        const r6 = await test(
            '6. facebookpost/get_full_message_by_postid',
            `https://tomato.tpos.vn/api-ms/chatomni/v1/posts/${P.postId}/messages`
        );
        console.log(
            `  6. posts/{id}/messages: status=${r6.status} ms=${r6.ms} count=${r6.count} err=${r6.err || '-'}`
        );

        // 7. Search SaleOnline_Order Notes (orders chứa Note = comment message)
        // Đếm tổng để biết có bao nhiêu order từ post này (proxy cho comments)
        const r7 = await test(
            '7. SaleOnline_Order count by PostId',
            `https://tomato.tpos.vn/odata/SaleOnline_Order/$count?$filter=Facebook_PostId%20eq%20%27${P.postId}%27`
        );
        console.log(
            `  7. SaleOnline_Order $count: status=${r7.status} ms=${r7.ms} (count is body text)`
        );

        console.log('');
    }
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
