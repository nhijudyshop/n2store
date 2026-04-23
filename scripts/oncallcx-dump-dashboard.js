#!/usr/bin/env node
// Dump dashboard HTML + menu structure sau login

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
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

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

    // Dump dashboard HTML
    const html = await page.content();
    fs.writeFileSync(path.resolve(__dirname, '..', 'docs', 'oncallcx-dashboard.html'), html);

    // Dump menu items (from <li class="menu..." or role="menuitem")
    const menu = await page.evaluate(() => {
        const items = [];
        // Tìm tất cả menu/nav items có data-*, onclick, href, menu text
        document
            .querySelectorAll('a, [role="menuitem"], li.menuitem, li[data-label], .ui-menuitem')
            .forEach((el) => {
                const onclick = el.getAttribute('onclick') || '';
                const href = el.getAttribute('href') || '';
                const dataUrl = el.getAttribute('data-url') || '';
                const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
                if ((onclick || href || dataUrl) && text) {
                    items.push({
                        text,
                        href,
                        onclick: onclick.slice(0, 300),
                        dataUrl,
                        cls: el.className,
                    });
                }
            });
        return items;
    });

    fs.writeFileSync(
        path.resolve(__dirname, '..', 'docs', 'oncallcx-menu.json'),
        JSON.stringify(menu, null, 2)
    );

    // Filter những item liên quan
    const keywords =
        /call|record|audio|voicemail|cdr|history|log|report|extension|lịch sử|ghi âm|cuộc gọi|báo cáo/i;
    const filtered = menu.filter(
        (m) =>
            keywords.test(m.text) ||
            keywords.test(m.onclick) ||
            keywords.test(m.href) ||
            keywords.test(m.dataUrl)
    );
    console.log('=== MENU ITEMS LIÊN QUAN ===');
    filtered.forEach((m) =>
        console.log(`  ${m.text}\n    href=${m.href}\n    onclick=${m.onclick.slice(0, 200)}\n`)
    );

    // Tìm các URL .xhtml xuất hiện trong onclick / href / JavaScript
    const allText = html;
    const xhtmlUrls = [...new Set(allText.match(/[a-zA-Z0-9_]+\.xhtml/g) || [])];
    console.log('=== XHTML URLS (từ HTML) ===');
    xhtmlUrls.filter((u) => !u.includes('javax.faces')).forEach((u) => console.log(' ', u));

    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
