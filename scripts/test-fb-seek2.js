// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    try {
        await restoreLoginSession(ctx, { base: 'https://www.facebook.com' });
    } catch {}
    const page = await ctx.newPage();
    // Test with start= param directly (avoid redirect)
    const url = 'https://www.facebook.com/NhiJudyHouse.VietNam/videos/1003485565460369/?start=6701';
    console.log('Opening:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(12000);
    const videoInfo = await page.evaluate(() => {
        const vids = Array.from(document.querySelectorAll('video'));
        return vids.map((v) => ({
            currentTime: v.currentTime,
            duration: v.duration,
            paused: v.paused,
            w: v.videoWidth,
            h: v.videoHeight,
        }));
    });
    console.log('Videos found:', JSON.stringify(videoInfo, null, 2));
    console.log('Final URL:', page.url());
    await page.waitForTimeout(8000);
    await browser.close();
})().catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
});
