// #Note: Local test script — capture TPOS print barcode HTML blob để mirror Web 2.0.
// Real Playwright mouse clicks (NOT JS .click) để Angular ng-click trigger đúng.
//
// Usage: node scripts/capture-tpos-print-blob.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STORAGE_STATE = '/Users/mac/Desktop/n2store/downloads/n2store-session/tpos-storage.json';
const OUT_DIR = '/Users/mac/Desktop/n2store/downloads/n2store-session';
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

(async () => {
    if (!fs.existsSync(STORAGE_STATE)) {
        console.error('[capture] missing storage state:', STORAGE_STATE);
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: false, slowMo: 250 });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
        storageState: STORAGE_STATE,
    });
    const page = await context.newPage();

    // Capture ALL networks
    const networkLog = [];
    page.on('request', (req) => {
        const url = req.url();
        if (/tpos|tomato|barcode|print/i.test(url)) {
            networkLog.push({ t: 'req', m: req.method(), url, at: Date.now() });
        }
    });
    page.on('response', async (res) => {
        const url = res.url();
        if (/BarcodeProductLabel|PrintBarcode|barcode|print/i.test(url)) {
            const entry = {
                t: 'resp',
                s: res.status(),
                url,
                ct: res.headers()['content-type'],
                at: Date.now(),
            };
            try {
                if (res.status() === 200) entry.body = (await res.text()).slice(0, 30000);
            } catch {}
            networkLog.push(entry);
        }
    });
    context.on('page', async (newPage) => {
        try {
            await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
            const url = newPage.url();
            const html = await newPage.content().catch(() => '');
            const savePath = path.join(OUT_DIR, `tpos-newpage-${TS}.html`);
            fs.writeFileSync(savePath, html);
            console.log('[capture] NEW PAGE:', url, '→', savePath, html.length, 'chars');
        } catch (e) {
            console.log('[capture] new page error:', e.message);
        }
    });
    page.on('download', async (dl) => {
        const p = path.join(OUT_DIR, `tpos-dl-${TS}-${dl.suggestedFilename()}`);
        await dl.saveAs(p);
        console.log('[capture] DOWNLOAD:', dl.suggestedFilename(), '→', p);
    });

    // Step 1: Product TEMPLATE list (user pointed này — có In mã vạch trong Thao tác)
    console.log('[capture] (1) nav producttemplate list');
    await page.goto('https://tomato.tpos.vn/#/app/producttemplate/list', {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(10000);
    await page.waitForSelector('tbody tr', { timeout: 15000 });

    // Step 2: REAL click first row checkbox via Playwright check() (handles
    // scroll + label automatically). Use .check() instead of .click() — works
    // with Kendo Grid hidden checkboxes + labels.
    console.log('[capture] (2) real click first product checkbox');
    const firstCheckbox = page.locator('tbody tr').first().locator('input[type=checkbox]').first();
    await firstCheckbox.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    try {
        await firstCheckbox.check({ force: true });
    } catch (e) {
        console.log('[capture] check() failed, fallback dispatchEvent:', e.message.slice(0, 100));
        await firstCheckbox.evaluate((el) => {
            el.click();
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }
    await page.waitForTimeout(2000);

    // Get product info
    const productInfo = await page.evaluate(() => {
        const row = document.querySelector('tbody tr');
        return [...(row?.cells || [])].map((c) => c.textContent.trim()).slice(0, 6);
    });
    console.log('[capture] selected product:', productInfo);

    // Step 3: Hook BEFORE clicking sidebar — intercept window.open + URL.createObjectURL + iframe
    console.log('[capture] (3) install hooks');
    await page.evaluate(() => {
        window.__cap = {
            opens: [],
            blobs: [],
            iframes: [],
            httpGets: [],
            httpPosts: [],
        };
        // Hook window.open
        const _wo = window.open;
        window.open = function (...a) {
            window.__cap.opens.push({ url: String(a[0] || '').slice(0, 500), at: Date.now() });
            return _wo.apply(this, a);
        };
        // Hook URL.createObjectURL — TPOS dùng cho blob iframe
        const _co = URL.createObjectURL;
        URL.createObjectURL = function (blob) {
            const u = _co.apply(this, arguments);
            const idx =
                window.__cap.blobs.push({
                    url: u,
                    type: blob?.type,
                    size: blob?.size,
                    at: Date.now(),
                }) - 1;
            blob.text?.().then((t) => {
                window.__cap.blobs[idx].text = t.slice(0, 50000);
            });
            return u;
        };
        // Hook XHR low-level — catches $resource + $http
        const _open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__m = method;
            this.__u = url;
            return _open.apply(this, arguments);
        };
        const _send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (body) {
            const xhr = this;
            if (/BarcodeProductLabel|PrintBarcode/i.test(this.__u || '')) {
                xhr.addEventListener('load', () => {
                    const arr = xhr.__m === 'POST' ? window.__cap.httpPosts : window.__cap.httpGets;
                    arr.push({
                        url: xhr.__u,
                        status: xhr.status,
                        ct: xhr.getResponseHeader('content-type'),
                        bodyLen: xhr.responseText?.length,
                        body: xhr.responseText?.slice(0, 50000),
                    });
                });
            }
            return _send.apply(this, arguments);
        };
        // Mutation observer to catch dynamically inserted iframes (printer service
        // tạo hidden iframe rồi insert HTML qua document.write)
        const mo = new MutationObserver((muts) => {
            for (const m of muts) {
                for (const node of m.addedNodes) {
                    if (node.tagName === 'IFRAME') {
                        setTimeout(() => {
                            try {
                                const doc = node.contentDocument;
                                if (doc) {
                                    window.__cap.iframes.push({
                                        idx: window.__cap.iframes.length,
                                        html: doc.documentElement?.outerHTML?.slice(0, 80000),
                                        url: node.src || '(srcdoc)',
                                        at: Date.now(),
                                    });
                                }
                            } catch (e) {}
                        }, 1500);
                    }
                }
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });
        window.__cap.moInstalled = true;
    });

    // Step 4: Click Thao tác dropdown → "In mã vạch" (THIS page has it!)
    console.log('[capture] (4) click Thao tác → In mã vạch');
    const thaoTacBtn = page.locator('button:has-text("Thao tác")').first();
    await thaoTacBtn.scrollIntoViewIfNeeded();
    await thaoTacBtn.click({ force: true });
    await page.waitForTimeout(1500);
    // Now click "In mã vạch" trong dropdown (KHÔNG phải "In mã vạch từ mã sản phẩm")
    const inMaVach = page
        .locator('ul.dropdown-menu:visible a:has-text("In mã vạch"):not(:has-text("từ mã"))')
        .first();
    try {
        await inMaVach.click({ force: true });
        console.log('[capture] In mã vạch clicked');
    } catch (e) {
        console.log('[capture] In mã vạch click err:', e.message.slice(0, 200));
        // Fallback: pick any "In mã vạch" item in visible menu
        await page.evaluate(() => {
            const visibleMenu = [...document.querySelectorAll('ul.dropdown-menu')].find(
                (m) => m.offsetParent !== null
            );
            if (visibleMenu) {
                const items = [...visibleMenu.querySelectorAll('a')];
                const exact = items.find((a) => a.textContent.trim() === 'In mã vạch');
                (exact || items.find((a) => /^In mã vạch/i.test(a.textContent.trim())))?.click();
            }
        });
    }
    await page.waitForTimeout(10000);
    console.log('[capture] URL after click:', page.url());

    // Wait for Paper combobox + lines population
    await page.waitForTimeout(4000);

    // Step 5: Set Paper via Kendo widget API + check lines
    console.log('[capture] (5) set Paper + check lines');
    const setupResult = await page.evaluate(async () => {
        const $ = window.jQuery || window.$;
        const $injector = window.angular.element(document.body).injector();
        const $rs = $injector.get('$rootScope');
        let target = null;
        function walk(s, d) {
            if (!s || d > 20) return;
            if (s.vm?.savePdf && !target) target = s;
            let c = s.$$childHead;
            while (c) {
                walk(c, d + 1);
                c = c.$$nextSibling;
            }
        }
        walk($rs, 0);
        if (!target) return { error: 'no vm scope' };

        // Set Paper if not already
        if (!target.vm.model.Paper) {
            const $sel = $('select[name="vm.model.Paper"]');
            const widget = $sel.data('kendoComboBox') || $sel.data('kendoDropDownList');
            if (widget) {
                await new Promise((r) => widget.dataSource.fetch(r));
                const papers = widget.dataSource.data().toJSON
                    ? widget.dataSource.data().toJSON()
                    : Array.from(widget.dataSource.data());
                if (papers.length) {
                    target.$apply(() => {
                        target.vm.model.Paper = papers[0];
                        target.vm.model.PaperId = papers[0].Id;
                        if (typeof target.vm.changePaper === 'function') target.vm.changePaper();
                    });
                }
            }
        }
        return {
            url: location.href,
            linesLen: target.vm.lines?.length,
            line0: target.vm.lines?.[0],
            paperName: target.vm.model?.Paper?.Name,
            paperId: target.vm.model?.PaperId,
            hasPriceList: !!target.vm.model?.PriceList,
        };
    });
    console.log('[capture] setup:', JSON.stringify(setupResult).slice(0, 600));

    // Step 5b: Add product via search input on print page (proper UI flow)
    if (setupResult.linesLen === 0) {
        console.log('[capture] (5b) add product via search input "Q370X"');
        const searchInput = page.locator('input#searchString').first();
        try {
            await searchInput.scrollIntoViewIfNeeded();
            await searchInput.click();
            await searchInput.fill('Q370X');
            await page.waitForTimeout(1500);
            // Press Enter to trigger search
            await searchInput.press('Enter');
            await page.waitForTimeout(3000);
            // Click first suggestion in autocomplete dropdown
            const suggestion = page.locator('.k-list .k-item, ul.k-list li, .ui-menu-item').first();
            try {
                await suggestion.click({ force: true, timeout: 5000 });
            } catch {}
            await page.waitForTimeout(2000);
            const linesAfter = await page.evaluate(() => {
                const $rs = window.angular.element(document.body).injector().get('$rootScope');
                let target = null;
                function walk(s, d) {
                    if (!s || d > 20) return;
                    if (s.vm?.savePdf && !target) target = s;
                    let c = s.$$childHead;
                    while (c) {
                        walk(c, d + 1);
                        c = c.$$nextSibling;
                    }
                }
                walk($rs, 0);
                return {
                    linesLen: target?.vm?.lines?.length,
                    line0Keys: target?.vm?.lines?.[0] ? Object.keys(target.vm.lines[0]) : null,
                    line0Sample: target?.vm?.lines?.[0],
                };
            });
            console.log('[capture] after search:', JSON.stringify(linesAfter).slice(0, 600));
        } catch (e) {
            console.log('[capture] search add failed:', e.message.slice(0, 200));
        }
    }

    // Set PriceList (required by validator) + ensure PaperId set
    console.log('[capture] (6) set PriceList + PaperId');
    const priceListSetup = await page.evaluate(async () => {
        const $ = window.jQuery || window.$;
        const $rs = window.angular.element(document.body).injector().get('$rootScope');
        let target = null;
        function walk(s, d) {
            if (!s || d > 20) return;
            if (s.vm?.savePdf && !target) target = s;
            let c = s.$$childHead;
            while (c) {
                walk(c, d + 1);
                c = c.$$nextSibling;
            }
        }
        walk($rs, 0);
        if (!target) return { error: 'no scope' };
        // Set PaperId
        if (target.vm.model.Paper && !target.vm.model.PaperId) {
            target.$apply(() => {
                target.vm.model.PaperId = target.vm.model.Paper.Id;
            });
        }
        // Fetch PriceList datasource via Kendo widget
        const $plSel = $('select[name="vm.model.PriceList"]');
        const plWidget = $plSel.data('kendoComboBox') || $plSel.data('kendoDropDownList');
        if (plWidget) {
            await new Promise((r) => plWidget.dataSource.fetch(r));
            const lists = plWidget.dataSource.data().toJSON
                ? plWidget.dataSource.data().toJSON()
                : Array.from(plWidget.dataSource.data());
            if (lists.length) {
                target.$apply(() => {
                    target.vm.model.PriceList = lists[0];
                    target.vm.model.PriceListId = lists[0].Id;
                });
                return { plName: lists[0].Name, plId: lists[0].Id, lists: lists.length };
            }
            return { error: 'no pricelist data' };
        }
        return { error: 'no kendo widget' };
    });
    console.log('[capture] priceList setup:', JSON.stringify(priceListSetup).slice(0, 500));

    // Set Quantity on all lines (validator requires total > 0)
    await page.evaluate(() => {
        const $rs = window.angular.element(document.body).injector().get('$rootScope');
        let target = null;
        function walk(s, d) {
            if (!s || d > 20) return;
            if (s.vm?.savePdf && !target) target = s;
            let c = s.$$childHead;
            while (c) {
                walk(c, d + 1);
                c = c.$$nextSibling;
            }
        }
        walk($rs, 0);
        if (target?.vm?.lines) {
            target.$apply(() => {
                target.vm.lines.forEach((l) => {
                    if (!l.Quantity || l.Quantity <= 0) l.Quantity = 2;
                });
            });
        }
    });
    await page.waitForTimeout(1000);

    // Step 6: Check vm state pre-click
    const preClick = await page.evaluate(() => {
        const $injector = window.angular?.element(document.body).injector();
        if (!$injector) return { error: 'no injector' };
        const $rs = $injector.get('$rootScope');
        let target = null;
        function walk(s, d) {
            if (!s || d > 20) return;
            if (s.vm?.savePdf && !target) target = s;
            let c = s.$$childHead;
            while (c) {
                walk(c, d + 1);
                c = c.$$nextSibling;
            }
        }
        walk($rs, 0);
        return {
            url: location.href,
            linesLen: target?.vm?.lines?.length,
            paperName: target?.vm?.model?.Paper?.Name,
            paperId: target?.vm?.model?.PaperId,
            hasPriceList: !!target?.vm?.model?.PriceList,
        };
    });
    console.log('[capture] preClick state:', JSON.stringify(preClick));

    // Step 7: REAL click "In bằng pdf" button
    console.log('[capture] (7) real click In bằng pdf');
    const printBtn = page.locator('button:has-text("In bằng pdf")').first();
    try {
        await printBtn.scrollIntoViewIfNeeded();
        await printBtn.click({ force: true });
        console.log('[capture] click succeeded, waiting for response...');
    } catch (e) {
        console.log('[capture] click error:', e.message.slice(0, 200));
    }
    await page.waitForTimeout(15000);

    // Wait extra for blob text resolution
    await page.waitForTimeout(3000);

    // Step 8: Read captured data
    const result = await page.evaluate(() => window.__cap);

    // Save blob contents (THIS is TPOS print HTML!)
    for (let i = 0; i < result.blobs.length; i++) {
        const b = result.blobs[i];
        const p = path.join(OUT_DIR, `tpos-blob-${i}-${TS}.html`);
        fs.writeFileSync(p, b.text || '(empty)');
        console.log(
            `[capture] BLOB ${i} (${b.type}, ${b.size}B) → ${p} (${b.text?.length || 0} chars)`
        );
    }
    console.log('[capture] result summary:', {
        opens: result.opens.length,
        blobs: result.blobs.length,
        iframes: result.iframes.length,
        httpPosts: result.httpPosts.length,
        httpGets: result.httpGets.length,
    });

    // Save iframe HTMLs (TPOS print content!)
    for (let i = 0; i < result.iframes.length; i++) {
        const f = result.iframes[i];
        const p = path.join(OUT_DIR, `tpos-iframe-${i}-${TS}.html`);
        fs.writeFileSync(p, f.html || '(empty)');
        console.log(`[capture] iframe ${i} → ${p} (${f.html?.length || 0} chars)`);
    }
    // Save GET responses (PrintBarcodePDF)
    for (let i = 0; i < result.httpGets.length; i++) {
        const g = result.httpGets[i];
        const p = path.join(OUT_DIR, `tpos-httpget-${i}-${TS}.html`);
        fs.writeFileSync(p, g.body || '(empty)');
        console.log(`[capture] http GET ${i} (${g.url}) → ${p} (${g.bodyLen} chars)`);
    }
    // Save POST responses
    for (let i = 0; i < result.httpPosts.length; i++) {
        const post = result.httpPosts[i];
        console.log(`[capture] http POST ${i}: ${post.url} → ${post.status} (${post.bodyLen})`);
    }

    // Save full network log
    fs.writeFileSync(
        path.join(OUT_DIR, `tpos-network-${TS}.json`),
        JSON.stringify({ networkLog, capture: result, productInfo, preClick }, null, 2)
    );

    // Final screenshot
    await page.screenshot({ path: path.join(OUT_DIR, `tpos-final-${TS}.png`), fullPage: true });

    console.log('[capture] DONE. Browser stays open. Press Ctrl+C to exit.');
    await new Promise(() => {});
})();
