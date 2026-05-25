// #Note: Local test script — capture TPOS print barcode HTML/blob để mirror Web 2.0.
// Đọc TPOS session từ serect_dont_push.txt (block "tpos_session" hoặc cookies persisted),
// navigate product list, click In mã vạch SP, capture network + iframe HTML, save JSON.
//
// Usage: node scripts/capture-tpos-print-blob.js
//
// Output: downloads/n2store-session/tpos-print-capture-*.json/.html

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STORAGE_STATE_FILE = '/Users/mac/Desktop/n2store/downloads/n2store-session/tpos-storage.json';
const OUT_DIR = '/Users/mac/Desktop/n2store/downloads/n2store-session';
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

(async () => {
    if (!fs.existsSync(STORAGE_STATE_FILE)) {
        console.error('[capture] missing storage state file:', STORAGE_STATE_FILE);
        console.error(
            '[capture] Run: curl POST http://localhost:9999/cmd ... storage ' + STORAGE_STATE_FILE
        );
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
        storageState: STORAGE_STATE_FILE,
    });
    console.log('[capture] loaded storage state from', STORAGE_STATE_FILE);

    const page = await context.newPage();

    // Download capture (PDF response từ TPOS)
    const downloads = [];
    page.on('download', async (download) => {
        const savePath = path.join(OUT_DIR, `tpos-download-${TS}-${download.suggestedFilename()}`);
        await download.saveAs(savePath);
        downloads.push({
            url: download.url(),
            suggestedFilename: download.suggestedFilename(),
            savedTo: savePath,
        });
        console.log('[capture] DOWNLOAD captured:', download.suggestedFilename(), '→', savePath);
    });

    // New page (window.open) capture
    const newPages = [];
    context.on('page', async (newPage) => {
        try {
            await newPage.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
            const url = newPage.url();
            const html = await newPage.content().catch(() => '');
            const savePath = path.join(OUT_DIR, `tpos-newpage-${TS}-${newPages.length}.html`);
            fs.writeFileSync(savePath, html);
            newPages.push({ url, savedTo: savePath, htmlSize: html.length });
            console.log('[capture] NEW PAGE captured:', url, '→', savePath);
        } catch (e) {
            console.log('[capture] new page error:', e.message);
        }
    });

    // Network capture
    const networkLog = [];
    page.on('request', (req) => {
        const url = req.url();
        if (/tpos|tomato|barcode/i.test(url)) {
            networkLog.push({ type: 'request', method: req.method(), url, headers: req.headers() });
        }
    });
    page.on('response', async (res) => {
        const url = res.url();
        if (/barcode|print|pdf/i.test(url)) {
            const entry = { type: 'response', status: res.status(), url, headers: res.headers() };
            try {
                const ct = res.headers()['content-type'] || '';
                if (/json|text|html|xml/i.test(ct) && res.status() === 200) {
                    entry.bodySnippet = (await res.text()).slice(0, 5000);
                }
            } catch {}
            networkLog.push(entry);
        }
    });

    console.log('[capture] navigating to TPOS product list...');
    await page.goto('https://tomato.tpos.vn/#/app/product/list', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    // Check login
    const isLoggedIn = await page.evaluate(() => !document.querySelector('input[type="password"]'));
    if (!isLoggedIn) {
        console.log('[capture] NOT logged in — login form detected. Aborting.');
        const html = await page.content();
        fs.writeFileSync(path.join(OUT_DIR, `tpos-print-NOT-LOGGED-IN-${TS}.html`), html);
        await browser.close();
        process.exit(1);
    }
    console.log('[capture] logged in. Selecting first product...');

    // Wait for grid + click first row checkbox via label
    await page.waitForSelector('tbody tr label.k-checkbox-label, tbody tr input[type=checkbox]', {
        timeout: 15000,
    });
    await page.waitForTimeout(2000);

    // Get first product info BEFORE clicking
    const firstProduct = await page.evaluate(() => {
        const row = document.querySelector('tbody tr');
        return {
            text: row?.textContent?.trim()?.slice(0, 200),
            cells: [...(row?.cells || [])].map((c) => c.textContent.trim().slice(0, 50)),
        };
    });
    console.log('[capture] first product:', firstProduct);

    // Click checkbox via Playwright locator — clicks the label (Kendo pattern)
    console.log('[capture] selecting first product...');
    await page
        .locator('tbody tr')
        .first()
        .locator('label.k-checkbox-label, input[type=checkbox]')
        .first()
        .click({ force: true });
    await page.waitForTimeout(1500);

    // Click sidebar "In mã vạch sản phẩm" while ON product list (preserves
    // selection state through Angular service). Direct nav loses state.
    console.log('[capture] clicking sidebar In mã vạch (preserve selection)...');
    // Sidebar link uses uiSref. Click via DOM if visible.
    await page.evaluate(() => {
        const link = [...document.querySelectorAll('a')].find(
            (a) =>
                /In mã vạch sản phẩm/i.test(a.textContent) &&
                a.getAttribute('ui-sref') === 'app.barcodeproductlabel.printbarcode'
        );
        if (link) {
            // Simulate real click via dispatchEvent — bypass intercept
            const rect = link.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            ['mousedown', 'mouseup', 'click'].forEach((type) =>
                link.dispatchEvent(
                    new MouseEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        clientX: x,
                        clientY: y,
                    })
                )
            );
        } else {
            // Fallback: programmatic UI-Router transition
            const $injector = window.angular?.element(document.body).injector();
            if ($injector) {
                const $state = $injector.get('$state');
                $state.go('app.barcodeproductlabel.printbarcode');
            }
        }
    });
    await page.waitForTimeout(10000);
    console.log('[capture] URL after sidebar click:', page.url());

    // Should be on printbarcode page now
    console.log('[capture] URL after In mã vạch:', page.url());

    // Capture print page state + waitfor Paper select to populate
    console.log('[capture] waiting for Paper options to load...');
    try {
        await page.waitForFunction(
            () => {
                const s = document.querySelector('select[name="vm.model.Paper"]');
                return s && s.options.length > 0;
            },
            { timeout: 30000 }
        );
        console.log('[capture] Paper options loaded');
    } catch {
        console.log('[capture] Paper options timeout — proceeding anyway');
    }
    await page.waitForTimeout(2000);
    const printPageInfo = await page.evaluate(() => {
        const paperSel = document.querySelector('select[name="vm.model.Paper"]');
        return {
            url: location.href,
            paperOpts: paperSel
                ? [...paperSel.options].map((o) => ({ v: o.value, t: o.textContent.trim() }))
                : [],
            selectedPaperVal: paperSel?.value,
            warehouseOpts: [
                ...(document.querySelector('select[name="vm.model.Warehouse"]')?.options || []),
            ].map((o) => o.textContent.trim()),
            productRows: [...document.querySelectorAll('tbody tr')]
                .filter((r) => !/Bảng giá|Giấy in|Kho/.test(r.textContent))
                .map((r) => r.textContent.trim().slice(0, 100))
                .slice(0, 5),
            html: document.documentElement.outerHTML,
        };
    });
    console.log('[capture] print page:', {
        url: printPageInfo.url,
        paperOpts: printPageInfo.paperOpts.length,
        products: printPageInfo.productRows.length,
    });

    fs.writeFileSync(path.join(OUT_DIR, `tpos-print-page-${TS}.html`), printPageInfo.html);

    // Install hooks to capture print iframe blob
    await page.evaluate(() => {
        window.__capture = { creates: [], opens: [], iframeHTMLs: [] };
        const _cou = URL.createObjectURL;
        URL.createObjectURL = function (blob) {
            const u = _cou.apply(this, arguments);
            window.__capture.creates.push({ url: u, type: blob?.type, size: blob?.size });
            // Read blob content
            blob.text?.().then((txt) => {
                window.__capture.creates[window.__capture.creates.length - 1].bodySnippet =
                    txt.slice(0, 50000);
            });
            return u;
        };
        const _w = window.open;
        window.open = function (...a) {
            window.__capture.opens.push({ url: a[0]?.toString()?.slice(0, 300) });
            return _w.apply(this, a);
        };
    });

    // Set Paper via Kendo combobox widget API. k-auto-bind="false" requires
    // explicit dataSource.fetch() to load options.
    console.log('[capture] triggering Paper Kendo widget...');
    await page
        .evaluate(async () => {
            const $ = window.jQuery || window.$;
            if (!$) return { error: 'no jQuery' };
            const $select = $('select[name="vm.model.Paper"]');
            const widget = $select.data('kendoComboBox') || $select.data('kendoDropDownList');
            if (!widget) return { error: 'no kendo widget' };
            // Fetch datasource
            await new Promise((resolve) => widget.dataSource.fetch(resolve));
            const data = widget.dataSource.data().toJSON
                ? widget.dataSource.data().toJSON()
                : Array.from(widget.dataSource.data());
            if (!data.length) return { error: 'datasource empty' };
            // Set first option, trigger change
            widget.value(data[0].Id);
            widget.trigger('change');
            // Also push to Angular scope
            const scope = window.angular?.element($select[0]).scope();
            if (scope) {
                scope.$apply(() => {
                    scope.vm.model.Paper = data[0];
                    if (typeof scope.vm.changePaper === 'function') scope.vm.changePaper();
                });
            }
            return {
                ok: true,
                paperCount: data.length,
                selectedName: data[0].Name,
                selectedId: data[0].Id,
                allPapers: data.map((p) => ({ id: p.Id, name: p.Name })),
            };
        })
        .then((r) => console.log('[capture] paper widget:', JSON.stringify(r)));
    await page.waitForTimeout(2000);

    // Hook console + invoke vm.savePdf directly via Angular scope to bypass
    // button click intercept issues + capture any error thrown.
    page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error' || /savePdf|barcode|pdf|print/i.test(text)) {
            console.log('[page.console]', msg.type(), text.slice(0, 300));
        }
    });
    page.on('pageerror', (err) => {
        console.log('[page.error]', err.message.slice(0, 300));
    });

    // Find the correct vm scope (button scope is wrong)
    console.log('[capture] finding correct vm scope on print page...');
    const scopeInfo = await page.evaluate(() => {
        if (!window.angular) return { error: 'no angular' };
        const found = [];
        document.querySelectorAll('.ng-scope, [ng-controller], [ui-view]').forEach((el) => {
            try {
                const s = window.angular.element(el).scope();
                if (s?.vm && (typeof s.vm.savePdf === 'function' || s.vm.paperDataSource)) {
                    found.push({
                        sel: el.tagName + '.' + (el.className?.toString().split(' ')[0] || ''),
                        hasSavePdf: typeof s.vm.savePdf === 'function',
                        hasPaperDS: !!s.vm.paperDataSource,
                        gridDataLen: Array.isArray(s.vm.gridData) ? s.vm.gridData.length : null,
                        modelPaperName: s.vm.model?.Paper?.Name,
                    });
                }
            } catch {}
        });
        return { found };
    });
    console.log('[capture] scope search:', JSON.stringify(scopeInfo).slice(0, 800));

    // Invoke vm.savePdf on the FOUND scope (with proper detection)
    console.log('[capture] invoking vm.savePdf()...');
    const savePdfResult = await page.evaluate(async () => {
        if (!window.angular) return { error: 'no angular' };
        let targetScope = null;
        document.querySelectorAll('.ng-scope, [ng-controller], [ui-view]').forEach((el) => {
            try {
                const s = window.angular.element(el).scope();
                if (s?.vm && typeof s.vm.savePdf === 'function') {
                    targetScope = s;
                }
            } catch {}
        });
        if (!targetScope) return { error: 'no scope with savePdf' };
        try {
            const result = await targetScope.vm.savePdf();
            return {
                ok: true,
                returnType: typeof result,
                returnVal: result?.toString?.()?.slice(0, 200),
            };
        } catch (e) {
            return {
                error: 'savePdf threw',
                msg: e.message?.slice(0, 300),
                stack: e.stack?.slice(0, 500),
            };
        }
    });
    console.log('[capture] savePdf result:', JSON.stringify(savePdfResult).slice(0, 600));

    // Wait for print response (download or new window)
    await page.waitForTimeout(15000);

    // Capture state
    const captureResult = await page.evaluate(() => {
        return {
            url: location.href,
            capture: window.__capture,
            allIframes: [...document.querySelectorAll('iframe')].map((i) => ({
                src: (i.src || '').slice(0, 200),
                srcdoc: i.srcdoc ? i.srcdoc.slice(0, 200) : null,
                contentHTML: i.contentDocument?.documentElement?.outerHTML?.slice(0, 50000),
            })),
        };
    });

    fs.writeFileSync(
        path.join(OUT_DIR, `tpos-print-capture-${TS}.json`),
        JSON.stringify(
            {
                networkLog,
                captureResult,
                firstProduct,
                printPageInfo: { ...printPageInfo, html: '(saved separately)' },
            },
            null,
            2
        )
    );
    console.log('[capture] saved:', path.join(OUT_DIR, `tpos-print-capture-${TS}.json`));

    // Also save iframe HTML if any
    for (let i = 0; i < (captureResult.allIframes || []).length; i++) {
        const f = captureResult.allIframes[i];
        if (f.contentHTML) {
            fs.writeFileSync(
                path.join(OUT_DIR, `tpos-print-iframe-${i}-${TS}.html`),
                f.contentHTML
            );
            console.log('[capture] saved iframe', i, 'HTML');
        }
    }

    // Take screenshot
    await page.screenshot({
        path: path.join(OUT_DIR, `tpos-print-final-${TS}.png`),
        fullPage: true,
    });
    console.log('[capture] screenshot saved');

    // Save updated session (cookies + localStorage for future use)
    const cookies = await context.cookies();
    const lsData = await page.evaluate(() => ({ ...localStorage }));
    fs.writeFileSync(
        path.join(OUT_DIR, `tpos-session-${TS}.json`),
        JSON.stringify({ cookies, localStorage: lsData }, null, 2)
    );

    console.log('[capture] DONE. Browser stays open. Press Ctrl+C to exit.');
    // Keep open for manual inspection
    await new Promise(() => {});
})();
