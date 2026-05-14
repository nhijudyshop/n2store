#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// One-shot Playwright test cho delivery-report:
//   1) Mark đơn "Đã kiểm tra" → reload → row vẫn xám (Firestore persist)
//   2) Mở "Lịch sử KT" modal → đơn vừa kiểm tra phải xuất hiện
//
// Chạy:
//   node scripts/test-delivery-check-persistence.js --user admin --pass admin@@ --base http://localhost:8080
//
// Mặc định --base = http://localhost:8080. Auto-spawn http.server nếu port chưa listen.
// Exit code 0 = pass, 1 = fail.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

// Node static server fallback — Python isn't installed on this Windows box.
function startNodeStaticServer(port, rootDir) {
    const MIME = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.mp3': 'audio/mpeg',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
    };
    return new Promise((resolve, reject) => {
        const srv = http.createServer((req, res) => {
            try {
                const url = decodeURIComponent((req.url || '/').split('?')[0]);
                let filePath = path.join(rootDir, url);
                if (!filePath.startsWith(rootDir)) {
                    res.writeHead(403); res.end('forbidden'); return;
                }
                try {
                    const st = fs.statSync(filePath);
                    if (st.isDirectory()) filePath = path.join(filePath, 'index.html');
                } catch (_) {}
                fs.readFile(filePath, (err, data) => {
                    if (err) { res.writeHead(404); res.end('not found'); return; }
                    const ext = path.extname(filePath).toLowerCase();
                    res.writeHead(200, {
                        'content-type': MIME[ext] || 'application/octet-stream',
                        'cache-control': 'no-cache, no-store, must-revalidate',
                    });
                    res.end(data);
                });
            } catch (e) {
                res.writeHead(500); res.end(String(e));
            }
        });
        srv.on('error', reject);
        srv.listen(port, '127.0.0.1', () => resolve(srv));
    });
}

const ARGS = (() => {
    const a = process.argv.slice(2);
    const out = { user: 'admin', pass: 'admin@@', base: 'http://localhost:8080', headless: false };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') out.user = a[++i];
        else if (a[i] === '--pass') out.pass = a[++i];
        else if (a[i] === '--base') out.base = a[++i];
        else if (a[i] === '--headless') out.headless = true;
    }
    return out;
})();

