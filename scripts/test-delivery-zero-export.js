#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// One-shot test for delivery-report ĐƠN 0đ excel export.
// Strategy: open page → wait for init → inject synthetic allData via __test_setData hook → run exports → capture workbooks → assert.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8080';

(async () => {
    const errors = [];
    const consoleMessages = [];
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ acceptDownloads: true });
    ctx.route('**/*.js', (r) => {
        const headers = { ...r.request().headers(), 'cache-control': 'no-cache' };
        r.continue({ headers });
    });
    const page = await ctx.newPage();

    page.on('console', (msg) => {
        const text = msg.text();
        consoleMessages.push({ type: msg.type(), text });
        if (msg.type() === 'error') errors.push(`[console.error] ${text}`);
    });
    page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
    page.on('dialog', async (dialog) => {
        consoleMessages.push({ type: 'dialog', text: `[${dialog.type()}] ${dialog.message()}` });
        await dialog.accept().catch(() => {});
    });

    // Login
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="user"], input[type="text"], #username', 'admin').catch(() => {});
    await page.fill('input[type="password"]', 'admin@@').catch(() => {});
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Goto delivery-report
    await page.goto(`${BASE}/delivery-report/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page
        .waitForFunction(() => typeof XLSX !== 'undefined' && !!window.DeliveryReport, {
            timeout: 20_000,
        })
        .catch(() => {});
    await page.waitForTimeout(1500);

    // Capture XLSX.writeFile output instead of triggering downloads
    await page.evaluate(() => {
        window.__capturedWB = [];
        XLSX.writeFile = function (wb, filename) {
            const sheets = {};
            for (const name of wb.SheetNames) {
                const ws = wb.Sheets[name];
                sheets[name] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
            }
            window.__capturedWB.push({ filename, sheets });
        };
    });

    // Inject synthetic data via getState() — covers nap, city, shop, return, plus tomato (locked) and non-0đ in each group.
    await page.evaluate(() => {
        const state = window.DeliveryReport.getState();
        const items = [
            {
                Number: 'N1',
                PartnerDisplayName: 'Khách 0đ NAP 1',
                Phone: '0900000001',
                Address: 'Hà Nội',
                CashOnDelivery: 0,
                CarrierName: 'TỈNH NAP',
                DeliveryNote: '',
            },
            {
                Number: 'N2',
                PartnerDisplayName: 'Khách 0đ NAP 2',
                Phone: '0900000002',
                Address: 'Đà Nẵng',
                CashOnDelivery: 0,
                CarrierName: 'TỈNH NAP',
                DeliveryNote: '',
            },
            {
                Number: 'C1',
                PartnerDisplayName: 'Khách 0đ CITY 1',
                Phone: '0900000003',
                Address: 'TP HCM',
                CashOnDelivery: 0,
                CarrierName: 'THÀNH PHỐ',
                DeliveryNote: '',
            },
            {
                Number: 'S1',
                PartnerDisplayName: 'Khách 0đ SHOP 1',
                Phone: '0900000004',
                Address: 'Shop',
                CashOnDelivery: 0,
                CarrierName: 'BÁN HÀNG SHOP',
                DeliveryNote: '',
            },
            {
                Number: 'R1',
                PartnerDisplayName: 'Khách 0đ RETURN 1',
                Phone: '0900000005',
                Address: 'Return',
                CashOnDelivery: 0,
                CarrierName: 'TỈNH NAP',
                DeliveryNote: 'Thu về',
            },
            {
                Number: 'TM1',
                PartnerDisplayName: 'Khách 0đ Locked TOMATO',
                Phone: '0900000006',
                Address: 'X',
                CashOnDelivery: 0,
                CarrierName: 'TỈNH NAP',
                DeliveryNote: '',
            },
            {
                Number: 'N100',
                PartnerDisplayName: 'Khách non-0đ NAP',
                Phone: '0911111111',
                Address: 'Y',
                CashOnDelivery: 100000,
                CarrierName: 'TỈNH NAP',
                DeliveryNote: '',
            },
            {
                Number: 'T100',
                PartnerDisplayName: 'Khách non-0đ TOMATO',
                Phone: '0922222222',
                Address: 'Y',
                CashOnDelivery: 200000,
                CarrierName: 'TỈNH NAP',
                DeliveryNote: '',
            },
            {
                Number: 'C100',
                PartnerDisplayName: 'Khách non-0đ CITY',
                Phone: '0933333333',
                Address: 'Y',
                CashOnDelivery: 300000,
                CarrierName: 'THÀNH PHỐ',
                DeliveryNote: '',
            },
        ];
        state.allData = items;
        state.dbAssignments = { TM1: 'tomato', T100: 'tomato' };
        state.provinceGroups = state.provinceGroups || {};
        state.traSoatMode = true;
        state.scannedNumbers = state.scannedNumbers || new Set();
    });
    await page.waitForTimeout(300);

    // Switch to ĐƠN 0đ tab
    await page.evaluate(() => window.DeliveryReport.setTab('zero'));
    await page.waitForTimeout(500);

    // Test 1: main "Xuất excel" → exportExcelZeroDong
    console.log('\n=== TEST 1: "Xuất excel" main button on ĐƠN 0đ tab ===');
    await page.evaluate(() => window.DeliveryReport.exportExcel());
    await page.waitForTimeout(800);

    // Test 2: TOMATO toolbar on ĐƠN 0đ tab
    console.log('\n=== TEST 2: TOMATO toolbar on ĐƠN 0đ tab ===');
    await page.evaluate(() => window.DeliveryReport.exportExcelGroup('tomato'));
    await page.waitForTimeout(300);

    // Test 3: NAP toolbar on ĐƠN 0đ tab
    console.log('\n=== TEST 3: NAP toolbar on ĐƠN 0đ tab ===');
    await page.evaluate(() => window.DeliveryReport.exportExcelGroup('nap'));
    await page.waitForTimeout(300);

    // Test 4: THÀNH PHỐ toolbar on ĐƠN 0đ tab
    console.log('\n=== TEST 4: THÀNH PHỐ toolbar on ĐƠN 0đ tab ===');
    await page.evaluate(() => window.DeliveryReport.exportExcelGroup('city'));
    await page.waitForTimeout(300);

    // Test 5: edge case — group with no 0đ items on ĐƠN 0đ tab → alert, no workbook
    console.log('\n=== TEST 5: empty 0đ group (return after removing R1) ===');
    await page.evaluate(() => {
        const state = window.DeliveryReport.getState();
        state.allData = state.allData.filter((i) => i.Number !== 'R1');
    });
    await page.evaluate(() => window.DeliveryReport.exportExcelGroup('return'));
    await page.waitForTimeout(300);

    // Test 6: switch back to "Tất cả" tab → exportExcelGroup must NOT filter by 0đ
    console.log('\n=== TEST 6: TOMATO toolbar on Tất cả tab (no 0đ filter) ===');
    await page.evaluate(() => window.DeliveryReport.setTab('all'));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.DeliveryReport.exportExcelGroup('tomato'));
    await page.waitForTimeout(300);

    const captured = await page.evaluate(() => window.__capturedWB);
    const dialogs = consoleMessages.filter((m) => m.type === 'dialog').map((m) => m.text);

    console.log(`\nTotal workbooks captured: ${captured.length}`);
    console.log(`Total dialogs (alerts): ${dialogs.length}`);
    dialogs.forEach((d) => console.log('  ' + d));

    captured.forEach((c, i) => {
        console.log(`\n[${i + 1}] ${c.filename}`);
        for (const [name, rows] of Object.entries(c.sheets)) {
            const dataRows = rows.slice(1, -1);
            const numbers = dataRows.map((r) => r[1]).filter(Boolean);
            console.log(`  Sheet "${name}" (${dataRows.length}): ${numbers.join(', ')}`);
        }
    });

    console.log('\n=== ASSERTIONS ===');
    const assertions = [];

    // TEST 1: exportExcelZeroDong should produce a workbook with sheets covering all 0đ items
    // Items eligible: N1, N2, C1, S1, R1, TM1 (6 items, all 0đ).
    const wb1 = captured[0];
    if (!wb1) {
        assertions.push('FAIL: TEST 1 produced no workbook');
    } else {
        const napRows = (wb1.sheets['TỈNH NAP'] || []).slice(1, -1);
        const cityRows = (wb1.sheets['THÀNH PHỐ'] || []).slice(1, -1);
        const shopRows = (wb1.sheets['BÁN HÀNG SHOP'] || []).slice(1, -1);
        const returnRows = (wb1.sheets['THU VỀ'] || []).slice(1, -1);
        const tomatoRows = (wb1.sheets['TOMATO'] || []).slice(1, -1);

        // Items N1, N2 → NAP (no DB assignment, carrier NAP, not Thu về)
        if (
            napRows.length === 2 &&
            napRows
                .map((r) => r[1])
                .sort()
                .join(',') === 'N1,N2'
        )
            assertions.push('PASS: TEST 1 NAP has N1,N2');
        else
            assertions.push(
                `FAIL: TEST 1 NAP expected [N1,N2] got [${napRows.map((r) => r[1]).join(',')}]`
            );
        // C1 → city
        if (cityRows.length === 1 && cityRows[0][1] === 'C1')
            assertions.push('PASS: TEST 1 CITY has C1');
        else
            assertions.push(
                `FAIL: TEST 1 CITY expected [C1] got [${cityRows.map((r) => r[1]).join(',')}]`
            );
        // S1 → shop
        if (shopRows.length === 1 && shopRows[0][1] === 'S1')
            assertions.push('PASS: TEST 1 SHOP has S1');
        else
            assertions.push(
                `FAIL: TEST 1 SHOP expected [S1] got [${shopRows.map((r) => r[1]).join(',')}]`
            );
        // R1 → return
        if (returnRows.length === 1 && returnRows[0][1] === 'R1')
            assertions.push('PASS: TEST 1 RETURN has R1');
        else
            assertions.push(
                `FAIL: TEST 1 RETURN expected [R1] got [${returnRows.map((r) => r[1]).join(',')}]`
            );
        // TM1 → tomato (DB locked)
        if (tomatoRows.length === 1 && tomatoRows[0][1] === 'TM1')
            assertions.push('PASS: TEST 1 TOMATO has TM1 (locked 0đ included)');
        else
            assertions.push(
                `FAIL: TEST 1 TOMATO expected [TM1] got [${tomatoRows.map((r) => r[1]).join(',')}]`
            );
    }

    // TEST 2: TOMATO on 0đ tab → only TM1 (0đ tomato), not T100 (non-0đ tomato)
    const wb2 = captured[1];
    if (wb2) {
        const sheetVals = Object.values(wb2.sheets);
        const dataRows = sheetVals.flatMap((rows) => rows.slice(1, -1));
        const numbers = dataRows.map((r) => r[1]);
        if (dataRows.length === 1 && numbers[0] === 'TM1')
            assertions.push('PASS: TEST 2 TOMATO on 0đ tab → only TM1');
        else
            assertions.push(
                `FAIL: TEST 2 TOMATO on 0đ tab → got [${numbers.join(',')}], expected [TM1]`
            );
    } else if (dialogs.find((d) => d.includes('Không có'))) {
        assertions.push('INFO: TEST 2 TOMATO on 0đ tab → alerted (no data)');
    } else {
        assertions.push('FAIL: TEST 2 produced no workbook and no alert');
    }

    // TEST 3: NAP on 0đ tab → only N1, N2 (not N100 non-0đ NAP)
    const wb3 = captured[2];
    if (wb3) {
        const sheetVals = Object.values(wb3.sheets);
        const dataRows = sheetVals.flatMap((rows) => rows.slice(1, -1));
        const numbers = dataRows
            .map((r) => r[1])
            .sort()
            .join(',');
        if (numbers === 'N1,N2') assertions.push('PASS: TEST 3 NAP on 0đ tab → N1,N2');
        else assertions.push(`FAIL: TEST 3 NAP on 0đ tab → [${numbers}], expected [N1,N2]`);
    }

    // TEST 4: CITY on 0đ tab → only C1 (not C100 non-0đ city)
    const wb4 = captured[3];
    if (wb4) {
        const sheetVals = Object.values(wb4.sheets);
        const dataRows = sheetVals.flatMap((rows) => rows.slice(1, -1));
        const numbers = dataRows.map((r) => r[1]).join(',');
        if (numbers === 'C1') assertions.push('PASS: TEST 4 CITY on 0đ tab → C1');
        else assertions.push(`FAIL: TEST 4 CITY on 0đ tab → [${numbers}], expected [C1]`);
    }

    // TEST 5: empty 0đ group → alert + no workbook generated
    // (R1 was removed before clicking THU VỀ, so no 0đ return items remain)
    const test5Alert = dialogs.find((d) => d.includes('Không có đơn 0đ trong nhóm THU VỀ'));
    if (test5Alert && captured.length === 5)
        assertions.push('PASS: TEST 5 empty 0đ group → alert shown, no extra workbook');
    else if (!test5Alert) assertions.push('FAIL: TEST 5 missing expected alert');
    else
        assertions.push(
            `FAIL: TEST 5 expected exactly 5 captured workbooks (TEST 1-4 + TEST 6), got ${captured.length}`
        );

    // TEST 6: TOMATO on Tất cả tab → both TM1 and T100 (no 0đ filter applied) — last entry
    const wb6 = captured[captured.length - 1];
    if (wb6 && wb6.filename.startsWith('TOMATO_')) {
        const sheetVals = Object.values(wb6.sheets);
        const dataRows = sheetVals.flatMap((rows) => rows.slice(1, -1));
        const numbers = dataRows
            .map((r) => r[1])
            .sort()
            .join(',');
        if (numbers === 'T100,TM1') assertions.push('PASS: TEST 6 TOMATO on Tất cả tab → TM1,T100');
        else
            assertions.push(
                `FAIL: TEST 6 TOMATO on Tất cả tab → [${numbers}], expected [T100,TM1]`
            );
    } else {
        assertions.push(`FAIL: TEST 6 expected last wb filename TOMATO_*, got ${wb6?.filename}`);
    }

    assertions.forEach((a) => console.log('  ' + a));
    const failed = assertions.filter((a) => a.startsWith('FAIL:'));
    console.log(`\n${failed.length} failures.`);

    console.log('\n=== ERRORS ===');
    console.log('TOTAL:', errors.length);
    errors.slice(0, 20).forEach((e, i) => console.log(`${i + 1}. ${e.slice(0, 200)}`));

    await browser.close();
    process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
    console.error('FATAL:', e);
    process.exit(2);
});
