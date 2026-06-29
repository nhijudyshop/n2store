#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// BENCHMARK: load 50 comments của 1 live post cũ, qua 4 approaches.
// Đo: latency, status, comment count, có cursor next không.
//
// Approaches:
//   A. CF worker proxy: /facebook/comments (đường app đang dùng — fail 500)
//   B. TPOS direct: /api/facebook-graph/comment với TPOS access_token (cookie/header)
//   C. FB Graph direct với Pancake page_access_token (bypass mọi proxy)
//   D. Chatomni dictionarybytimestamp (user metadata, không phải comment text)

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
        username: 'nvkt',
        clientId: 'tmtWebApp',
        companyId: '1',
    };
}

// 1 post Store đã end (user nói trong log)
const POST = {
    pageId: '270136663390370',
    postId: '270136663390370_26674599978878871',
    name: 'NhiJudyStore — NJD Live (đã end)',
};

(async () => {
    const sec = readSecret();
    if (!sec.tposAccess) throw new Error('TPOS_ACCESS_TOKEN missing');

    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    // Inject TPOS localStorage tokens trước
    await ctx.addInitScript((s) => {
        try {
            localStorage.setItem('accessToken', s.tposAccess);
            localStorage.setItem('refreshToken', s.tposRefresh);
            localStorage.setItem('companyId', s.companyId);
            localStorage.setItem('userName', s.username);
            localStorage.setItem('clientId', s.clientId);
            localStorage.setItem('tenantId', 'tomato.tpos.vn');
        } catch {}
    }, sec);

    // Login vào TPOS để có session + cookies
    console.log('Login TPOS...');
    await page.goto('https://tomato.tpos.vn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
    console.log('Logged in?', page.url());

    // Cũng login vào n2store (Pancake token sẵn trong localStorage Pancake)
    console.log('Load n2store để có Pancake token...');
    await page.goto('https://nhijudy.store/live-chat/index.html', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    await page.waitForTimeout(15000);

    // Get Pancake page token cho pageId
    const pancakeToken = await page.evaluate(async (pageId) => {
        if (window.PancakeTokenManager?.getOrGeneratePageAccessToken) {
            try {
                return await window.PancakeTokenManager.getOrGeneratePageAccessToken(pageId);
            } catch (e) {
                return null;
            }
        }
        return null;
    }, POST.pageId);
    console.log('Pancake page token:', pancakeToken ? pancakeToken.slice(0, 30) + '...' : 'NULL');

    const results = [];

    // Helper: time + parse
    async function bench(name, urlOrFn) {
        const t0 = Date.now();
        try {
            const r = await page.evaluate(async (u) => {
                if (typeof u === 'string') {
                    const r = await fetch(u, { credentials: 'omit' });
                    let body = null;
                    try {
                        body = await r.json();
                    } catch {}
                    return { status: r.status, body };
                }
                return null;
            }, urlOrFn);
            const elapsed = Date.now() - t0;
            results.push({
                name,
                status: r?.status,
                elapsed,
                commentCount: Array.isArray(r?.body?.data)
                    ? r.body.data.length
                    : Array.isArray(r?.body)
                      ? r.body.length
                      : Array.isArray(r?.body?.value)
                        ? r.body.value.length
                        : 0,
                hasNext: !!(r?.body?.paging?.cursors?.after || r?.body?.paging?.next),
                error: r?.body?.error?.message || (r?.status >= 400 ? `HTTP ${r.status}` : null),
                sampleComment: r?.body?.data?.[0] || r?.body?.[0] || null,
            });
        } catch (e) {
            results.push({ name, error: String(e.message || e), elapsed: Date.now() - t0 });
        }
    }

    // A. CF worker proxy (app hiện tại)
    await bench(
        'A. CF worker /facebook/comments',
        `https://chatomni-proxy.nhijudyshop.workers.dev/facebook/comments?pageid=${POST.pageId}&postId=${POST.postId}&limit=50`
    );

    // B. TPOS direct (cookie session)
    await page.evaluate(async (url) => {
        // Pre-warm cookies bằng cách call vào trang TPOS trước
        try {
            await fetch('https://tomato.tpos.vn/api/account/logged', {
                credentials: 'include',
            });
        } catch {}
    });
    await bench(
        'B. TPOS direct facebook-graph/comment (session)',
        `https://tomato.tpos.vn/api/facebook-graph/comment?pageid=${POST.pageId}&postId=${POST.postId}&limit=50&order=reverse_chronological`
    );

    // C. FB Graph direct với Pancake token
    if (pancakeToken) {
        await bench(
            'C. FB Graph direct + Pancake page token',
            `https://graph.facebook.com/${POST.postId}/comments?access_token=${encodeURIComponent(pancakeToken)}&limit=50&order=reverse_chronological&fields=from%7Bid%2Cname%2Cpicture%7D%2Cid%2Cmessage%2Ccreated_time%2Cattachment`
        );
    } else {
        results.push({ name: 'C. FB Graph + Pancake', error: 'no Pancake token available' });
    }

    // D. TPOS chatomni dictionarybytimestamp (user metadata)
    await bench(
        'D. TPOS chatomni dictionarybytimestamp',
        `https://tomato.tpos.vn/api-ms/chatomni/v1/users/dictionarybytimestamp?channelId=${POST.pageId}&type=4&timestamp=`
    );

    // Print report
    console.log('\n\n========== BENCHMARK REPORT ==========');
    console.log(`Post: ${POST.name}`);
    console.log(`Page: ${POST.pageId}, Post: ${POST.postId}\n`);
    console.log(
        '| Approach                                          | Status | ms    | Comments | Next? | Error                    |'
    );
    console.log(
        '|---------------------------------------------------|--------|-------|----------|-------|--------------------------|'
    );
    for (const r of results) {
        const name = (r.name || '').slice(0, 48).padEnd(48);
        const status = String(r.status || '-').padEnd(6);
        const ms = String(r.elapsed || '-').padEnd(5);
        const count = String(r.commentCount || '-').padEnd(8);
        const next = (r.hasNext ? '✓' : '-').padEnd(5);
        const err = String(r.error || '')
            .slice(0, 24)
            .padEnd(24);
        console.log(`| ${name} | ${status} | ${ms} | ${count} | ${next} | ${err} |`);
    }

    // Show 1 sample comment từ winner
    console.log('\n=== Sample comment shape (first success): ===');
    const winner = results.find((r) => r.commentCount > 0);
    if (winner) {
        console.log(`Winner: ${winner.name}`);
        console.log(JSON.stringify(winner.sampleComment, null, 2).slice(0, 1500));
    } else {
        console.log('NO winner — tất cả approaches fail');
    }

    console.log('\nKeep browser alive cho debug. Ctrl+C khi xong.');
    await new Promise(() => {}); // never exit
})().catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
});
