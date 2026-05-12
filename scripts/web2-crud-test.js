#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Web2 CRUD test — Create/Update/Delete trên tag entity (representative — generic shell).
// Cleanup: code prefix `TEST-WEB2-` rồi DELETE qua API end-of-test.
// Run: node scripts/web2-crud-test.js [--entity tag] [--base http://localhost:8080] [--keep]

const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');

const ARGS = (() => {
    const a = process.argv.slice(2);
    const o = { entity: 'tag', dir: 'tag', base: 'http://localhost:8080', keep: false };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--entity') o.entity = a[++i];
        else if (a[i] === '--dir') o.dir = a[++i];
        else if (a[i] === '--base') o.base = a[++i];
        else if (a[i] === '--keep') o.keep = true;
    }
    return o;
})();

const BASE = ARGS.base.replace(/\/+$/, '');
const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const API_BASE = `${WORKER}/api/web2/${ARGS.entity}`;
const TEST_CODE = `TEST-WEB2-${Date.now()}`;
const TEST_NAME = `Web2 CRUD Test ${new Date().toISOString().slice(0, 19)}`;
const TEST_NAME_UPDATED = `${TEST_NAME} — UPDATED`;

function log(step, msg) {
    console.log(`[crud] ${step.padEnd(18)} ${msg}`);
}

