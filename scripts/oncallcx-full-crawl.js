#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * OnCallCX Portal — Full Crawl
 *
 * Mục tiêu: map toàn bộ pages + AJAX requests + data models để hiểu
 * cách portal hoạt động, phục vụ build HTTP-only client.
 *
 * Với mỗi page:
 *   - Navigate sau login
 *   - Dump HTML
 *   - Ghi lại: title, tables (id, rows, headers), buttons (actions),
 *     network requests (method, url, payload), cookies
 *   - Extract ViewState, form id, action URLs
 *
 * Output: docs/oncallcx/<page>.json + docs/oncallcx/<page>.html
 *         docs/oncallcx/portal-map.md (tổng hợp)
 */

const fs = require('fs');
const path = require('path');

const SECRETS_FILE = path.resolve(__dirname, '..', 'serect_dont_push.txt');
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'oncallcx');

const PAGES = [
    { id: 'dashboard', url: 'https://pbx-ucaas.oncallcx.vn/portal/pbxDashboard.xhtml', label: 'Dashboard' },
    { id: 'calls', url: 'https://pbx-ucaas.oncallcx.vn/portal/pbxCalls.xhtml', label: 'Calls / CDR' },
    { id: 'liveCalls', url: 'https://pbx-ucaas.oncallcx.vn/portal/pbxLiveCallMonitoring.xhtml', label: 'Live Calls Monitoring' },
    { id: 'extensions', url: 'https://pbx-ucaas.oncallcx.vn/portal/privateNumbers.xhtml', label: 'Extensions' },
    { id: 'publicNumbers', url: 'https://pbx-ucaas.oncallcx.vn/portal/publicNumbers.xhtml', label: 'Public Numbers (DID)' },
    { id: 'logs', url: 'https://pbx-ucaas.oncallcx.vn/portal/logs.xhtml', label: 'Logs' },
];

function readCreds() {
    const content = fs.readFileSync(SECRETS_FILE, 'utf8');
    const line = content.split('\n').find(l => l.includes('pbx-ucaas.oncallcx.vn') && !l.includes('PBX_HOST'));
    const after = line.replace(/^\s*\d+\/?\s*/, '').replace(/"[^"]*"\s*/, '');
    const parts = after.trim().split(/\s+/);
    return { username: parts[0], password: parts.slice(1).join(' ') };
}

