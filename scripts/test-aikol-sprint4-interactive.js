#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Sprint 4 INTERACTIVE smoke test — clicks Sprint 4 flows end-to-end.
//
// 1. Settings: click "Nạp" on Mini pack → expect toast "SePay chưa thiết lập" (503)
// 2. Settings: type chat_id → click "Chỉ lưu (không test)" → expect "Đã lưu" toast
// 3. Bulk: select model → click "🚀 Run Bulk" → expect 404 no_clips_match OR 402 insufficient_credits
// 4. Campaigns: page should show empty state initially
// =====================================================

const { chromium } = require('playwright');

const BASE = process.env.BASE || 'https://nhijudyshop.github.io/n2store';
const USER = process.env.USER_LOGIN || 'aikol-sprint4-test';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((u) => {
        const auth = { userId: u, uid: u, email: `${u}@test.local`, fullName: 'Sprint4 Tester' };
        localStorage.setItem('authData', JSON.stringify(auth));
    }, USER);
    const page = await ctx.newPage();

    const consoleErrs = [];
    page.on('pageerror', (err) => consoleErrs.push({ kind: 'pageerror', msg: err.message }));
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrs.push({ kind: 'console', msg: msg.text() });
    });

    function toastText() {
        return page.evaluate(() => {
            const t = document.querySelector('.aikol-toast');
            return t ? t.textContent.trim() : null;
        });
    }

    async function waitForToast(timeoutMs = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const t = await toastText();
            if (t) return t;
            await page.waitForTimeout(200);
        }
        return null;
    }

    const results = [];
    function rec(name, ok, detail) {
        results.push({ name, ok, detail });
        console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
    }

    // ========== Test 1: settings page ==========
    console.log('\n[smoke4-i] === settings.html — Mini topup (expect 503) ===');
    await page.goto(`${BASE}/aikol-studio/settings.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('#packs-grid .aikol-pack');
    await page.waitForTimeout(800);
    const miniBtn = await page.$(
        '#packs-grid .aikol-pack[data-pack="mini"] button[data-pack="mini"]'
    );
    rec('packs grid loaded', !!miniBtn);
    if (miniBtn) {
        await miniBtn.click();
        const toast = await waitForToast(8000);
        const ok = toast && toast.toLowerCase().includes('sepay');
        rec('topup 503 toast', ok, toast);
    }
    // Wait for prior toast to disappear before next click test.
    await page.waitForTimeout(4500);
    // Test 1b — telegram chat_id save (no test, just save).
    console.log('\n[smoke4-i] === settings.html — Telegram save ===');
    await page.fill('#telegram-chat-id', '999999999');
    await page.uncheck('#notify-error');
    await page.click('#telegram-save-btn');
    const tgToast = await waitForToast(8000);
    rec('telegram save toast', tgToast && /Đã lưu/i.test(tgToast), tgToast);

    // Verify settings persisted via API.
    const persisted = await page.evaluate(async () => {
        const res = await window.AikolAPI.getSettings();
        return res;
    });
    rec(
        'settings persisted',
        persisted.telegram_chat_id === '999999999' && persisted.notify_on_error === false,
        JSON.stringify(persisted)
    );

    // ========== Test 2: bulk page ==========
    console.log('\n[smoke4-i] === bulk.html — preset apply ===');
    await page.goto(`${BASE}/aikol-studio/bulk.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('#bulk-form');
    await page.waitForTimeout(1500);
    const preset = await page.$('[data-preset="favorites_image"]');
    rec('bulk presets loaded', !!preset);
    await preset.click();
    await page.waitForTimeout(400);
    const variations = await page.$eval('[name="variations"]', (el) => parseInt(el.value, 10));
    const favOnly = await page.$eval('[name="favorite_only"]', (el) => el.checked);
    rec(
        'preset applied (variations=1, fav_only=true)',
        variations === 1 && favOnly === true,
        `variations=${variations} fav=${favOnly}`
    );

    const cost = await page.$eval('#bulk-cost-summary', (el) => el.textContent);
    rec('cost summary updates', /\d+ cr.*clips.*\d+ cr/.test(cost), cost);

    // ========== Test 3: campaigns page ==========
    console.log('\n[smoke4-i] === campaigns.html — empty state ===');
    await page.goto(`${BASE}/aikol-studio/campaigns.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('#campaigns-empty');
    await page.waitForTimeout(1500);
    const emptyVisible = await page.$eval(
        '#campaigns-empty',
        (el) => getComputedStyle(el).display !== 'none'
    );
    rec('campaigns empty state shown when no campaigns', emptyVisible);

    // Create a campaign via API, then check it appears in the UI.
    console.log('\n[smoke4-i] === campaigns.html — create + render ===');

    // Need a model first — try to create one programmatically.
    const modelStatus = await page.evaluate(async () => {
        const ms = await window.AikolAPI.listModels();
        if (ms.models?.length) return { existing: ms.models[0].id };
        // Upload a placeholder model.
        const imgRes = await fetch('https://placehold.co/512x768/png?text=Test4');
        const buf = await imgRes.arrayBuffer();
        const fd = new FormData();
        fd.append('name', 'Sprint4 Browser Test Model');
        fd.append('file', new Blob([buf], { type: 'image/png' }), 'test.png');
        const res = await fetch(`${window.AikolAPI.endpoint}/models`, {
            method: 'POST',
            headers: { 'X-User-Id': 'aikol-sprint4-test' },
            body: fd,
        });
        const data = await res.json();
        return { created: data.id };
    });
    console.log('  model:', modelStatus);
    const modelId = modelStatus.existing || modelStatus.created;
    rec('model resolved', !!modelId, String(modelId));

    if (modelId) {
        const created = await page.evaluate(
            async (modelId) =>
                window.AikolAPI.createCampaign({
                    name: 'Smoke Test Campaign',
                    platform: 'tiktok',
                    favorite_only: true,
                    model_id: modelId,
                    kind: 'image',
                    config: { variations: 1 },
                }).catch((e) => ({ error: e.message })),
            modelId
        );
        console.log('  created:', created);
        rec('campaign create OK', !!created.id, JSON.stringify(created).slice(0, 200));

        // Reload campaigns page, expect 1 card.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        const cardCount = await page.$$eval(
            '#campaigns-list .aikol-campaign-card',
            (els) => els.length
        );
        rec('campaign card rendered', cardCount === 1, `count=${cardCount}`);

        // Run campaign — expect 404 no_clips_match (no clips for this user).
        await page.evaluate(async (id) => {
            try {
                await window.AikolAPI.runCampaign(id, { limit: 5 });
            } catch (e) {
                window.__lastError = e.data?.detail || e.message;
            }
        }, created.id);
        await page.waitForTimeout(2000);
        const lastErr = await page.evaluate(() => window.__lastError);
        rec(
            'campaign run with no clips → no_clips_match',
            lastErr && /clip|match/i.test(lastErr),
            String(lastErr).slice(0, 100)
        );

        // Cleanup.
        await page.evaluate(
            async (id) => window.AikolAPI.deleteCampaign(id).catch(() => {}),
            created.id
        );
    }

    console.log('\n========== SUMMARY ==========');
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log(`Passed: ${passed} / ${results.length}`);
    if (failed > 0) {
        console.log('FAILED:');
        results.filter((r) => !r.ok).forEach((r) => console.log(`  ❌ ${r.name}`));
    }

    // Filter known-ok console errors.
    const realErrs = consoleErrs.filter(
        (e) =>
            !/401|404|503|favicon|lucide|sepay_not_configured/i.test(e.msg) &&
            !/X-User-Id/i.test(e.msg) && // pre-auth-shim noise
            !/Failed to load resource/i.test(e.msg)
    );
    console.log(`\nConsole errors (filtered): ${realErrs.length}`);
    realErrs.forEach((e) => console.log(`  [${e.kind}] ${e.msg.slice(0, 200)}`));
    console.log('==============================');

    await browser.close();
    process.exit(failed > 0 || realErrs.length > 0 ? 1 : 0);
})();
