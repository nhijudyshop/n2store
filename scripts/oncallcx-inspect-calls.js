#!/usr/bin/env node
// Inspect pbxCalls.xhtml — tìm bảng call + link audio

const fs = require('fs');
const path = require('path');
const SECRETS_FILE = path.resolve(__dirname, '..', 'serect_dont_push.txt');

(async () => {
    const { chromium } = require('playwright');
    const content = fs.readFileSync(SECRETS_FILE, 'utf8');
    const line = content
        .split('\n')
        .find((l) => l.includes('pbx-ucaas.oncallcx.vn') && !l.includes('PBX_HOST'));
    const after = line.replace(/^\s*\d+\/?\s*/, '').replace(/"[^"]*"\s*/, '');
    const parts = after.trim().split(/\s+/);
    const creds = { username: parts[0], password: parts.slice(1).join(' ') };

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();

    const audio = [];
    page.on('response', async (r) => {
        const ct = (r.headers()['content-type'] || '').toLowerCase();
        if (/audio|wav|mp3/.test(ct) || /\.(wav|mp3|ogg|m4a)(\?|$)/i.test(r.url())) {
            audio.push({
                url: r.url(),
                status: r.status(),
                ct,
                size: r.headers()['content-length'],
            });
        }
    });

    await page.goto('https://pbx-ucaas.oncallcx.vn/portal/login.xhtml', {
        waitUntil: 'networkidle',
    });
    await page.locator('input[type="text"]').first().fill(creds.username);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.locator('button[type="submit"], input[type="submit"]').first().click(),
    ]);
    await page.waitForTimeout(2000);

    await page.goto('https://pbx-ucaas.oncallcx.vn/portal/pbxCalls.xhtml', {
        waitUntil: 'networkidle',
    });
    await page.waitForTimeout(3000);
    console.log('URL:', page.url(), '| title:', await page.title());

    const html = await page.content();
    fs.writeFileSync(path.resolve(__dirname, '..', 'docs', 'oncallcx-pbxCalls.html'), html);

    // Tìm bảng data
    const tables = await page.evaluate(() => {
        const tbls = [...document.querySelectorAll('table, .ui-datatable')];
        return tbls.map((t) => ({
            id: t.id,
            rows: t.querySelectorAll('tr').length,
            headers: [...t.querySelectorAll('th, .ui-column-title')]
                .slice(0, 15)
                .map((x) => x.textContent.trim().slice(0, 30)),
        }));
    });
    console.log('\n=== TABLES ===');
    tables.forEach((t) =>
        console.log(' ', t.id, '| rows:', t.rows, '| headers:', t.headers.join(' | '))
    );

    // Tìm buttons (Play, Download, Record)
    const buttons = await page.evaluate(() => {
        const list = [];
        document.querySelectorAll('button, a, [role="button"], .ui-button').forEach((el) => {
            const text = (el.textContent || '').trim().slice(0, 40);
            const title = el.title || el.getAttribute('aria-label') || '';
            const onclick = (el.getAttribute('onclick') || '').slice(0, 250);
            const icon = el.querySelector('i')?.className || '';
            if (
                /play|download|record|audio|listen/i.test(
                    text + ' ' + title + ' ' + icon + ' ' + onclick
                )
            ) {
                list.push({ text, title, icon, onclick });
            }
        });
        return list;
    });
    console.log('\n=== CALL ACTION BUTTONS ===');
    buttons
        .slice(0, 30)
        .forEach((b) =>
            console.log(
                ` text="${b.text}" title="${b.title}" icon="${b.icon}"\n   onclick=${b.onclick.slice(0, 150)}`
            )
        );

    console.log('\n=== AUDIO RESPONSES (từ network trong lúc load) ===');
    audio.forEach((a) => console.log(' ', a.status, a.ct, a.url));

    // Click play button đầu tiên nếu có
    const playBtns = page.locator(
        '[class*="play"], button:has-text("Play"), [title*="play" i], i.pi-play, i.fa-play'
    );
    const nPlay = await playBtns.count();
    console.log(`\n[info] Play-like elements: ${nPlay}`);
    if (nPlay > 0) {
        for (let i = 0; i < Math.min(nPlay, 3); i++) {
            try {
                await playBtns.nth(i).scrollIntoViewIfNeeded({ timeout: 1000 });
                await playBtns.nth(i).click({ timeout: 2000, force: true });
                console.log(`[info] Clicked play #${i}`);
                await page.waitForTimeout(1500);
            } catch (e) {
                console.log(`[err] play #${i}: ${e.message.slice(0, 80)}`);
            }
        }
    }
    await page.waitForTimeout(2000);
    console.log('\n=== AUDIO SAU CLICK ===');
    audio.forEach((a) => console.log(' ', a.status, a.ct, a.url));

    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
