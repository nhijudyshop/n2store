#!/usr/bin/env node
// Capture FULL request sequence khi download 1 recording
// Để build HTTP-only client

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
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();

    const reqs = [];
    page.on('request', (r) => {
        if (r.url().includes('oncallcx')) {
            reqs.push({
                phase: 'req',
                method: r.method(),
                url: r.url(),
                headers: r.headers(),
                post: r.postData(),
                ts: Date.now(),
            });
        }
    });
    page.on('response', async (r) => {
        if (r.url().includes('oncallcx') && r.request().method() !== 'GET') {
            let body = null;
            try {
                const b = await r.body();
                body = b.slice(0, 2000).toString('utf8');
            } catch {}
            reqs.push({
                phase: 'res',
                status: r.status(),
                url: r.url(),
                headers: r.headers(),
                body,
                ts: Date.now(),
            });
        } else if (r.url().includes('oncallcx')) {
            reqs.push({
                phase: 'res',
                status: r.status(),
                url: r.url(),
                headers: {
                    'content-type': r.headers()['content-type'],
                    'content-length': r.headers()['content-length'],
                },
                ts: Date.now(),
            });
        }
    });

    // Login
    await page.goto('https://pbx-ucaas.oncallcx.vn/portal/login.xhtml', {
        waitUntil: 'networkidle',
    });
    await page.locator('input[type="text"]').first().fill(creds.username);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.locator('button[type="submit"]').first().click(),
    ]);
    await page.waitForTimeout(2000);

    reqs.length = 0; // Clear — chỉ giữ từ sau login

    // Navigate tới Calls
    await page.goto('https://pbx-ucaas.oncallcx.vn/portal/pbxCalls.xhtml', {
        waitUntil: 'networkidle',
    });
    await page.waitForTimeout(2000);

    console.log('=== TRƯỚC KHI SELECT ===');
    console.log(
        'Recent POSTs:',
        reqs.filter((r) => r.phase === 'req' && r.method === 'POST').length
    );
    const preSelectReqs = reqs.length;

    // Select row 0 (first with recording)
    const radio = page
        .locator('#content\\:calls\\:calls tbody tr[data-ri="0"] .ui-radiobutton-box')
        .first();
    await radio.scrollIntoViewIfNeeded();
    await radio.click();
    await page.waitForTimeout(1500);

    console.log('\n=== SELECT ROW 0 — AJAX POST ===');
    const selectReqs = reqs
        .slice(preSelectReqs)
        .filter((r) => r.phase === 'req' && r.method === 'POST');
    selectReqs.forEach((r) => {
        console.log('URL:', r.url);
        console.log('Headers:');
        Object.entries(r.headers).forEach(([k, v]) =>
            console.log(`  ${k}: ${String(v).slice(0, 120)}`)
        );
        console.log('Body:', r.post);
        console.log('---');
    });

    // Get rowKey from DOM
    const rowKey = await page.evaluate(() => {
        return document
            .querySelector('#content\\:calls\\:calls tbody tr[data-ri="0"]')
            ?.getAttribute('data-rk');
    });
    console.log('rowKey of selected:', rowKey);

    const preDownloadReqs = reqs.length;

    // Click Download Audio
    const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 20000 }),
        page.locator('#content\\:calls\\:j_id_89').click(),
    ]);
    const fname = dl.suggestedFilename();
    const tmpPath = '/tmp/oncall_test_' + Date.now() + '.wav';
    await dl.saveAs(tmpPath);
    const sz = fs.statSync(tmpPath).size;
    console.log(`\n=== DOWNLOAD OK: ${fname} (${sz} bytes) @ ${tmpPath}`);

    console.log('\n=== DOWNLOAD REQUEST SEQUENCE ===');
    const dlReqs = reqs.slice(preDownloadReqs);
    dlReqs.forEach((r) => {
        if (r.phase === 'req') {
            console.log(`\n>>> ${r.method} ${r.url}`);
            if (r.post) console.log('Body:', r.post.slice(0, 500));
        } else {
            console.log(
                `<<< ${r.status} ${r.url} (ct=${r.headers?.['content-type'] || '?'}, len=${r.headers?.['content-length'] || '?'})`
            );
            if (r.body) console.log('Response body:', r.body.slice(0, 400));
        }
    });

    // Save full trace
    fs.writeFileSync(
        path.resolve(__dirname, '..', 'docs', 'oncallcx', 'download-flow-trace.json'),
        JSON.stringify(
            {
                rowKey,
                selectRequests: selectReqs,
                downloadRequests: dlReqs,
                filename: fname,
                size: sz,
            },
            null,
            2
        )
    );
    console.log('\nFull trace saved to docs/oncallcx/download-flow-trace.json');

    fs.unlinkSync(tmpPath);
    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