async function main() {
    await ensureLocalServer(BASE);
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    page.on('console', (m) => {
        if (m.type() === 'error') console.log(`  [console-err] ${m.text().slice(0, 200)}`);
    });
    page.on('pageerror', (e) => console.log(`  [page-err] ${String(e).slice(0, 200)}`));

    const errors = [];

    try {
        const url = `${BASE}/web2/${ARGS.dir}/index.html?t=${Date.now()}`;
        log('open', url);
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        if (!resp || resp.status() !== 200) throw new Error(`page HTTP ${resp?.status()}`);
        await page.waitForTimeout(2000);

        // STEP 1: table loaded (empty OK — entity may have no seed data)
        await page.locator('#w2pTable').waitFor({ state: 'visible', timeout: 5000 });
        const initialRows = await page.locator('#w2pTable tbody tr:not(:has(.empty-row))').count();
        log('load', `initial rows=${initialRows}`);

        // STEP 2: search — use a unique non-existent string to test filter actually applies
        // (Page size limit = 200 nên search-by-common-word vẫn trả 200 rows, không phân biệt được)
        const NONCE = `___no-match-${Date.now()}___`;
        log('search', `type "${NONCE}" + Apply`);
        await page.fill('#w2pSearch', NONCE);
        await page.waitForTimeout(300);
        await page.click('#w2pApply');
        await page.waitForTimeout(1500);
        const noMatchRows = await page.locator('#w2pTable tbody tr:not(:has(.empty-row))').count();
        log('search', `rows after no-match=${noMatchRows}`);
        if (noMatchRows > 0) errors.push(`search no-match expected 0 rows, got ${noMatchRows}`);
        // Clear
        await page.click('#w2pClear');
        await page.waitForTimeout(1500);
        const clearRows = await page.locator('#w2pTable tbody tr:not(:has(.empty-row))').count();
        log('search', `rows after clear=${clearRows}`);
        if (clearRows !== initialRows)
            errors.push(`clear filter rows mismatch: initial=${initialRows} clear=${clearRows}`);

        // STEP 3: CREATE — click Add, fill, save
        log('create', `click #w2pAdd code=${TEST_CODE}`);
        await page.click('#w2pAdd');
        await page.waitForTimeout(500);
        await page.fill('#w2pField_code', TEST_CODE);
        await page.fill('#w2pField_name', TEST_NAME);
        if (await page.locator('#w2pField_data_note').count()) {
            await page.fill('#w2pField_data_note', 'Auto smoke test row');
        }
        await page.click('#w2pModalSave');
        await page.waitForTimeout(2000);

        // Verify modal closed
        const modalStillOpen = await page.locator('#w2pModal.active').count();
        if (modalStillOpen > 0) {
            errors.push('CREATE failed: modal still open after Save');
        }

        // STEP 4: verify via API
        log('verify-create', `GET /api/web2/${ARGS.entity}/get/${TEST_CODE}`);
        const created = await page.evaluate(
            async ({ u, c }) => {
                const r = await fetch(`${u}/get/${encodeURIComponent(c)}`);
                return { status: r.status, body: r.ok ? await r.json() : null };
            },
            { u: API_BASE, c: TEST_CODE }
        );
        log('verify-create', `HTTP ${created.status} name=${created.body?.record?.name}`);
        if (created.status !== 200) errors.push(`CREATE not persisted: HTTP ${created.status}`);
        else if (created.body?.record?.name !== TEST_NAME)
            errors.push(`CREATE name mismatch: got "${created.body?.record?.name}"`);

        // STEP 5: UPDATE — search for it, click edit
        log('update', `search ${TEST_CODE}`);
        await page.fill('#w2pSearch', TEST_CODE);
        await page.click('#w2pApply');
        await page.waitForTimeout(1500);
        const matchRows = await page.locator('#w2pTable tbody tr:not(:has(.empty-row))').count();
        log('update', `found rows=${matchRows}`);

        if (matchRows > 0) {
            // Find edit button (primary class in actions column)
            const editBtn = page
                .locator('#w2pTable tbody tr')
                .first()
                .locator('.tpos-btn-primary')
                .first();
            if (await editBtn.count()) {
                await editBtn.click();
                await page.waitForTimeout(800);
                await page.fill('#w2pField_name', TEST_NAME_UPDATED);
                await page.click('#w2pModalSave');
                await page.waitForTimeout(2000);

                const updated = await page.evaluate(
                    async ({ u, c }) => {
                        const r = await fetch(`${u}/get/${encodeURIComponent(c)}`);
                        return r.ok ? await r.json() : { error: r.status };
                    },
                    { u: API_BASE, c: TEST_CODE }
                );
                log('verify-update', `name=${updated?.record?.name}`);
                if (updated?.record?.name !== TEST_NAME_UPDATED) {
                    errors.push(`UPDATE failed: got "${updated?.record?.name}"`);
                }
            } else {
                errors.push('UPDATE: no edit button found in row actions');
            }
        } else {
            errors.push('UPDATE: created row not findable via search');
        }

        // STEP 6: DELETE via API + verify gone
        if (!ARGS.keep) {
            log('delete', `DELETE /api/web2/${ARGS.entity}/delete/${TEST_CODE}`);
            const del = await page.evaluate(
                async ({ u, c }) => {
                    const r = await fetch(`${u}/delete/${encodeURIComponent(c)}`, {
                        method: 'DELETE',
                    });
                    return { status: r.status, body: await r.text() };
                },
                { u: API_BASE, c: TEST_CODE }
            );
            log('delete', `HTTP ${del.status}`);
            if (del.status !== 200)
                errors.push(`DELETE HTTP ${del.status}: ${del.body.slice(0, 100)}`);

            const gone = await page.evaluate(
                async ({ u, c }) => {
                    const r = await fetch(`${u}/get/${encodeURIComponent(c)}`);
                    return r.status;
                },
                { u: API_BASE, c: TEST_CODE }
            );
            log('verify-delete', `GET → ${gone}`);
            if (gone !== 404) errors.push(`DELETE verify: GET returned ${gone}, expected 404`);
        }
    } catch (err) {
        errors.push(`EXCEPTION ${err.message}`);
        console.error(err.stack);
    } finally {
        await browser.close();
    }

    console.log('');
    if (errors.length === 0) {
        console.log('[crud] ✅ ALL STEPS PASSED');
        process.exit(0);
    } else {
        console.log(`[crud] ❌ ${errors.length} error(s):`);
        for (const e of errors) console.log(`  - ${e}`);
        process.exit(1);
    }
}

main();