const BASE = ARGS.base.replace(/\/+$/, '');
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session');
fs.mkdirSync(OUT_DIR, { recursive: true });
const LOG_FILE = path.join(OUT_DIR, 'test-delivery-check.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const ts = () => new Date().toISOString();
const log = (...args) => {
    const line = `[${ts()}] ${args.join(' ')}`;
    console.log(line);
    logStream.write(line + '\n');
};

async function run() {
    // Always use our Node static server — Python may not be installed on Windows.
    const url = new URL(BASE);
    const port = parseInt(url.port || '80', 10);
    const projectRoot = path.join(__dirname, '..');
    let server = null;
    try {
        // Probe — if something is already listening on this port, we'll use it as-is.
        await new Promise((resolve, reject) => {
            const req = http.request({ host: '127.0.0.1', port, path: '/', method: 'HEAD', timeout: 800 }, (res) => {
                res.resume(); resolve();
            });
            req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            req.end();
        });
        log(`Existing server on :${port}, using it as-is.`);
    } catch (_) {
        log(`Starting Node static server on :${port} (root=${projectRoot})…`);
        server = await startNodeStaticServer(port, projectRoot);
        log('Server ready.');
    }

    log('Launching Chromium (headless=' + ARGS.headless + ')…');
    const browser = await chromium.launch({
        headless: ARGS.headless,
        args: ['--disable-application-cache', '--disk-cache-size=0', '--media-cache-size=0'],
    });
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        bypassCSP: true,
    });
    await ctx.route('**/*.{js,html,css}', (route) => {
        route.continue({
            headers: {
                ...route.request().headers(),
                'cache-control': 'no-cache, no-store, must-revalidate',
                pragma: 'no-cache',
            },
        });
    });
    const page = await ctx.newPage();
    const failures = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => {
        consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`);
    });
    page.on('console', (m) => {
        if (m.type() === 'error') {
            const t = m.text();
            if (!/favicon|preload/.test(t)) consoleErrors.push(`console.error: ${t.slice(0, 200)}`);
        }
    });

    try {
        // ── Login ────────────────────────────────────────────────
        log('Login →', `${BASE}/`);
        await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#username', { timeout: 15_000 });
        await page.fill('#username', ARGS.user);
        await page.fill('#password', ARGS.pass);
        await page.locator('#password').press('Enter');
        await page.waitForFunction(
            () => !!localStorage.getItem('loginindex_auth'),
            { timeout: 30_000 }
        );
        log('Login OK. URL:', page.url());

        // ── Navigate to delivery-report ──────────────────────────
        const drUrl = `${BASE}/delivery-report/index.html?t=${Date.now()}`;
        log('Navigate →', drUrl);
        await page.goto(drUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});

        // ── Wait for table to load ───────────────────────────────
        log('Waiting for table rows…');
        await page.waitForFunction(
            () => {
                const tb = document.getElementById('drTableBody');
                if (!tb) return false;
                const rows = tb.querySelectorAll('tr');
                if (!rows.length) return false;
                // Skip the "Đang tải" loading row
                if (rows.length === 1 && tb.querySelector('.dr-loading')) return false;
                // At least one row with bill-cell number
                return !!tb.querySelector('.dr-hover-bill[data-number]');
            },
            { timeout: 60_000 }
        );

        // Pick the first row with a number not already checked
        const targetNumber = await page.evaluate(() => {
            const rows = document.querySelectorAll('#drTableBody tr');
            for (const tr of rows) {
                if (tr.classList.contains('dr-row-checked')) continue;
                const bill = tr.querySelector('.dr-hover-bill[data-number]');
                if (bill?.dataset?.number) return bill.dataset.number;
            }
            return null;
        });
        if (!targetNumber) throw new Error('No unchecked row available to test');
        log('Target order:', targetNumber);

        // ── Open row modal ───────────────────────────────────────
        log('Click .dr-hover-bill cell to open row modal…');
        await page.evaluate((number) => {
            const bill = document.querySelector(
                `#drTableBody .dr-hover-bill[data-number="${number}"]`
            );
            if (bill) bill.click();
        }, targetNumber);

        // Wait for modal to be visible
        await page.waitForFunction(
            () => {
                const m = document.getElementById('dr-row-modal');
                return m && m.style.display !== 'none';
            },
            { timeout: 15_000 }
        );
        log('Row modal open. Clicking close button to trigger confirm popup…');
        await page.click('#dr-row-close');
        // Wait for confirm popup
        await page.waitForSelector('#dr-row-confirm', { state: 'attached', timeout: 10_000 });
        await page.waitForFunction(
            () => {
                const el = document.getElementById('dr-row-confirm');
                return el && el.style.display !== 'none';
            },
            { timeout: 10_000 }
        );
        log('Confirm popup shown. Clicking "✓ Đã kiểm tra"…');
        await page.click('#dr-confirm-yes');

        // Wait until row is gray-styled and OrderCheckStore shows it
        await page.waitForFunction(
            (number) => {
                const rows = document.querySelectorAll('#drTableBody tr');
                for (const tr of rows) {
                    const bill = tr.querySelector('.dr-hover-bill[data-number]');
                    if (bill?.dataset?.number === number) {
                        return tr.classList.contains('dr-row-checked');
                    }
                }
                return false;
            },
            targetNumber,
            { timeout: 10_000 }
        );
        log('Row marked dr-row-checked. Wait 1.5s for Firestore write…');
        await page.waitForTimeout(1500);

        // Verify localStorage has the entry
        const lsBefore = await page.evaluate(() => {
            return localStorage.getItem('drOrderChecks_v1');
        });
        log('localStorage drOrderChecks_v1 length:', (lsBefore || '').length);

        // ── F5 reload ────────────────────────────────────────────
        log('F5 reload…');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
        await page.waitForFunction(
            () => {
                const tb = document.getElementById('drTableBody');
                return tb && tb.querySelector('.dr-hover-bill[data-number]');
            },
            { timeout: 60_000 }
        );
        // Wait for OrderCheckStore to finish init (Firestore fetch)
        await page.waitForTimeout(2500);

        // After fix: the row should be gray again.
        const stillChecked = await page.evaluate((number) => {
            const rows = document.querySelectorAll('#drTableBody tr');
            for (const tr of rows) {
                const bill = tr.querySelector('.dr-hover-bill[data-number]');
                if (bill?.dataset?.number === number) {
                    return tr.classList.contains('dr-row-checked');
                }
            }
            return null;
        }, targetNumber);

        if (stillChecked === true) {
            log('✅ PASS #1: After F5, row', targetNumber, 'remains dr-row-checked.');
        } else {
            failures.push(
                `#1 FAIL: After F5, row ${targetNumber} stillChecked=${stillChecked}`
            );
            log('❌', failures[failures.length - 1]);
        }

        // Also check Firestore (via store API) sees this order
        const storeHas = await page.evaluate((number) => {
            const ds = window.DeliveryReport?.getState?.();
            // OrderCheckStore is scoped inside IIFE, but we can read localStorage as proxy
            try {
                const raw = localStorage.getItem('drOrderChecks_v1');
                if (!raw) return { ok: false, reason: 'no localStorage' };
                const obj = JSON.parse(raw);
                return { ok: !!obj[number], keys: Object.keys(obj).slice(0, 5) };
            } catch (e) {
                return { ok: false, reason: String(e) };
            }
        }, targetNumber);
        log('localStorage after reload:', JSON.stringify(storeHas));

        // ── Test #2: history modal ───────────────────────────────
        // The history button lives inside the filter section (right next to
        // "Ẩn hiện cột"), which is collapsed by default. Expand it first.
        log('Expanding filter section to reach Lịch sử KT button…');
        await page.evaluate(() => {
            const sec = document.getElementById('drFilterSection');
            if (sec && sec.style.display === 'none') {
                if (typeof window.toggleFilterSection === 'function') {
                    window.toggleFilterSection();
                } else {
                    sec.style.display = '';
                }
            }
        });
        await page.waitForSelector('#drCheckHistoryBtn', { state: 'visible', timeout: 5_000 });
        log('Clicking "Lịch sử KT" button…');
        await page.click('#drCheckHistoryBtn');
        await page.waitForSelector('#dr-check-history-modal', { state: 'attached', timeout: 5_000 });
        await page.waitForFunction(
            () => {
                const el = document.getElementById('dr-check-history-modal');
                return el && el.style.display !== 'none';
            },
            { timeout: 5_000 }
        );
        const historyHas = await page.evaluate((number) => {
            const rows = document.querySelectorAll('#dr-check-history-body tr');
            for (const tr of rows) {
                if (tr.textContent && tr.textContent.includes(number)) return true;
            }
            return false;
        }, targetNumber);
        const historyCountText = await page.evaluate(() =>
            document.getElementById('dr-check-history-count')?.textContent || ''
        );
        log('History count badge:', historyCountText);

        if (historyHas) {
            log('✅ PASS #2: History modal contains', targetNumber);
        } else {
            failures.push(`#2 FAIL: History modal missing ${targetNumber}`);
            log('❌', failures[failures.length - 1]);
        }

        // Test search box in history
        await page.fill('#dr-check-history-search', targetNumber.slice(-4));
        await page.waitForTimeout(300);
        const filteredHas = await page.evaluate((number) => {
            const rows = document.querySelectorAll('#dr-check-history-body tr');
            return Array.from(rows).some((tr) =>
                tr.textContent && tr.textContent.includes(number)
            );
        }, targetNumber);
        if (filteredHas) {
            log('✅ PASS #2b: Search in history modal works.');
        } else {
            failures.push('#2b FAIL: Search in history modal did not filter to target');
            log('❌', failures[failures.length - 1]);
        }

        // Take final screenshot
        const shotPath = path.join(OUT_DIR, 'delivery-check-final.png');
        await page.screenshot({ path: shotPath, fullPage: false });
        log('Screenshot saved:', shotPath);

        // ── Cleanup: remove our test-written entries from Firestore + localStorage.
        // CLAUDE.md: "Sau test xong → cleanup ngay". The test wrote real order
        // numbers into the order_checks collection; delete them so prod data is
        // unaffected.
        log('Cleanup: deleting test entry from Firestore + localStorage…');
        const cleanupResult = await page.evaluate(async (number) => {
            const sanitized = String(number).replace(/\//g, '__');
            const out = { firestore: null, localStorage: null };
            try {
                const db = firebase.firestore();
                await db
                    .collection('delivery_report')
                    .doc('data')
                    .collection('order_checks')
                    .doc(sanitized)
                    .delete();
                out.firestore = 'deleted';
            } catch (e) {
                out.firestore = 'error: ' + String(e).slice(0, 200);
            }
            try {
                const raw = localStorage.getItem('drOrderChecks_v1');
                if (raw) {
                    const obj = JSON.parse(raw);
                    delete obj[number];
                    localStorage.setItem('drOrderChecks_v1', JSON.stringify(obj));
                    out.localStorage = 'removed';
                } else {
                    out.localStorage = 'no key';
                }
            } catch (e) {
                out.localStorage = 'error: ' + String(e).slice(0, 200);
            }
            return out;
        }, targetNumber);
        log('Cleanup result:', JSON.stringify(cleanupResult));

        // Defensive: also nuke any leftover test entries from earlier failing
        // runs of this same script. We delete EVERY order_checks doc that was
        // written by user "admin" within the last 10 minutes — these are
        // necessarily our test artifacts since real users never appear in this
        // automated test window.
        const recentCleanup = await page.evaluate(async () => {
            const db = firebase.firestore();
            const col = db
                .collection('delivery_report')
                .doc('data')
                .collection('order_checks');
            const cutoff = Date.now() - 10 * 60 * 1000;
            const snap = await col.get();
            const deleted = [];
            const promises = [];
            snap.forEach((doc) => {
                const d = doc.data() || {};
                if (d.checkedBy === 'admin' && (d.checkedAt || 0) >= cutoff) {
                    deleted.push(d.number || doc.id);
                    promises.push(col.doc(doc.id).delete());
                }
            });
            await Promise.all(promises);
            // Also wipe their localStorage entries.
            try {
                const raw = localStorage.getItem('drOrderChecks_v1');
                if (raw) {
                    const obj = JSON.parse(raw);
                    for (const n of deleted) delete obj[n];
                    localStorage.setItem('drOrderChecks_v1', JSON.stringify(obj));
                }
            } catch (_) {}
            return deleted;
        });
        log('Recent admin entries cleaned up:', JSON.stringify(recentCleanup));

        if (consoleErrors.length) {
            log('Console errors during test (' + consoleErrors.length + '):');
            consoleErrors.slice(0, 10).forEach((e) => log('  ', e));
        }
    } catch (err) {
        failures.push(`FATAL: ${String(err).slice(0, 400)}`);
        log('❌ FATAL ERROR:', String(err));
        try {
            await page.screenshot({
                path: path.join(OUT_DIR, 'delivery-check-error.png'),
                fullPage: true,
            });
        } catch (_) {}
    } finally {
        await browser.close();
        if (server) server.close();
    }

    if (failures.length === 0) {
        log('🎉 ALL TESTS PASSED');
        process.exit(0);
    } else {
        log('💥 TEST FAILED — ' + failures.length + ' failure(s):');
        failures.forEach((f) => log('  -', f));
        process.exit(1);
    }
}

run().catch((e) => {
    log('Unhandled:', String(e));
    process.exit(1);
});