async function inspectPage(page, info) {
    const net = [];
    page.removeAllListeners('request');
    page.removeAllListeners('response');
    page.on('request', req => {
        if (!req.url().includes('oncallcx')) return;
        net.push({ phase: 'req', method: req.method(), url: req.url(), post: req.postData()?.slice(0, 2000), resourceType: req.resourceType() });
    });
    page.on('response', async res => {
        if (!res.url().includes('oncallcx')) return;
        const ct = res.headers()['content-type'] || '';
        net.push({ phase: 'res', status: res.status(), url: res.url(), contentType: ct, length: res.headers()['content-length'] });
    });

    try {
        await page.goto(info.url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
        return { id: info.id, error: 'goto-failed: ' + e.message };
    }
    await page.waitForTimeout(2500);

    const title = await page.title();
    const finalUrl = page.url();
    const is404 = finalUrl.includes('404');
    const html = await page.content();
    fs.writeFileSync(path.join(OUT_DIR, `${info.id}.html`), html);

    const parsed = await page.evaluate(() => {
        const tables = [...document.querySelectorAll('.ui-datatable, table[id]')].map(t => ({
            id: t.id,
            rowCount: t.querySelectorAll('tbody tr[data-ri], tbody tr').length,
            headers: [...t.querySelectorAll('thead th .ui-column-title, thead th')].map(h => h.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 20),
            firstRow: (() => {
                const r = t.querySelector('tbody tr[data-ri], tbody tr');
                if (!r) return null;
                return [...r.querySelectorAll('td')].map(td => (td.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60));
            })(),
        }));
        const buttons = [...document.querySelectorAll('button[id], a.ui-button[id]')].map(b => ({
            id: b.id, text: (b.textContent || '').trim().slice(0, 40),
            disabled: b.hasAttribute('disabled'), type: b.type || '',
        })).filter(b => b.text);
        const viewState = document.querySelector('input[name="javax.faces.ViewState"]')?.value || null;
        const forms = [...document.querySelectorAll('form[id]')].map(f => ({ id: f.id, action: f.action, method: f.method }));
        const pagLabel = document.querySelector('.ui-paginator-current')?.textContent?.trim() || null;
        const errorBox = document.querySelector('.ui-messages-error, .ui-message-error')?.textContent?.trim() || null;
        return { tables, buttons, viewState, forms, paginator: pagLabel, error: errorBox };
    });

    return {
        id: info.id,
        label: info.label,
        url: info.url,
        finalUrl,
        title,
        is404,
        ...parsed,
        network: net,
    };
}

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const { chromium } = require('playwright');
    const creds = readCreds();

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Login
    await page.goto('https://pbx-ucaas.oncallcx.vn/portal/login.xhtml', { waitUntil: 'networkidle' });
    await page.locator('input[type="text"]').first().fill(creds.username);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.locator('button[type="submit"], input[type="submit"]').first().click()]);
    await page.waitForTimeout(2000);
    console.log('[ok] Logged in');

    const results = [];
    for (const p of PAGES) {
        console.log(`\n[crawl] ${p.id} -> ${p.url}`);
        const r = await inspectPage(page, p);
        results.push(r);
        fs.writeFileSync(path.join(OUT_DIR, `${p.id}.json`), JSON.stringify(r, null, 2));
        if (r.error) { console.log(`  ERR: ${r.error}`); continue; }
        console.log(`  title: ${r.title}  404: ${r.is404}  tables: ${r.tables?.length || 0}  buttons: ${r.buttons?.length || 0}`);
        if (r.tables) r.tables.forEach(t => console.log(`    - ${t.id} rows=${t.rowCount} cols=[${t.headers.slice(0, 8).join(', ')}]`));
    }

    // Build portal-map.md
    let md = '# OnCallCX Portal Map\n\n> Auto-generated by scripts/oncallcx-full-crawl.js\n\n';
    md += `Account: ${creds.username}\n\nCrawled: ${new Date().toISOString()}\n\n`;
    md += '## Pages\n\n';
    for (const r of results) {
        md += `### ${r.label} — \`${r.id}\`\n`;
        md += `- URL: \`${r.url}\`\n`;
        md += `- Final URL: \`${r.finalUrl}\`\n`;
        md += `- Title: **${r.title}**\n`;
        md += `- 404: ${r.is404}\n`;
        if (r.viewState) md += `- ViewState present: yes\n`;
        if (r.forms?.length) md += `- Forms: ${r.forms.map(f => `\`${f.id}\` (${f.method})`).join(', ')}\n`;
        if (r.tables?.length) {
            md += `- Tables:\n`;
            r.tables.forEach(t => {
                md += `  - \`${t.id}\`: ${t.rowCount} rows, cols: [${t.headers.slice(0, 10).join(', ')}]\n`;
            });
        }
        if (r.buttons?.length) {
            md += `- Buttons:\n`;
            r.buttons.slice(0, 20).forEach(b => md += `  - \`${b.id}\`: ${b.text}${b.disabled ? ' (disabled)' : ''}\n`);
        }
        if (r.paginator) md += `- Paginator: ${r.paginator}\n`;
        md += '\n';
    }
    md += '## AJAX Request Patterns\n\nPrimeFaces AJAX requests use body:\n\n```\njavax.faces.partial.ajax=true\n&javax.faces.source=<componentId>\n&javax.faces.partial.execute=<componentId>\n&javax.faces.partial.render=<componentId>\n&<form>_SUBMIT=1\n&javax.faces.ViewState=<token>\n&primefaces.nonce=<uuid>\n```\n';
    fs.writeFileSync(path.join(OUT_DIR, 'portal-map.md'), md);
    console.log(`\n[done] Wrote ${results.length} pages + portal-map.md`);
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
