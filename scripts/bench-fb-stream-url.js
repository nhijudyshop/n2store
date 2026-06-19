#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Test yt-dlp lấy URL stream của FB live đang chạy + check:
//   - HLS hay DASH?
//   - URL có CORS không (browser fetch được không)?
//   - <video> element play được không?

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const execFileP = util.promisify(execFile);

const { chromium } = require('playwright');

async function ytdlpFormats(url) {
    // Use bundled yt-dlp from npm package
    const ytdlp = require('youtube-dl-exec').create(
        path.join(__dirname, '..', 'render.com', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp')
    );
    try {
        const result = await ytdlp(url, {
            listFormats: true,
            noWarnings: true,
            noCheckCertificate: true,
        });
        return typeof result === 'string' ? result : result.stdout || '';
    } catch (e) {
        return 'ERR: ' + (e.message || e).slice(0, 500);
    }
}

async function ytdlpGetUrl(url, format) {
    const ytdlp = require('youtube-dl-exec').create(
        path.join(__dirname, '..', 'render.com', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp')
    );
    try {
        const result = await ytdlp(url, {
            getUrl: true,
            format,
            noWarnings: true,
            noCheckCertificate: true,
        });
        return (typeof result === 'string' ? result : result.stdout || '').trim().split('\n')[0];
    } catch (e) {
        return null;
    }
}

(async () => {
    // 1 live đang chạy (cần user xác nhận, dùng store live mới nhất)
    const livePostId = '270136663390370_26674599978878871';
    const fbUrl = `https://www.facebook.com/270136663390370/videos/26674599978878871/`;
    console.log('FB URL:', fbUrl);

    console.log('\n=== yt-dlp list formats ===');
    const formats = await ytdlpFormats(fbUrl);
    console.log(formats.slice(0, 2000));

    console.log('\n=== Try HLS format ===');
    for (const f of ['bestvideo[protocol=m3u8]', 'best[ext=mp4]', 'best[protocol*=hls]', 'best']) {
        const u = await ytdlpGetUrl(fbUrl, f);
        console.log(`  format=${f.padEnd(30)} → ${u ? u.slice(0, 120) : 'null'}`);
    }

    // Test play in browser
    console.log('\n=== Browser: test play với <video> + HLS.js ===');
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const m3u8 = await ytdlpGetUrl(fbUrl, 'best');
    console.log('Using URL:', m3u8 ? m3u8.slice(0, 100) : 'null');
    if (!m3u8) {
        await browser.close();
        return;
    }

    // Simple HTML with HLS.js cdn
    await page.setContent(`
        <html><head><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script></head>
        <body style="background:#000;margin:0;">
            <video id="v" controls muted autoplay playsinline style="width:100%;height:100vh;background:#000;"></video>
            <div id="log" style="color:#fff;position:fixed;top:0;left:0;background:rgba(0,0,0,0.7);padding:8px;font-family:monospace;font-size:11px;max-width:90vw;"></div>
            <script>
                const url = ${JSON.stringify(m3u8)};
                const v = document.getElementById('v');
                const log = (m) => { document.getElementById('log').innerHTML += m + '<br>'; console.log(m); };
                log('URL: ' + url.slice(0, 80) + '...');
                if (url.includes('.mpd') || url.includes('dash')) {
                    log('Detected DASH — need dash.js (not loaded)');
                } else if (window.Hls?.isSupported()) {
                    const h = new Hls();
                    h.loadSource(url);
                    h.attachMedia(v);
                    h.on(Hls.Events.MEDIA_ATTACHED, () => log('HLS attached'));
                    h.on(Hls.Events.MANIFEST_PARSED, (e, d) => log('Manifest parsed: ' + d.levels.length + ' qualities'));
                    h.on(Hls.Events.ERROR, (e, d) => log('HLS error: ' + d.type + ' / ' + d.details));
                } else {
                    v.src = url;
                }
            </script>
        </body></html>
    `);

    // Wait 15s để xem video play hay error
    await page.waitForTimeout(15000);
    const state = await page.evaluate(() => {
        const v = document.getElementById('v');
        return {
            videoW: v.videoWidth,
            videoH: v.videoHeight,
            readyState: v.readyState,
            paused: v.paused,
            currentTime: v.currentTime,
            errLog: document.getElementById('log').innerText,
        };
    });
    console.log('\nVideo state after 15s:');
    console.log(JSON.stringify(state, null, 2));

    console.log('\nBrowser kept alive 30s để bạn xem...');
    await page.waitForTimeout(30000);
    await browser.close();
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
