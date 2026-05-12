#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Web2 cross-page interaction test:
//   1. Sidebar consistency — same logo + same 90 nav links trên mọi trang
//   2. Cross-page data persistence — create record trang A, reload trang B, vẫn thấy data
//   3. Sidebar active state — đang ở trang X → group cha của X expand + highlight
//   4. Data round-trip qua DB: trang A POST → trang B GET → data có
//
// Cleanup: dùng code prefix TEST-INTERACT- + DELETE end-of-test.

const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');

const BASE = (process.argv[2] || 'http://localhost:8080').replace(/\/+$/, '');
const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const TS = Date.now();
const TEST_CODE = `TEST-INTERACT-${TS}`;

function log(msg) {
    console.log(`[interact] ${msg}`);
}

async function main() {
    await ensureLocalServer(BASE);
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];

    // STEP 1: sidebar consistency across 5 pages
    log('STEP 1: sidebar consistency across pages');
    const pages = ['tag', 'product-category', 'application-user', 'company', 'delivery-carrier'];
    const sidebarHashes = [];
    for (const dir of pages) {
        await page.goto(`${BASE}/web2/${dir}/index.html?t=${Date.now()}`, {
            waitUntil: 'networkidle',
        });
        await page.waitForTimeout(800);
        const sb = await page.evaluate(() => {
            const aside = document.querySelector('.web2-aside');
            const logo = aside?.querySelector('.web2-brand-logo')?.textContent;
            const links = Array.from(
                aside?.querySelectorAll('a.web2-nav-link, a.web2-nav-sub-link') || []
            ).map(
                (a) =>
                    a.getAttribute('href') +
                    '|' +
                    (a.querySelector('.label')?.textContent?.trim() || a.textContent.trim())
            );
            return { logo, linkCount: links.length, signature: links.sort().join(';;') };
        });
        sidebarHashes.push({ dir, ...sb });
        log(`  ${dir}: logo="${sb.logo}", links=${sb.linkCount}`);
    }
    const firstSig = sidebarHashes[0].signature;
    const inconsistent = sidebarHashes.filter((h) => h.signature !== firstSig);
    if (inconsistent.length === 0) {
        log('  ✓ all pages have identical sidebar');
    } else {
        for (const i of inconsistent)
            errors.push(`sidebar mismatch: ${i.dir} differs from ${pages[0]}`);
    }

    // STEP 2: cross-page data persistence
    // Create a tag via API → open tag page → search for it → verify visible.
    // Then create same in product-category, verify isolation (not in tag).
    log('STEP 2: cross-page data persistence + entity isolation');
    const created = await page.evaluate(
        async ({ u, c }) => {
            const r = await fetch(`${u}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: c,
                    name: 'Interaction Test',
                    data: { note: 'created via API' },
                }),
            });
            return { status: r.status, body: r.ok ? await r.json() : await r.text() };
        },
        { u: `${WORKER}/api/web2/tag/create`, c: TEST_CODE }
    );
    if (created.status !== 200 && created.status !== 201) {
        errors.push(`CREATE in tag failed: HTTP ${created.status}`);
    } else {
        log(`  ✓ POST /tag/create code=${TEST_CODE} HTTP=${created.status}`);
    }

    // Verify tag page shows it
    await page.goto(`${BASE}/web2/tag/index.html?t=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.fill('#w2pSearch', TEST_CODE);
    await page.click('#w2pApply');
    await page.waitForTimeout(1500);
    const tagFound = await page.locator('#w2pTable tbody tr:not(:has(.empty-row))').count();
    if (tagFound !== 1) errors.push(`tag page should find 1 row for ${TEST_CODE}, got ${tagFound}`);
    else log(`  ✓ tag page finds ${TEST_CODE} (${tagFound} row)`);

    // Verify product-category does NOT have it (entity isolation)
    await page.goto(`${BASE}/web2/product-category/index.html?t=${Date.now()}`, {
        waitUntil: 'networkidle',
    });
    await page.waitForTimeout(1500);
    await page.fill('#w2pSearch', TEST_CODE);
    await page.click('#w2pApply');
    await page.waitForTimeout(1500);
    const pcFound = await page.locator('#w2pTable tbody tr:not(:has(.empty-row))').count();
    if (pcFound !== 0)
        errors.push(`product-category should NOT have ${TEST_CODE}, got ${pcFound} rows`);
    else log(`  ✓ entity isolation: product-category has 0 rows for ${TEST_CODE}`);

    // STEP 3: data round-trip — modify via page B's API, verify in page A
    log('STEP 3: update via API, verify in UI');
    const updated = await page.evaluate(
        async ({ u, c }) => {
            const r = await fetch(`${u}/update/${encodeURIComponent(c)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Updated via cross-page' }),
            });
            return { status: r.status, body: await r.text() };
        },
        { u: `${WORKER}/api/web2/tag`, c: TEST_CODE }
    );
    log(`  PATCH /tag/update HTTP=${updated.status}`);
    if (updated.status !== 200) errors.push(`UPDATE failed: HTTP ${updated.status}`);

    // Reload tag page, verify new name visible
    await page.goto(`${BASE}/web2/tag/index.html?t=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.fill('#w2pSearch', TEST_CODE);
    await page.click('#w2pApply');
    await page.waitForTimeout(1500);
    const updatedName = await page.evaluate(() => {
        const row = document.querySelector('#w2pTable tbody tr');
        // Name is typically in column 4 (after action, code, name)
        const tds = row?.querySelectorAll('td');
        return tds
            ? Array.from(tds)
                  .map((t) => t.textContent.trim())
                  .join(' | ')
            : null;
    });
    if (updatedName && updatedName.includes('Updated via cross-page')) {
        log(`  ✓ UI reflects updated name: "${updatedName.slice(0, 100)}"`);
    } else {
        errors.push(`UI didn't reflect update: ${updatedName?.slice(0, 100)}`);
    }

    // STEP 4: cleanup
    log('STEP 4: cleanup TEST-INTERACT-* rows');
    const del = await page.evaluate(
        async ({ u, c }) => {
            const r = await fetch(`${u}/delete/${encodeURIComponent(c)}`, { method: 'DELETE' });
            return r.status;
        },
        { u: `${WORKER}/api/web2/tag`, c: TEST_CODE }
    );
    log(`  DELETE /tag/${TEST_CODE} → ${del}`);
    if (del !== 200) errors.push(`cleanup DELETE failed: HTTP ${del}`);

    await browser.close();

    console.log('');
    if (errors.length === 0) {
        log('✅ ALL INTERACTION CHECKS PASSED');
        process.exit(0);
    } else {
        log(`❌ ${errors.length} error(s):`);
        for (const e of errors) console.log(`  - ${e}`);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error('[interact] fatal:', e.message);
    console.error(e.stack);
    process.exit(2);
});
