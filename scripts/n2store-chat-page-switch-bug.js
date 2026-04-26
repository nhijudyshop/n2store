#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Repro: search SĐT → open chat modal → switch page → check whether wrong conversation loads.
// Run: node scripts/n2store-chat-page-switch-bug.js --user U --pass P [--phone 0914495309]

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ARGS = (() => {
    const a = process.argv.slice(2);
    const out = { user: '', pass: '', phone: '0914495309' };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') out.user = a[++i];
        else if (a[i] === '--pass') out.pass = a[++i];
        else if (a[i] === '--phone') out.phone = a[++i];
    }
    return out;
})();
if (!ARGS.user || !ARGS.pass) {
    console.error('Usage: --user U --pass P [--phone 0914495309]');
    process.exit(1);
}

const BASE = 'https://nhijudyshop.github.io/n2store';
const ORDERS = `${BASE}/orders-report/main.html`;
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-jitter');
const REPORT = path.join(OUT_DIR, 'chat-page-switch-bug.json');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ts = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

(async () => {
    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-application-cache', '--disk-cache-size=0', '--media-cache-size=0'],
    });
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        bypassCSP: true,
    });
    // Force no-cache on all JS to ensure latest deployed fix
    await ctx.route('**/*.js', (route) => {
        route.continue({
            headers: {
                ...route.request().headers(),
                'cache-control': 'no-cache, no-store, must-revalidate',
                pragma: 'no-cache',
            },
        });
    });
    const page = await ctx.newPage();

    // Capture network requests for chat APIs
    const netLog = [];
    page.on('response', async (res) => {
        const u = res.url();
        if (/by-phone|fb-global-id|fetchConversations|search|conversations|messages/i.test(u)) {
            try {
                const json = await res.json().catch(() => null);
                netLog.push({
                    t: ts(),
                    status: res.status(),
                    url: u.slice(0, 250),
                    body: json ? JSON.stringify(json).slice(0, 500) : null,
                });
            } catch (_) {}
        }
    });

    log('Login');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#username');
    await page.fill('#username', ARGS.user);
    await page.fill('#password', ARGS.pass);
    await page.locator('#password').press('Enter');
    await page
        .waitForFunction(
            () =>
                !/\/n2store\/?$|\/n2store\/index\.html$/.test(location.href) ||
                !!localStorage.getItem('loginindex_auth'),
            { timeout: 30_000 }
        )
        .catch(() => {});
    await page.waitForTimeout(2_000);

    log('Goto orders');
    await page.goto(`${ORDERS}?t=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(4_000);

    const frame = page.frames().find((f) => /tab1-orders\.html/.test(f.url())) || page.mainFrame();

    log('Reset filters');
    await frame.evaluate(() => {
        try {
            window._ptagSetFilter && window._ptagSetFilter(null);
            window.ProcessingTagState?._activeFlagFilters?.clear?.();
            // Clear Ẩn Tag XL filter too
            window._excludePtagXlClearAll?.();
        } catch (_) {}
    });
    await page.waitForTimeout(1_500);

    log('Search SĐT', ARGS.phone);
    // Search input
    await frame.evaluate((p) => {
        const inp = document.querySelector('#searchInput, input[placeholder*="Tìm"]');
        if (inp) {
            inp.focus();
            inp.value = p;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('keyup', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, ARGS.phone);
    await page.waitForTimeout(3_500);

    // Diagnostic: how many rows visible?
    const rowsCount = await frame.evaluate(
        () => document.querySelectorAll('#tableBody tr[data-order-id]').length
    );
    log(`Visible rows after search: ${rowsCount}`);

    log('Open chat modal — find any chat-trigger element');
    const opened = await frame.evaluate(() => {
        const row = document.querySelector('#tableBody tr[data-order-id]');
        if (!row) return { ok: false, reason: 'no row' };
        // Dump all onclick attrs in the row to find chat trigger
        const clickables = Array.from(row.querySelectorAll('[onclick]')).map((el) => ({
            tag: el.tagName,
            cls: (el.className || '').slice(0, 60),
            on: (el.getAttribute('onclick') || '').slice(0, 120),
        }));
        // Look for any onclick mentioning chat / inbox / open
        const trigger = row.querySelector(
            '[onclick*="openChat"], [onclick*="openInbox"], [onclick*="showChat"], [onclick*="Inbox"], .chat-trigger, .messages-cell, [data-column="messages"], [data-column="comments"]'
        );
        if (trigger) {
            try {
                trigger.click();
                return {
                    ok: true,
                    clicked: trigger.tagName + '.' + (trigger.className || '').split(' ')[0],
                };
            } catch (_) {}
        }
        return {
            ok: false,
            reason: 'no chat trigger',
            rowOuterHtml: row.outerHTML.slice(0, 1500),
            clickables,
        };
    });
    log('Open result:', JSON.stringify(opened, null, 2).slice(0, 2000));
    await page.waitForTimeout(3_000);

    // Capture initial chat state
    const initial = await frame.evaluate(() => ({
        currentChatChannelId: window.currentChatChannelId,
        currentChatPSID: window.currentChatPSID,
        currentChatPhone: window.currentChatPhone,
        currentCustomerName: window.currentCustomerName,
        currentConversationId: window.currentConversationId,
        currentConversationType: window.currentConversationType,
        pages: (window.pancakeDataManager?.pages || []).map((p) => ({
            id: String(p.id),
            name: p.name,
        })),
        firstMessages: Array.from(
            document.querySelectorAll(
                '#chatMessages .chat-message-text, #chatMessages .chat-msg, #chatMessages [class*="message"]'
            )
        )
            .slice(0, 6)
            .map((el) => el.textContent.slice(0, 120)),
    }));
    log('INITIAL CHAT STATE:', JSON.stringify(initial, null, 2));

    if (!initial.currentChatChannelId) {
        log('Chat modal did not open with data — bail');
        await page.screenshot({ path: path.join(OUT_DIR, 'chat-debug.png'), fullPage: true });
        await browser.close();
        process.exit(2);
    }

    // Find an alternate page to switch to
    const altPage = (initial.pages || []).find(
        (p) => String(p.id) !== String(initial.currentChatChannelId)
    );
    log('Switching to alternate page:', altPage);

    if (!altPage) {
        log('No alternate page found');
        await browser.close();
        return;
    }

    // Hook _doFindAndLoadConversation path — capture which strategy resolved the conv
    await frame.evaluate(() => {
        window.__bug = { events: [] };
        const origFetch = window.fetch;
        window.fetch = async function (...args) {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            const start = Date.now();
            try {
                const r = await origFetch.apply(this, args);
                const clone = r.clone();
                const json = await clone.json().catch(() => null);
                if (/by-phone|fb-global-id|conversations|search/i.test(url || '')) {
                    window.__bug.events.push({
                        t: Date.now() - start,
                        url: (url || '').slice(0, 200),
                        status: r.status,
                        sample: json ? JSON.stringify(json).slice(0, 400) : null,
                    });
                }
                return r;
            } catch (e) {
                window.__bug.events.push({
                    url: (url || '').slice(0, 200),
                    error: String(e).slice(0, 100),
                });
                throw e;
            }
        };
    });

    log('Switch chat page');
    await frame.evaluate((id) => window.switchChatPage(id), altPage.id);
    await page.waitForTimeout(5_000);

    const afterSwitch = await frame.evaluate(() => ({
        currentChatChannelId: window.currentChatChannelId,
        currentChatPSID: window.currentChatPSID,
        currentChatPhone: window.currentChatPhone,
        currentCustomerName: window.currentCustomerName,
        currentConversationId: window.currentConversationId,
        firstMessages: Array.from(
            document.querySelectorAll(
                '#chatMessages .chat-message-text, #chatMessages .chat-msg, #chatMessages [class*="message"]'
            )
        )
            .slice(0, 8)
            .map((el) => el.textContent.slice(0, 120)),
        bugEvents: window.__bug?.events || [],
    }));
    log('AFTER SWITCH:', JSON.stringify(afterSwitch, null, 2));

    const report = {
        startedAt: ts(),
        phone: ARGS.phone,
        initial,
        altPage,
        afterSwitch,
        netLog: netLog.slice(-30),
    };
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    log('Report →', REPORT);

    // Compare: did conversation belong to same person?
    const sameCustomer =
        initial.currentChatPhone === afterSwitch.currentChatPhone &&
        initial.currentCustomerName === afterSwitch.currentCustomerName;
    const convChanged = initial.currentConversationId !== afterSwitch.currentConversationId;
    log('\n=== VERDICT ===');
    log('  customer phone/name unchanged:', sameCustomer);
    log('  conversationId changed:', convChanged);
    log('  initial first msg:', initial.firstMessages?.[0]?.slice(0, 80));
    log('  after first msg:  ', afterSwitch.firstMessages?.[0]?.slice(0, 80));

    await browser.close();
})().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
