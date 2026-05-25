const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');

const urls = [
    // 1. plugin video.php embed với t=
    'https://www.facebook.com/plugins/video.php?href=' +
        encodeURIComponent(
            'https://www.facebook.com/NhiJudyHouse.VietNam/videos/1003485565460369/'
        ) +
        '&t=6701&width=800&show_text=false',
    // 2. video page với start_time
    'https://www.facebook.com/NhiJudyHouse.VietNam/videos/1003485565460369/?start_time=6701',
    // 3. video page với lst (legacy)
    'https://www.facebook.com/NhiJudyHouse.VietNam/videos/1003485565460369/?lst=6701',
    // 4. URL fragment hash
    'https://www.facebook.com/NhiJudyHouse.VietNam/videos/1003485565460369/#t=6701',
    // 5. mobile site
    'https://m.facebook.com/NhiJudyHouse.VietNam/videos/1003485565460369/?t=6701',
];

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    try {
        await restoreLoginSession(ctx, { base: 'https://www.facebook.com' });
    } catch {}
    for (const url of urls) {
        const page = await ctx.newPage();
        console.log('\n=== Testing:', url.slice(0, 100));
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForTimeout(8000);
            const info = await page.evaluate(() => {
                const videos = Array.from(document.querySelectorAll('video'));
                return videos.map((v) => ({
                    currentTime: Math.round(v.currentTime),
                    duration: Math.round(v.duration || 0),
                    paused: v.paused,
                    w: v.videoWidth,
                }));
            });
            console.log('Final URL:', page.url().slice(0, 120));
            console.log('Videos:', JSON.stringify(info));
        } catch (e) {
            console.log('Error:', e.message);
        }
        await page.close();
    }
    await browser.close();
})().catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
});
