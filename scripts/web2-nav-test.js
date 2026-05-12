#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Web2 sidebar navigation test:
//   1. Verify logo + brand visible
//   2. Expand each category (13 total)
//   3. Verify all child links resolvable (HEAD/GET 200)
//   4. Spot-check actual navigation on 3 pages

const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');

const BASE = (process.argv[2] || 'http://localhost:8080').replace(/\/+$/, '');

function log(msg) {
    console.log(`[nav] ${msg}`);
}

async function main() {
    await ensureLocalServer(BASE);
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const errors = [];

    // Open a sample web2 page so sidebar mounts (sidebar is per-page mount)
    await page.goto(`${BASE}/web2/tag/index.html?t=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // STEP 1: brand/logo visible
    const brand = await page.evaluate(() => {
        const logo = document.querySelector('.web2-brand-logo');
        const text = document.querySelector('.web2-brand-text');
        const sub = document.querySelector('.web2-brand-sub');
        return {
            logoText: logo?.textContent?.trim(),
            brandText: text?.textContent?.trim(),
            version: sub?.textContent?.trim(),
            logoVisible: logo?.offsetParent !== null,
        };
    });
    log(
        `logo: "${brand.logoText}" "${brand.brandText}" "${brand.version}" visible=${brand.logoVisible}`
    );
    if (!brand.logoVisible) errors.push('logo not visible');
    if (brand.logoText !== 'N2') errors.push(`logo text mismatch: ${brand.logoText}`);

    // STEP 2: enumerate categories
    const cats = await page.evaluate(() => {
        const groups = Array.from(document.querySelectorAll('.web2-nav-group'));
        const singles = Array.from(document.querySelectorAll('nav.web2-nav > a.web2-nav-link'));
        return {
            singles: singles.map((a) => ({
                label: a.querySelector('.label')?.textContent?.trim() || a.textContent?.trim(),
                href: a.getAttribute('href'),
            })),
            groups: groups.map((g) => ({
                label: g.querySelector('.web2-nav-group-head .label')?.textContent?.trim(),
                childCount: g.querySelectorAll('ul.web2-nav-sub a').length,
            })),
        };
    });
    log(`singles: ${cats.singles.length}, groups: ${cats.groups.length}`);
    cats.singles.forEach((s) => log(`  ▸ single: ${s.label} → ${s.href}`));
    cats.groups.forEach((g) => log(`  ▾ group: ${g.label} (${g.childCount} children)`));

    if (cats.singles.length + cats.groups.length !== 13) {
        errors.push(`expected 13 nav entries, got ${cats.singles.length + cats.groups.length}`);
    }

    // STEP 3: expand all groups + collect children
    log('expand all groups, collect child links');
    await page.evaluate(() => {
        document.querySelectorAll('.web2-nav-group').forEach((g) => g.classList.add('is-open'));
    });
    await page.waitForTimeout(300);
    const links = await page.evaluate(() => {
        const all = Array.from(
            document.querySelectorAll(
                'nav.web2-nav a.web2-nav-link, nav.web2-nav a.web2-nav-sub-link'
            )
        );
        return all.map((a) => ({
            label:
                a.querySelector('.label')?.textContent?.trim() ||
                a.textContent?.trim().slice(0, 40),
            href: a.getAttribute('href'),
            inGroup: !!a.closest('.web2-nav-group'),
            external: a.getAttribute('target') === '_blank',
        }));
    });
    log(`total nav links: ${links.length}`);

    // STEP 4: HEAD-check each link
    log('checking each link resolvable…');
    const linkResults = [];
    for (const link of links) {
        if (!link.href || link.href.startsWith('#') || link.href.startsWith('javascript:')) {
            linkResults.push({ ...link, status: 'skip' });
            continue;
        }
        // Resolve href against current sample page URL `${BASE}/web2/tag/index.html`
        const absoluteUrl = new URL(link.href, `${BASE}/web2/tag/`).href;
        try {
            const resp = await fetch(absoluteUrl, { method: 'GET', redirect: 'manual' });
            linkResults.push({ ...link, url: absoluteUrl, status: resp.status });
        } catch (err) {
            linkResults.push({ ...link, url: absoluteUrl, status: 'ERR ' + err.message });
        }
    }
    const broken = linkResults.filter((r) =>
        typeof r.status === 'number' ? r.status >= 400 : String(r.status).startsWith('ERR')
    );
    log(`broken links: ${broken.length}/${linkResults.length}`);
    for (const b of broken) {
        log(`  ✗ ${b.label} → ${b.url} (${b.status})`);
        errors.push(`broken link: ${b.label} → ${b.url} (${b.status})`);
    }

    // STEP 5: spot-check actual navigation on 3 pages
    const samples = [
        {
            label: 'Đơn Web (native-orders, not web2)',
            href: '../../native-orders/index.html',
            url: `${BASE}/native-orders/index.html`,
        },
        { label: 'Tag (web2)', href: '../tag/index.html', url: `${BASE}/web2/tag/index.html` },
        {
            label: 'Product Category (web2)',
            href: '../product-category/index.html',
            url: `${BASE}/web2/product-category/index.html`,
        },
    ];
    log('spot-check navigation:');
    for (const s of samples) {
        const url = `${s.url}?t=${Date.now()}`;
        const resp = await page
            .goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 })
            .catch((e) => ({ status: () => 'ERR', err: e.message }));
        const ok = resp && typeof resp.status === 'function' && resp.status() === 200;
        log(
            `  ${ok ? '✓' : '✗'} ${s.label} → HTTP ${ok ? 200 : (resp?.status?.() ?? '?')} ${resp?.err || ''}`
        );
        if (!ok) errors.push(`spot-check nav failed: ${s.label} → ${resp?.status?.()}`);
    }

    await browser.close();

    console.log('');
    if (errors.length === 0) {
        log('✅ ALL NAV CHECKS PASSED');
        process.exit(0);
    } else {
        log(`❌ ${errors.length} error(s):`);
        for (const e of errors) console.log(`  - ${e}`);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error('[nav] fatal:', e.message);
    process.exit(2);
});
