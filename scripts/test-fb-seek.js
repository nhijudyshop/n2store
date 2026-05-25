const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    try {
        await restoreLoginSession(ctx, { base: 'https://www.facebook.com' });
    } catch {}
    const page = await ctx.newPage();
    const url =
        'https://www.facebook.com/watch/live/?ref=watch_permalink&v=1003485565460369&t=6701';
    console.log('Opening:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Wait 10s for FB SPA render...');
    await page.waitForTimeout(10000);
    const videoInfo = await page.evaluate(() => {
        const v = document.querySelector('video');
        if (!v) return { found: false };
        return {
            found: true,
            currentTime: v.currentTime,
            duration: v.duration,
            paused: v.paused,
            src: (v.src || '').slice(0, 80),
        };
    });
    console.log('Video state:', JSON.stringify(videoInfo, null, 2));
    console.log('Final URL:', page.url());
    await page.waitForTimeout(10000);
    await browser.close();
})().catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
});
