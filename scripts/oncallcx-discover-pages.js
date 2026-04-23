#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Discover menu + pages chứa call recordings sau khi login.
 * Dump: list tất cả <a href=".xhtml"> + text trong menu/navigation.
 */

const fs = require('fs');
const path = require('path');

const SECRETS_FILE = path.resolve(__dirname, '..', 'serect_dont_push.txt');
const OUT = path.resolve(__dirname, '..', 'docs', 'oncallcx-pages.json');

async function main() {
    const { chromium } = require('playwright');
    const content = fs.readFileSync(SECRETS_FILE, 'utf8');
    const line = content
        .split('\n')
        .find((l) => l.includes('pbx-ucaas.oncallcx.vn') && !l.includes('PBX_HOST'));
    const after = line.replace(/^\s*\d+\/?\s*/, '').replace(/"[^"]*"\s*/, '');
    const parts = after.trim().split(/\s+/);
    const creds = { username: parts[0], password: parts.slice(1).join(' ') };

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://pbx-ucaas.oncallcx.vn/portal/login.xhtml', {
        waitUntil: 'networkidle',
    });
    await page.locator('input[type="text"]').first().fill(creds.username);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.locator('button[type="submit"], input[type="submit"]').first().click(),
    ]);
    await page.waitForTimeout(2500);
    console.log('[info] Logged in. Dashboard URL:', page.url());

    const links = await page.evaluate(() => {
        const a = [...document.querySelectorAll('a[href]')];
        return a
            .map((x) => ({
                href: x.href,
                text: (x.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
                title: x.title || '',
                menuRole: x.closest('[role="menu"], nav, .layout-menu, .menu')?.tagName || '',
            }))
            .filter((x) => x.href.includes('pbx-ucaas'));
    });

    // Distinct xhtml pages
    const pages = [
        ...new Set(
            links
                .map((l) => {
                    try {
                        return new URL(l.href).pathname;
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean)
        ),
    ].filter((p) => p.endsWith('.xhtml'));

    // Keywords liên quan call / recording
    const candidates = links.filter((l) =>
        /call|record|audio|voicemail|cdr|history/i.test(l.href + ' ' + l.text)
    );

    const out = {
        loginAs: creds.username,
        totalLinks: links.length,
        pages,
        candidates,
        allLinks: links,
    };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(`[info] ${links.length} links, ${pages.length} distinct pages.`);
    console.log('\n=== CANDIDATES (call/record/audio/voicemail) ===');
    candidates.forEach((c) => console.log(`  ${c.text || '(no text)'}\n    ${c.href}`));
    console.log('\n=== ALL XHTML PAGES ===');
    pages.forEach((p) => console.log('  ', p));

    await browser.close();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
