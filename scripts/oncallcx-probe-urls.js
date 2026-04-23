#!/usr/bin/env node
// Probe một loạt URL .xhtml có thể chứa call recordings

const fs = require('fs');
const path = require('path');
const SECRETS_FILE = path.resolve(__dirname, '..', 'serect_dont_push.txt');

const CANDIDATES = [
    'pbxCalls.xhtml',
    'pbxCallAnalytics.xhtml',
    'pbxCallHistory.xhtml',
    'pbxCallRecords.xhtml',
    'pbxCallRecording.xhtml',
    'pbxCallRecordings.xhtml',
    'pbxCdr.xhtml',
    'pbxCallLogs.xhtml',
    'pbxRecordings.xhtml',
    'pbxVoicemail.xhtml',
    'pbxVoicemails.xhtml',
    'pbxLogs.xhtml',
    'pbxCallReport.xhtml',
    'pbxReports.xhtml',
    'pbxCallLog.xhtml',
    'pbxCallList.xhtml',
    'pbxLiveCalls.xhtml',
    'pbxLiveCallMonitoring.xhtml',
    'pbxExtensionCalls.xhtml',
    'callHistory.xhtml',
    'callRecordings.xhtml',
    'calls.xhtml',
    'cdr.xhtml',
    'logs.xhtml',
    'reports.xhtml',
    'recordings.xhtml',
    'voicemails.xhtml',
    'privateNumbers.xhtml',
    'publicNumbers.xhtml',
];

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
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto('https://pbx-ucaas.oncallcx.vn/portal/login.xhtml', {
        waitUntil: 'networkidle',
    });
    await page.locator('input[type="text"]').first().fill(creds.username);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.locator('button[type="submit"], input[type="submit"]').first().click(),
    ]);
    await page.waitForTimeout(2000);

    const results = [];
    for (const url of CANDIDATES) {
        const full = 'https://pbx-ucaas.oncallcx.vn/portal/' + url;
        try {
            const resp = await page.goto(full, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(800);
            const finalUrl = page.url();
            const title = await page.title();
            const is404 = finalUrl.includes('404');
            results.push({
                url,
                finalUrl,
                title: title.slice(0, 80),
                is404,
                status: resp?.status(),
            });
            console.log(
                `${is404 ? '❌' : '✅'} ${url.padEnd(34)} -> ${finalUrl.replace('https://pbx-ucaas.oncallcx.vn/portal/', '')} | ${title.slice(0, 60)}`
            );
        } catch (e) {
            results.push({ url, error: e.message });
            console.log(`⚠️  ${url.padEnd(34)} ERROR ${e.message.slice(0, 60)}`);
        }
    }
    fs.writeFileSync(
        path.resolve(__dirname, '..', 'docs', 'oncallcx-url-probe.json'),
        JSON.stringify(results, null, 2)
    );
    console.log('\n=== VALID PAGES ===');
    results
        .filter((r) => !r.is404 && !r.error)
        .forEach((r) => console.log(`  ${r.url} -> ${r.title}`));
    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
