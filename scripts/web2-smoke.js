#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Web2 smoke test — load mỗi web2/<dir>/index.html, capture console/page errors + failed API calls.
// Run:
//   node scripts/web2-smoke.js --user admin --pass admin@@ --base http://localhost:8080
//   node scripts/web2-smoke.js --only application-user,tag --per-page-secs 8

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');

const ARGS = (() => {
    const a = process.argv.slice(2);
    const o = {
        user: 'admin',
        pass: 'admin@@',
        base: 'http://localhost:8080',
        concurrency: 4,
        perPageSecs: 8,
        only: null,
    };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') o.user = a[++i];
        else if (a[i] === '--pass') o.pass = a[++i];
        else if (a[i] === '--base') o.base = a[++i];
        else if (a[i] === '--concurrency') o.concurrency = Number(a[++i]) || 4;
        else if (a[i] === '--per-page-secs') o.perPageSecs = Number(a[++i]) || 8;
        else if (a[i] === '--only') o.only = a[++i].split(',').map((s) => s.trim());
    }
    return o;
})();

const BASE = ARGS.base.replace(/\/+$/, '');
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session');
fs.mkdirSync(OUT_DIR, { recursive: true });
const REPORT_JSON = path.join(OUT_DIR, 'web2-smoke-report.json');
const REPORT_MD = path.join(OUT_DIR, 'web2-smoke-report.md');

// Read manifest at test-time to ensure latest module list.
function readManifest() {
    const txt = fs.readFileSync(path.join(__dirname, '..', 'web2', 'modules-manifest.js'), 'utf8');
    const rx = /\{\s*dir:\s*'([^']+)',\s*title:\s*'([^']+)',\s*slug:\s*'([^']+)'/g;
    const out = [];
    let m;
    while ((m = rx.exec(txt))) out.push({ dir: m[1], title: m[2], slug: m[3] });
    return out;
}

// Login helper — admin form-based on /index.html
async function login(page) {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    // Form fields: input#username, input#password (assumption — fall through if missing)
    const user = await page
        .locator('input[type="text"], input[name="username"], #username')
        .first();
    const pass = await page
        .locator('input[type="password"], input[name="password"], #password')
        .first();
    if (await user.count()) {
        await user.fill(ARGS.user);
        await pass.fill(ARGS.pass);
        const btn = page
            .locator(
                'button[type="submit"], button:has-text("Đăng nhập"), button:has-text("Login")'
            )
            .first();
        await btn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    }
}

async function testModule(context, mod) {
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const networkErrors = [];
    const apiCalls = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            const text = msg.text();
            // skip noisy 3rd-party CDN failures
            if (/fonts\.gstatic|fonts\.googleapis|favicon\.ico/.test(text)) return;
            consoleErrors.push(text.slice(0, 300));
        }
    });
    page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 400)));
    page.on('response', (resp) => {
        const url = resp.url();
        const status = resp.status();
        if (url.includes('/api/web2/')) {
            apiCalls.push({ url: url.slice(url.indexOf('/api/web2/')), status });
        }
        if (status >= 400 && !url.includes('favicon')) {
            networkErrors.push(`${status} ${url.slice(0, 200)}`);
        }
    });

    const url = `${BASE}/web2/${mod.dir}/index.html?t=${Date.now()}`;
    let httpStatus = 0;
    try {
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        httpStatus = resp ? resp.status() : 0;
        // Wait for shell + list API to settle
        await page.waitForTimeout(ARGS.perPageSecs * 1000);
    } catch (err) {
        pageErrors.push(`NAV ${err.message}`);
    }

    // DOM markers — table OR empty-state must exist
    const hasTable = await page
        .locator('table, .table, .grid, .empty-state, [data-empty], h1')
        .count()
        .catch(() => 0);
    const title = await page.title().catch(() => '');

    await page.close();

    return {
        dir: mod.dir,
        slug: mod.slug,
        title: mod.title,
        httpStatus,
        pageTitle: title,
        hasTable: hasTable > 0,
        consoleErrors,
        pageErrors,
        networkErrors,
        apiCalls,
        ok: consoleErrors.length === 0 && pageErrors.length === 0 && networkErrors.length === 0,
    };
}

async function main() {
    await ensureLocalServer(BASE);
    let modules = readManifest();
    if (ARGS.only) {
        modules = modules.filter((m) => ARGS.only.includes(m.dir) || ARGS.only.includes(m.slug));
    }
    console.log(
        `[web2-smoke] testing ${modules.length} modules at ${BASE}, concurrency=${ARGS.concurrency}`
    );

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    const loginPage = await context.newPage();
    await login(loginPage);
    await loginPage.close();

    // Test in parallel batches
    const results = [];
    for (let i = 0; i < modules.length; i += ARGS.concurrency) {
        const batch = modules.slice(i, i + ARGS.concurrency);
        const batchResults = await Promise.all(batch.map((m) => testModule(context, m)));
        for (const r of batchResults) {
            const flag = r.ok ? '✓' : '✗';
            console.log(
                `  ${flag} ${r.dir.padEnd(40)} http=${r.httpStatus} api=${r.apiCalls.length} err=${r.consoleErrors.length + r.pageErrors.length + r.networkErrors.length}`
            );
            results.push(r);
        }
    }

    await browser.close();

    // Aggregate report
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    const summary = {
        base: BASE,
        timestamp: new Date().toISOString(),
        total: results.length,
        ok: okCount,
        fail: failCount,
        results,
    };
    fs.writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2));

    let md = `# Web2 Smoke Report\n\n- **Base**: ${BASE}\n- **At**: ${summary.timestamp}\n- **Total**: ${results.length}, ok=${okCount}, fail=${failCount}\n\n`;
    if (failCount > 0) {
        md += `## Failing modules\n\n`;
        for (const r of results.filter((x) => !x.ok)) {
            md += `### \`${r.dir}\` — ${r.title}\n\n`;
            md += `- HTTP ${r.httpStatus}, pageTitle="${r.pageTitle}", hasTable=${r.hasTable}\n`;
            if (r.consoleErrors.length)
                md +=
                    `- Console errors:\n` +
                    r.consoleErrors.map((e) => `  - \`${e}\``).join('\n') +
                    '\n';
            if (r.pageErrors.length)
                md +=
                    `- Page errors:\n` + r.pageErrors.map((e) => `  - \`${e}\``).join('\n') + '\n';
            if (r.networkErrors.length)
                md +=
                    `- Network errors:\n` +
                    r.networkErrors.map((e) => `  - \`${e}\``).join('\n') +
                    '\n';
            md +=
                `- API calls: ${r.apiCalls.length}` +
                (r.apiCalls.length ? ` (${r.apiCalls.map((a) => `${a.status}`).join(',')})` : '') +
                '\n\n';
        }
    } else {
        md += `## ✅ All modules OK\n`;
    }
    fs.writeFileSync(REPORT_MD, md);
    console.log(`\n[web2-smoke] DONE. ok=${okCount}, fail=${failCount}`);
    console.log(`  → ${REPORT_JSON}`);
    console.log(`  → ${REPORT_MD}`);
    process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('[web2-smoke] fatal:', err.message);
    console.error(err.stack);
    process.exit(2);
});
