#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Load n2store, get Pancake page tokens, test FB Graph direct cho 2 fail posts.

const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');

const POSTS = [
    { tag: 'House-FAIL', pageId: '117267091364524', postId: '117267091364524_2463177567526727' },
    { tag: 'Store-FAIL', pageId: '270136663390370', postId: '270136663390370_1308207941402207' },
    { tag: 'Store-WORK', pageId: '270136663390370', postId: '270136663390370_26674599978878871' },
];

(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    await restoreLoginSession(ctx, { base: 'https://nhijudy.store' });
    const page = await ctx.newPage();

    console.log('Load n2store (cần thời gian load Pancake token)...');
    await page.goto('https://nhijudy.store/live-chat/index.html', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    // Wait for PancakeTokenManager + tokens loaded
    await page
        .waitForFunction(
            () =>
                window.PancakeTokenManager &&
                Object.keys(window.PancakeTokenManager.pageAccessTokens || {}).length > 0,
            { timeout: 30000 }
        )
        .catch(() => console.log('Timeout waiting Pancake tokens'));
    await page.waitForTimeout(5000);

    const tokens = await page.evaluate(() => ({
        keys: Object.keys(window.PancakeTokenManager?.pageAccessTokens || {}),
        // Don't print actual tokens
    }));
    console.log('Pancake page tokens loaded for:', tokens.keys);

    for (const P of POSTS) {
        const token = await page.evaluate(
            async (pageId) =>
                window.PancakeTokenManager?.pageAccessTokens?.[pageId] ||
                (await window.PancakeTokenManager?.getOrGeneratePageAccessToken?.(pageId)),
            P.pageId
        );
        if (!token) {
            console.log(`  ${P.tag}: NO TOKEN`);
            continue;
        }
        const r = await page.evaluate(
            async ({ postId, token }) => {
                const t0 = Date.now();
                try {
                    const r = await fetch(
                        `https://graph.facebook.com/${postId}/comments?access_token=${encodeURIComponent(token)}&limit=5&order=reverse_chronological&fields=from%7Bid%2Cname%7D%2Cid%2Cmessage%2Ccreated_time`,
                        { credentials: 'omit' }
                    );
                    const body = await r.json().catch(() => null);
                    return {
                        status: r.status,
                        ms: Date.now() - t0,
                        count: body?.data?.length || 0,
                        err: body?.error?.message,
                        hasNext: !!body?.paging?.cursors?.after,
                    };
                } catch (e) {
                    return { error: e.message };
                }
            },
            { postId: P.postId, token }
        );
        console.log(
            `  ${P.tag.padEnd(13)}: status=${r.status || '-'} ms=${r.ms} count=${r.count || 0} after=${r.hasNext ? 'Y' : 'N'} err=${r.err || '-'}`
        );
    }

    await browser.close();
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
