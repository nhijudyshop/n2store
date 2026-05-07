#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Test: confirm popup khi đóng row modal + tô xám đơn đã kiểm tra.
// 1. Mở row modal trên 1 row đầu tiên có Number → click X → popup xuất hiện
// 2. Bấm "Đã kiểm tra" → popup + modal tắt → row tô class dr-row-checked
// 3. Mở lại row đó → click X → KHÔNG hỏi nữa, tắt thẳng

const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');

const BASE = process.env.BASE || 'http://localhost:8080';

(async () => {
    if (BASE.startsWith('http://localhost')) {
        await ensureLocalServer(BASE).catch(() => {});
    }

    const errors = [];
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    ctx.route('**/*.js', (r) => {
        const headers = { ...r.request().headers(), 'cache-control': 'no-cache' };
        r.continue({ headers });
    });
    const page = await ctx.newPage();

    page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            const t = msg.text();
            if (!/ERR_CONNECTION_REFUSED|MenuLayout|Failed to load resource/i.test(t)) {
                errors.push(`[console.error] ${t.slice(0, 250)}`);
            }
        }
    });

    // Login
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="user"], input[type="text"], #username', 'admin').catch(() => {});
    await page.fill('input[type="password"]', 'admin@@').catch(() => {});
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    await page.goto(`${BASE}/delivery-report/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page
        .waitForFunction(() => !!window.DeliveryReport, { timeout: 20_000 })
        .catch(() => {});
    await page.waitForTimeout(2500);

    // Wait for at least one row with .dr-hover-bill
    await page
        .waitForFunction(
            () => document.querySelectorAll('.dr-hover-bill[data-number]').length > 0,
            { timeout: 15_000 }
        )
        .catch(() => {});

    const results = [];

    // Pick first row's number
    const targetNumber = await page.evaluate(() => {
        const cell = document.querySelector('.dr-hover-bill[data-number]');
        return cell?.dataset.number || null;
    });
    results.push(`target invoice number: ${targetNumber || '(none)'}`);

    if (!targetNumber) {
        console.log('No invoice rows available — abort.');
        await browser.close();
        process.exit(0);
    }

    // Reset state for this number to a clean slate (in case a prior run marked it)
    await page.evaluate(async (num) => {
        // best-effort: remove from local + Firestore so test starts unchecked
        try {
            const raw = localStorage.getItem('drOrderChecks_v1');
            if (raw) {
                const obj = JSON.parse(raw);
                delete obj[num];
                localStorage.setItem('drOrderChecks_v1', JSON.stringify(obj));
            }
        } catch (e) {}
        try {
            const db = (typeof getFirestore === 'function')
                ? getFirestore()
                : (typeof firebase !== 'undefined' && firebase.apps?.length ? firebase.firestore() : null);
            if (db) {
                await db.collection('delivery_report').doc('data').collection('order_checks').doc(num).delete().catch(() => {});
            }
        } catch (e) {}
    }, targetNumber);

    await page.waitForTimeout(500);
    await page.evaluate(() => location.reload());
    await page.waitForLoadState('domcontentloaded');
    await page
        .waitForFunction(
            () => document.querySelectorAll('.dr-hover-bill[data-number]').length > 0,
            { timeout: 15_000 }
        )
        .catch(() => {});
    await page.waitForTimeout(2000);

    // STEP 1: row should NOT be checked yet
    const beforeChecked = await page.evaluate((num) => {
        const cell = document.querySelector(`.dr-hover-bill[data-number="${num}"]`);
        return !!cell?.closest('tr')?.classList.contains('dr-row-checked');
    }, targetNumber);
    results.push(beforeChecked ? 'FAIL: row already grayed before check' : 'PASS: row not grayed initially');

    // STEP 2: click row → modal opens
    await page.click(`.dr-hover-bill[data-number="${targetNumber}"]`);
    await page.waitForTimeout(800);
    const modalVisible = await page.evaluate(() => {
        const m = document.getElementById('dr-row-modal');
        return !!m && m.style.display === 'flex';
    });
    results.push(modalVisible ? 'PASS: row modal opened' : 'FAIL: row modal not opened');

    // STEP 3: click X → confirm popup should appear
    await page.evaluate(() => document.getElementById('dr-row-close')?.click());
    await page.waitForTimeout(300);
    const popupVisible = await page.evaluate(() => {
        const p = document.getElementById('dr-row-confirm');
        return !!p && p.style.display === 'flex';
    });
    results.push(popupVisible ? 'PASS: confirm popup shown on close' : 'FAIL: confirm popup did not appear');

    // STEP 4: click "Đã kiểm tra"
    await page.evaluate(() => document.getElementById('dr-confirm-yes')?.click());
    await page.waitForTimeout(1500); // wait for Firestore write + listener round-trip

    // STEP 5: row should now be grayed
    const afterChecked = await page.evaluate((num) => {
        const cell = document.querySelector(`.dr-hover-bill[data-number="${num}"]`);
        return !!cell?.closest('tr')?.classList.contains('dr-row-checked');
    }, targetNumber);
    results.push(afterChecked ? 'PASS: row grayed after marking checked' : 'FAIL: row not grayed');

    // STEP 6: re-open the row → click X → should close DIRECTLY without popup
    await page.click(`.dr-hover-bill[data-number="${targetNumber}"]`);
    await page.waitForTimeout(800);
    await page.evaluate(() => document.getElementById('dr-row-close')?.click());
    await page.waitForTimeout(300);
    const popupShown2 = await page.evaluate(() => {
        const p = document.getElementById('dr-row-confirm');
        return !!p && p.style.display === 'flex';
    });
    const modalGone = await page.evaluate(() => {
        const m = document.getElementById('dr-row-modal');
        return !!m && m.style.display === 'none';
    });
    results.push(!popupShown2 && modalGone
        ? 'PASS: re-close on already-checked row skips popup'
        : `FAIL: popupShown=${popupShown2} modalGone=${modalGone}`);

    console.log('\n=== RESULTS ===');
    results.forEach((r) => console.log(r));
    if (errors.length) {
        console.log('\n=== JS ERRORS ===');
        errors.forEach((e) => console.log(e));
    }

    const failed = results.filter((r) => r.startsWith('FAIL')).length;

    // Cleanup: unmark the order in Firestore so next dev run starts clean
    await page.evaluate(async (num) => {
        try {
            const db = (typeof getFirestore === 'function')
                ? getFirestore()
                : (typeof firebase !== 'undefined' && firebase.apps?.length ? firebase.firestore() : null);
            if (db) {
                await db.collection('delivery_report').doc('data').collection('order_checks').doc(num).delete().catch(() => {});
            }
        } catch (e) {}
    }, targetNumber);

    await browser.close();
    process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
